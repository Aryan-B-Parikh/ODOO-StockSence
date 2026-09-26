/**
 * StockSense — shared server-side portfolio computation.
 *
 * The paper portfolio starts from CASH_SEED ($100,000). Cash and open
 * positions are folded from the FULL transaction history (chronologically)
 * using the average-cost method:
 *   cash       = CASH_SEED + Σ(sell proceeds − fees) − Σ(buy costs + fees)
 *   avgCost    = weighted average BUY fill price (fees excluded from basis)
 *   costBasis  = avgCost × current quantity
 *
 * Used by /api/portfolio, /api/portfolio/trade, /api/portfolio/transaction/[id]
 * and /api/portfolio/history.
 */

import type { Transaction } from '@prisma/client'
import { db } from '@/lib/db'
import { addDays, dateKeyToDate, getCloseOn, getQuote, utcDateKey } from '@/lib/market/engine'
import {
  CASH_SEED,
  type HoldingDTO,
  type PortfolioDTO,
  type TransactionDTO,
} from '@/lib/types'

export type Tx = Pick<
  Transaction,
  'id' | 'symbol' | 'side' | 'quantity' | 'price' | 'fee' | 'executedAt'
>

export interface Position {
  symbol: string
  quantity: number
  avgCost: number
  costBasis: number
}

export interface PositionsSnapshot {
  cash: number
  positions: Map<string, Position>
}

function round(x: number, dp = 2): number {
  const f = Math.pow(10, dp)
  return Math.round(x * f) / f
}

/**
 * Fold all transactions (any order) into a snapshot of cash + open positions.
 * When `cutoff` (epoch ms) is provided, only trades executed at/before it are
 * applied — used for the historical value series.
 */
export function foldTransactions(txs: Tx[], cutoff?: number): PositionsSnapshot {
  const sorted = [...txs].sort(
    (a, b) => a.executedAt.getTime() - b.executedAt.getTime() || a.id - b.id,
  )
  let cash = CASH_SEED
  const positions = new Map<string, Position>()

  for (const tx of sorted) {
    if (cutoff !== undefined && tx.executedAt.getTime() > cutoff) continue
    const pos =
      positions.get(tx.symbol) ?? { symbol: tx.symbol, quantity: 0, avgCost: 0, costBasis: 0 }

    if (tx.side === 'BUY') {
      cash -= tx.quantity * tx.price + tx.fee
      pos.quantity += tx.quantity
      pos.costBasis += tx.quantity * tx.price
      pos.avgCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0
    } else if (tx.side === 'SELL') {
      cash += tx.quantity * tx.price - tx.fee
      const soldQty = Math.min(tx.quantity, pos.quantity)
      pos.quantity -= soldQty
      pos.costBasis = round(pos.avgCost * pos.quantity, 6)
      if (pos.quantity <= 1e-9) {
        pos.quantity = 0
        pos.costBasis = 0
        pos.avgCost = 0
      }
    }
    positions.set(tx.symbol, pos)
  }

  return { cash, positions }
}

/** Current snapshot from the DB (all transactions, no cutoff). */
export async function getPositionsSnapshot(): Promise<PositionsSnapshot> {
  const txs = await db.transaction.findMany()
  return foldTransactions(txs)
}

/** Map a DB row to the API TransactionDTO. */
export function toTransactionDTO(tx: Transaction): TransactionDTO {
  return {
    id: tx.id,
    symbol: tx.symbol,
    side: tx.side === 'SELL' ? 'SELL' : 'BUY',
    quantity: tx.quantity,
    price: tx.price,
    fee: tx.fee,
    note: tx.note,
    executedAt: tx.executedAt.toISOString(),
  }
}

/** Full portfolio DTO: summary + live holdings + latest 50 transactions. */
export async function computePortfolio(): Promise<PortfolioDTO> {
  const all = await db.transaction.findMany()
  const snap = foldTransactions(all)

  const holdings: HoldingDTO[] = []
  let positionsValue = 0
  for (const pos of snap.positions.values()) {
    if (pos.quantity <= 1e-9) continue
    const quote = getQuote(pos.symbol)
    if (!quote) continue
    const marketValue = pos.quantity * quote.price
    positionsValue += marketValue
    holdings.push({
      symbol: pos.symbol,
      name: quote.name,
      quantity: round(pos.quantity, 4),
      avgCost: round(pos.avgCost),
      costBasis: round(pos.costBasis),
      marketValue: round(marketValue),
      dayChange: round(pos.quantity * (quote.price - quote.prevClose)),
      dayChangePct: quote.changePct,
      pnl: round(marketValue - pos.costBasis),
      pnlPct: pos.costBasis > 0 ? round(((marketValue - pos.costBasis) / pos.costBasis) * 100) : 0,
      allocation: 0,
      quote,
    })
  }
  holdings.sort((a, b) => b.marketValue - a.marketValue)
  for (const h of holdings) {
    h.allocation = positionsValue > 0 ? round((h.marketValue / positionsValue) * 100) : 0
  }

  const cash = snap.cash
  const totalValue = cash + positionsValue
  const totalCost = holdings.reduce((a, h) => a + h.costBasis, 0)
  const dayChange = holdings.reduce((a, h) => a + h.dayChange, 0)
  const prevValue = totalValue - dayChange
  const totalPnl = totalValue - CASH_SEED

  const sortedByPnl = [...holdings].sort((a, b) => b.pnlPct - a.pnlPct)

  const latest = [...all]
    .sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime() || b.id - a.id)
    .slice(0, 50)
    .map(toTransactionDTO)

  return {
    summary: {
      cash: round(cash),
      totalValue: round(totalValue),
      positionsValue: round(positionsValue),
      totalCost: round(totalCost),
      dayChange: round(dayChange),
      dayChangePct: prevValue > 0 ? round((dayChange / prevValue) * 100) : 0,
      totalPnl: round(totalPnl),
      totalPnlPct: round((totalPnl / CASH_SEED) * 100),
      seedCapital: CASH_SEED,
      positionsCount: holdings.length,
      best: sortedByPnl.length > 0 ? { symbol: sortedByPnl[0].symbol, pnlPct: sortedByPnl[0].pnlPct } : null,
      worst:
        sortedByPnl.length > 0
          ? {
              symbol: sortedByPnl[sortedByPnl.length - 1].symbol,
              pnlPct: sortedByPnl[sortedByPnl.length - 1].pnlPct,
            }
          : null,
    },
    holdings,
    transactions: latest,
  }
}

/**
 * Daily total-value series for the past `days` days (UTC dateKeys).
 * For each day: cash = seed + P&L of all trades executed ≤ end-of-day;
 * positions valued at that day's close (live price for today).
 * The final point is the live "now" snapshot.
 */
export async function computeHistorySeries(days: number): Promise<{ t: number; value: number }[]> {
  const all = await db.transaction.findMany()
  const now = Date.now()
  const todayKey = utcDateKey(new Date())
  const points: { t: number; value: number }[] = []

  for (let i = Math.max(0, days - 1); i >= 0; i--) {
    const key = addDays(todayKey, -i)
    const isToday = key === todayKey
    const cutoff = isToday ? now : dateKeyToDate(key).getTime() + 86_400_000 - 1
    const { cash, positions } = foldTransactions(all, cutoff)

    let value = cash
    for (const pos of positions.values()) {
      if (pos.quantity <= 1e-9) continue
      value += pos.quantity * getCloseOn(pos.symbol, key)
    }
    points.push({ t: isToday ? now : dateKeyToDate(key).getTime(), value: round(value) })
  }

  return points
}
