/**
 * StockSense — watchlist helpers shared by /api/watchlist routes.
 */

import type { WatchItem } from '@prisma/client'
import { getQuote } from '@/lib/market/engine'
import type { WatchItemDTO } from '@/lib/types'

/** WatchItemDTO plus computed alert-triggered flags. */
export interface WatchItemWithFlags extends WatchItemDTO {
  alertAboveHit: boolean
  alertBelowHit: boolean
}

/** Map a DB WatchItem row to the API DTO (live quote + alert flags). */
export function toWatchItemDTO(row: WatchItem): WatchItemWithFlags | null {
  const quote = getQuote(row.symbol)
  if (!quote) return null
  return {
    symbol: row.symbol,
    note: row.note,
    alertAbove: row.alertAbove,
    alertBelow: row.alertBelow,
    quote,
    alertAboveHit: row.alertAbove !== null && quote.price >= row.alertAbove,
    alertBelowHit: row.alertBelow !== null && quote.price <= row.alertBelow,
  }
}
