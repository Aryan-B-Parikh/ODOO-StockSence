/**
 * StockSense — Demand forecasting from the immutable ledger (Phase 3+).
 *
 * The reorder engine used to trust the hand-entered `Product.dailyUsage`
 * figure. This module computes what actually happened: every unit that
 * physically left the warehouse on a packed/delivered order writes a negative
 * ON_HAND ledger entry under docType 'DELIVERY'. Summing those over a rolling
 * window gives observed demand, which is then blended with the planning figure
 * (as a pseudo-count prior) so a handful of early shipments can't swing the
 * number wildly and a product with no history falls back to its plan.
 *
 * No randomness, no model, no AI — just the movement history the system has
 * been recording since Phase 0.
 */

import type { Tx } from '@/lib/inventory'
import type { DemandForecastDTO } from '@/lib/types'

/** Rolling window (days) the observed demand is averaged over. */
export const DEMAND_WINDOW_DAYS = 28
/** Weight (in days) given to the editable plan when blending with observations. */
const PLAN_PRIOR_DAYS = 7

export interface DemandForecast extends DemandForecastDTO {
  productId: number
  planDaily: number // Product.dailyUsage (editable plan)
  dailyUsage: number // blended figure handed to the reorder engine
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * Compute a demand forecast per active product from real delivery outflows.
 * Always returns an entry for every active product (falling back to the plan).
 */
export async function computeDemandForecasts(tx: Tx, at: Date = new Date()): Promise<Map<number, DemandForecast>> {
  const since = new Date(at.getTime() - DEMAND_WINDOW_DAYS * 86400000)

  // Units that physically left on delivered/packed orders, grouped per product.
  const outflow = await tx.ledgerEntry.groupBy({
    by: ['productId'],
    where: {
      docType: 'DELIVERY',
      field: 'ON_HAND',
      diff: { lt: 0 },
      createdAt: { gte: since },
    },
    _sum: { diff: true },
    _count: { _all: true },
  })
  const observed = new Map(
    outflow.map((r) => [r.productId, { unitsOut: Math.abs(r._sum.diff ?? 0), deliveries: r._count._all }])
  )

  const products = await tx.product.findMany({ where: { active: true }, select: { id: true, dailyUsage: true } })

  const out = new Map<number, DemandForecast>()
  for (const p of products) {
    const o = observed.get(p.id)
    if (o && o.deliveries > 0) {
      const observedDaily = o.unitsOut / DEMAND_WINDOW_DAYS
      const blended =
        (observedDaily * DEMAND_WINDOW_DAYS + p.dailyUsage * PLAN_PRIOR_DAYS) /
        (DEMAND_WINDOW_DAYS + PLAN_PRIOR_DAYS)
      out.set(p.id, {
        productId: p.id,
        planDaily: p.dailyUsage,
        dailyUsage: round3(blended),
        observedDaily: round3(observedDaily),
        unitsOut: round3(o.unitsOut),
        deliveries: o.deliveries,
        windowDays: DEMAND_WINDOW_DAYS,
        measured: true,
        method: `${DEMAND_WINDOW_DAYS}-day observed delivery demand, blended with the ${p.dailyUsage}/day plan`,
      })
    } else {
      out.set(p.id, {
        productId: p.id,
        planDaily: p.dailyUsage,
        dailyUsage: p.dailyUsage,
        observedDaily: 0,
        unitsOut: 0,
        deliveries: 0,
        windowDays: DEMAND_WINDOW_DAYS,
        measured: false,
        method: `No deliveries in the last ${DEMAND_WINDOW_DAYS} days — using the planning figure`,
      })
    }
  }
  return out
}
