/**
 * StockSense — Measured supplier scorecards (Phase 3+).
 *
 * The Supplier model ships editable `reliability` / `damageRate` fields — a
 * planner's estimate. This module replaces those estimates with what the
 * warehouse actually experienced, computed straight from immutable records:
 *
 *  • on-time rate  — received receipts whose `receivedAt` landed on/before the
 *                    expected date (calendar-day granularity).
 *  • damage rate   — damaged units ÷ received units. Damage is read from the
 *                    ledger (docType RECEIPT, field DAMAGED, diff > 0) because
 *                    ReceiptLine only stores the accepted good quantity.
 *  • avg lead days — PO created → received, averaged across received receipts.
 *
 * No receipt history → `measured: false` and the UI falls back to the plan.
 */

import type { Tx } from '@/lib/inventory'
import type { SupplierScorecardDTO } from '@/lib/types'

function endOfUtcDay(d: Date): number {
  const x = new Date(d)
  x.setUTCHours(23, 59, 59, 999)
  return x.getTime()
}

export function emptyScorecard(): SupplierScorecardDTO {
  return {
    receipts: 0,
    onTimeRate: null,
    damageRate: null,
    avgLeadDays: null,
    measured: false,
    basis: 'No received receipts yet — showing the planning estimate',
  }
}

/**
 * Batch-compute scorecards for a set of suppliers in two queries total
 * (one receipt fetch, one ledger aggregate) — safe to call from list routes.
 */
export async function computeSupplierScorecards(
  tx: Tx,
  supplierIds: number[]
): Promise<Map<number, SupplierScorecardDTO>> {
  const ids = [...new Set(supplierIds.filter((id) => Number.isFinite(id)))]
  const result = new Map<number, SupplierScorecardDTO>()
  if (ids.length === 0) return result

  const receipts = await tx.receipt.findMany({
    where: { supplierId: { in: ids }, status: 'RECEIVED' },
    select: {
      supplierId: true,
      code: true,
      expectedAt: true,
      receivedAt: true,
      createdAt: true,
      lines: { select: { receivedQty: true } },
    },
  })

  const codes = receipts.map((r) => r.code)
  const damagedRows = codes.length
    ? await tx.ledgerEntry.findMany({
        where: { docType: 'RECEIPT', docCode: { in: codes }, field: 'DAMAGED', diff: { gt: 0 } },
        select: { docCode: true, diff: true },
      })
    : []
  const damagedByCode = new Map<string, number>()
  for (const row of damagedRows) {
    damagedByCode.set(row.docCode, (damagedByCode.get(row.docCode) ?? 0) + row.diff)
  }

  for (const id of ids) {
    const rows = receipts.filter((r) => r.supplierId === id)
    if (rows.length === 0) {
      result.set(id, emptyScorecard())
      continue
    }

    let onTime = 0
    let receivedUnits = 0
    let damagedUnits = 0
    let leadSum = 0
    let leadCount = 0

    for (const r of rows) {
      if (r.receivedAt && r.receivedAt.getTime() <= endOfUtcDay(r.expectedAt)) onTime += 1
      receivedUnits += r.lines.reduce((a, l) => a + (l.receivedQty ?? 0), 0)
      damagedUnits += damagedByCode.get(r.code) ?? 0
      if (r.receivedAt) {
        leadSum += (r.receivedAt.getTime() - r.createdAt.getTime()) / 86400000
        leadCount += 1
      }
    }

    result.set(id, {
      receipts: rows.length,
      onTimeRate: onTime / rows.length,
      damageRate: receivedUnits > 0 ? Math.min(1, damagedUnits / receivedUnits) : null,
      avgLeadDays: leadCount > 0 ? Math.round((leadSum / leadCount) * 10) / 10 : null,
      measured: true,
      basis: `Measured from ${rows.length} received receipt${rows.length === 1 ? '' : 's'}`,
    })
  }

  return result
}

/** Single-supplier convenience wrapper. */
export async function computeSupplierScorecard(tx: Tx, supplierId: number): Promise<SupplierScorecardDTO> {
  const map = await computeSupplierScorecards(tx, [supplierId])
  return map.get(supplierId) ?? emptyScorecard()
}
