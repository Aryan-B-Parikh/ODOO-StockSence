/**
 * StockSense API — shared helpers for route handlers.
 * Lives under the private `_lib` folder (underscore prefix → not routable).
 */
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { computeNeeds } from '@/lib/inventory'
import { toSuggestionDTO } from '@/lib/mappers'
import type { ReorderSuggestionDTO } from '@/lib/types'
import type { Prisma } from '@prisma/client'

export type SuggestionRow = Prisma.ReorderSuggestionGetPayload<{ include: { product: { include: { stocks: true } } } }>

/** Parse a JSON request body → 400 on malformed JSON. */
export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

/** Coerce an unknown value to a finite number → 400 otherwise. */
export function toNum(value: unknown, field: string): number {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new HttpError(400, `Invalid number for "${field}"`)
  return n
}

/** Coerce an unknown value to a valid Date → 400 otherwise. */
export function toDate(value: unknown, field: string): Date {
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `Invalid date for "${field}"`)
  return d
}

/** Numeric route param → number (404 when malformed). */
export function numericParam(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new HttpError(404, 'Not found')
  return n
}

/** All stock levels keyed `${productId}:${locationId}` — one fetch per request. */
export async function fetchStockMap(): Promise<Map<string, { onHand: number; reserved: number }>> {
  const rows = await db.stockLevel.findMany({ select: { productId: true, locationId: true, onHand: true, reserved: true } })
  return new Map(rows.map((s) => [`${s.productId}:${s.locationId}`, { onHand: s.onHand, reserved: s.reserved }]))
}

/** User ids → display names — one fetch per request (for createdByName/performedByName). */
export async function fetchUserNameMap(ids: (number | null | undefined)[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((x): x is number => x != null))]
  if (unique.length === 0) return new Map()
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } })
  return new Map(users.map((u) => [u.id, u.name]))
}

/**
 * ReorderSuggestion rows → DTOs: live needs from computeNeeds (onHand/reserved/
 * incoming/projectedAvailable) + preferred-supplier link's minOrderQty/orderMultiple.
 */
export async function mapSuggestions(rows: SuggestionRow[]): Promise<ReorderSuggestionDTO[]> {
  const [needs, links] = await Promise.all([
    computeNeeds(db),
    db.productSupplier.findMany({ include: { supplier: true } }),
  ])
  const needById = new Map(needs.map((n) => [n.productId, n]))
  const linkByKey = new Map(links.map((l) => [`${l.productId}:${l.supplier.name}`, l]))
  return rows.map((s) => {
    const dto = toSuggestionDTO(s, needById.get(s.productId))
    const link = linkByKey.get(`${s.productId}:${s.preferredName}`)
    return { ...dto, minOrderQty: link?.minOrderQty ?? 0, orderMultiple: link?.orderMultiple ?? 1 }
  })
}
