/**
 * StockSense — Inventory Engine (Phase 0/1 core + Phase 3/4 intelligence).
 *
 * Design decisions per the Implementation Plan:
 *  • Split quantities per SKU/location: onHand / reserved / incoming / inTransit / damaged.
 *    available := onHand − reserved (what screens show — nobody can promise units
 *    another order has already claimed).
 *  • Every stock-changing action is a single, uninterruptible check-then-update step
 *    against these states (all mutations run inside one Prisma interactive transaction).
 *  • An immutable, ID'd event ledger entry references the document it came from
 *    (RCPT-…/DEL-…/TRF-…/ADJ-…/CNT-…/OPENING) with previous qty, new qty and the diff.
 *  • Severity rules (Phase 4): LOW <2% auto-logged · MEDIUM 2–15% or repeated mismatch
 *    (flagged for review) · HIGH >15% held for approval · CRITICAL below-zero blocked outright.
 *
 * Every function takes a Prisma client / transaction client as first argument so both
 * API routes (db.$transaction) and the seed script (db) share identical behaviour.
 */

import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import type { Prisma, PrismaClient } from '@prisma/client'

export type Tx = Prisma.TransactionClient | PrismaClient

// ---------------------------------------------------------------------------
// Document & ledger code generation
// ---------------------------------------------------------------------------

const DOC_PREFIX: Record<'receipt' | 'deliveryOrder' | 'transfer' | 'adjustment' | 'cycleCount', { prefix: string; start: number }> = {
  receipt: { prefix: 'RCPT-', start: 1000 },
  deliveryOrder: { prefix: 'DEL-', start: 2000 },
  transfer: { prefix: 'TRF-', start: 500 },
  adjustment: { prefix: 'ADJ-', start: 900 },
  cycleCount: { prefix: 'CNT-', start: 40 },
}

async function nextDocCode(tx: Tx, model: keyof typeof DOC_PREFIX): Promise<string> {
  const { prefix, start } = DOC_PREFIX[model]
  let codes: string[] = []
  if (model === 'receipt') codes = (await tx.receipt.findMany({ select: { code: true } })).map((r) => r.code)
  else if (model === 'deliveryOrder') codes = (await tx.deliveryOrder.findMany({ select: { code: true } })).map((r) => r.code)
  else if (model === 'transfer') codes = (await tx.transfer.findMany({ select: { code: true } })).map((r) => r.code)
  else if (model === 'adjustment') codes = (await tx.adjustment.findMany({ select: { code: true } })).map((r) => r.code)
  else codes = (await tx.cycleCount.findMany({ select: { code: true } })).map((r) => r.code)
  let max = start
  for (const c of codes) {
    const n = parseInt(c.slice(prefix.length), 10)
    if (!isNaN(n) && n > max) max = n
  }
  return `${prefix}${max + 1}`
}

async function nextLedgerCode(tx: Tx, at: Date = new Date()): Promise<string> {
  const year = at.getUTCFullYear()
  const prefix = `LEDGER-${year}-`
  const rows = await tx.ledgerEntry.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } })
  let max = 0
  for (const r of rows) {
    const n = parseInt(r.code.slice(prefix.length), 10)
    if (!isNaN(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(6, '0')}`
}

// ---------------------------------------------------------------------------
// Stock access + atomic bump (posts ledger entries for every field change)
// ---------------------------------------------------------------------------

export interface LedgerCtx {
  docType: 'RECEIPT' | 'DELIVERY' | 'TRANSFER' | 'ADJUSTMENT' | 'COUNT' | 'OPENING'
  docCode: string
  reason?: string
  performedBy?: number | null
  approvedBy?: number | null
  at?: Date
}

export interface StockDeltas {
  onHand?: number
  reserved?: number
  incoming?: number
  inTransit?: number
  damaged?: number
}

export async function getStock(tx: Tx, productId: number, locationId: number) {
  return tx.stockLevel.findUnique({ where: { productId_locationId: { productId, locationId } } })
}

export async function getStockOrThrow(tx: Tx, productId: number, locationId: number) {
  const row = await getStock(tx, productId, locationId)
  if (!row) throw new HttpError(404, `No stock record for product ${productId} at location ${locationId}`)
  return row
}

const FIELD_LABEL: Record<keyof StockDeltas, string> = {
  onHand: 'ON_HAND',
  reserved: 'RESERVED',
  incoming: 'INCOMING',
  inTransit: 'IN_TRANSIT',
  damaged: 'DAMAGED',
}

/**
 * The single place where stock quantities change. Reads current values, applies
 * deltas, refuses anything that would take a quantity below zero (engine-level
 * guarantee), upserts the row and posts one immutable ledger entry per field.
 */
export async function bumpStock(
  tx: Tx,
  productId: number,
  locationId: number,
  deltas: StockDeltas,
  ctx: LedgerCtx
): Promise<{ onHand: number; reserved: number; incoming: number; inTransit: number; damaged: number }> {
  const current = (await getStock(tx, productId, locationId)) ?? { onHand: 0, reserved: 0, incoming: 0, inTransit: 0, damaged: 0 }
  const next = { ...current }
  const applied: { field: keyof StockDeltas; prev: number; newQty: number; diff: number }[] = []

  for (const field of Object.keys(FIELD_LABEL) as (keyof StockDeltas)[]) {
    const delta = deltas[field] ?? 0
    if (delta === 0) continue
    const prev = next[field]
    const newQty = Math.round((prev + delta) * 1000) / 1000
    if (newQty < 0) {
      throw new HttpError(
        422,
        `Blocked: this change would take ${field} below zero at this location ` +
          `(current ${prev}, applied ${delta >= 0 ? '+' : ''}${delta}). ` +
          `Stock can never be promised twice or go negative.`,
        'CRITICAL'
      )
    }
    next[field] = newQty
    applied.push({ field, prev, newQty, diff: newQty - prev })
  }

  if (applied.length > 0) {
    await tx.stockLevel.upsert({
      where: { productId_locationId: { productId, locationId } },
      create: { productId, locationId, ...next },
      update: next,
    })
    for (const a of applied) {
      await tx.ledgerEntry.create({
        data: {
          code: await nextLedgerCode(tx, ctx.at),
          docType: ctx.docType,
          docCode: ctx.docCode,
          productId,
          locationId,
          field: FIELD_LABEL[a.field],
          prevQty: a.prev,
          newQty: a.newQty,
          diff: a.diff,
          reason: ctx.reason ?? null,
          performedBy: ctx.performedBy ?? null,
          approvedBy: ctx.approvedBy ?? null,
          ...(ctx.at ? { createdAt: ctx.at } : {}),
        },
      })
    }
  }
  return next
}

async function assertProduct(tx: Tx, productId: number) {
  const p = await tx.product.findUnique({ where: { id: productId } })
  if (!p) throw new HttpError(404, `Unknown product id ${productId}`)
  return p
}

async function assertLocation(tx: Tx, locationId: number) {
  const l = await tx.location.findUnique({ where: { id: locationId }, include: { rack: { include: { zone: true } } } })
  if (!l) throw new HttpError(404, `Unknown location id ${locationId}`)
  return l
}

/** available := onHand − reserved — the figure every screen must show. */
export function availableOf(s: { onHand: number; reserved: number } | null | undefined): number {
  return (s?.onHand ?? 0) - (s?.reserved ?? 0)
}

// ---------------------------------------------------------------------------
// Receipts — Expected → Received → Available
// ---------------------------------------------------------------------------

export interface ReceiptLineInput {
  productId: number
  locationId: number
  expectedQty: number
}

export async function createReceipt(
  tx: Tx,
  input: { supplierId?: number | null; warehouseId?: number | null; expectedAt?: string; note?: string | null; lines: ReceiptLineInput[] },
  userId: number
) {
  if (!input.lines?.length) throw new HttpError(400, 'A receipt needs at least one line')
  for (const l of input.lines) {
    if (!(l.expectedQty > 0)) throw new HttpError(400, 'Expected quantities must be positive')
    await assertProduct(tx, l.productId)
    await assertLocation(tx, l.locationId)
  }
  const supplier = input.supplierId ? await tx.supplier.findUnique({ where: { id: input.supplierId } }) : null
  if (input.supplierId && !supplier) throw new HttpError(404, `Unknown supplier id ${input.supplierId}`)
  const code = await nextDocCode(tx, 'receipt')
  const receipt = await tx.receipt.create({
    data: {
      code,
      supplierId: supplier?.id ?? null,
      warehouseId: input.warehouseId ?? (await tx.warehouse.findFirst())!.id,
      status: 'EXPECTED',
      expectedAt: input.expectedAt ? new Date(input.expectedAt) : new Date(Date.now() + 3 * 86400000),
      note: input.note ?? null,
      createdBy: userId,
      lines: { create: input.lines.map((l) => ({ productId: l.productId, locationId: l.locationId, expectedQty: l.expectedQty })) },
    },
  })
  for (const l of input.lines) {
    await bumpStock(tx, l.productId, l.locationId, { incoming: l.expectedQty }, {
      docType: 'RECEIPT',
      docCode: code,
      reason: `Receipt ${code} expected${supplier ? ` from ${supplier.name}` : ''}`,
      performedBy: userId,
    })
  }
  return receipt
}

export async function receiveReceipt(
  tx: Tx,
  receiptId: number,
  input: { lines: { lineId: number; receivedQty: number; damagedQty?: number }[]; note?: string | null },
  userId: number
) {
  const receipt = await tx.receipt.findUnique({ where: { id: receiptId }, include: { lines: true, supplier: true } })
  if (!receipt) throw new HttpError(404, 'Receipt not found')
  if (receipt.status !== 'EXPECTED') throw new HttpError(400, `Receipt is ${receipt.status}, only EXPECTED receipts can be received`)
  const byId = new Map(input.lines.map((l) => [l.lineId, l]))
  for (const line of receipt.lines) {
    const given = byId.get(line.id)
    if (!given) throw new HttpError(400, `Missing received quantity for line ${line.id} (${line.productId})`)
    const damaged = Math.max(0, given.damagedQty ?? 0)
    const good = Math.max(0, given.receivedQty) - damaged
    await bumpStock(tx, line.productId, line.locationId, { incoming: -line.expectedQty, onHand: good, ...(damaged > 0 ? { damaged } : {}) }, {
      docType: 'RECEIPT',
      docCode: receipt.code,
      reason: `Receipt ${receipt.code} received${receipt.supplier ? ` from ${receipt.supplier.name}` : ''}` +
        (given.receivedQty !== line.expectedQty ? ` — variance: expected ${line.expectedQty}, received ${given.receivedQty}` : ''),
      performedBy: userId,
    })
    await tx.receiptLine.update({ where: { id: line.id }, data: { receivedQty: Math.max(0, given.receivedQty) } })
  }
  return tx.receipt.update({
    where: { id: receiptId },
    data: { status: 'RECEIVED', receivedAt: new Date(), note: input.note ?? receipt.note },
  })
}

export async function cancelReceipt(tx: Tx, receiptId: number, userId: number) {
  const receipt = await tx.receipt.findUnique({ where: { id: receiptId }, include: { lines: true } })
  if (!receipt) throw new HttpError(404, 'Receipt not found')
  if (receipt.status !== 'EXPECTED') throw new HttpError(400, 'Only EXPECTED receipts can be cancelled')
  for (const line of receipt.lines) {
    await bumpStock(tx, line.productId, line.locationId, { incoming: -line.expectedQty }, {
      docType: 'RECEIPT',
      docCode: receipt.code,
      reason: `Receipt ${receipt.code} cancelled — incoming expectation released`,
      performedBy: userId,
    })
  }
  return tx.receipt.update({ where: { id: receiptId }, data: { status: 'CANCELLED' } })
}

// ---------------------------------------------------------------------------
// Delivery orders — Available → Reserved → Picked → Packed → Delivered
// Stock is reserved the moment the order is created and only deducted once packed:
// "order created" and "stock physically left the warehouse" are never the same thing.
// ---------------------------------------------------------------------------

export async function createDelivery(
  tx: Tx,
  input: { customer: string; note?: string | null; lines: { productId: number; locationId: number; qty: number }[] },
  userId: number
) {
  if (!input.customer?.trim()) throw new HttpError(400, 'Customer name is required')
  if (!input.lines?.length) throw new HttpError(400, 'A delivery order needs at least one line')
  for (const l of input.lines) {
    await assertProduct(tx, l.productId)
    await assertLocation(tx, l.locationId)
    if (!(l.qty > 0)) throw new HttpError(400, 'Quantities must be positive')
    const stock = await getStock(tx, l.productId, l.locationId)
    const available = availableOf(stock)
    if (l.qty > available) {
      const p = await tx.product.findUnique({ where: { id: l.productId } })
      throw new HttpError(
        400,
        `Insufficient available stock for ${p?.sku} at this location: available ${available}, requested ${l.qty}. ` +
          `Units already reserved by other orders can never be promised twice.`
      )
    }
  }
  const code = await nextDocCode(tx, 'deliveryOrder')
  const order = await tx.deliveryOrder.create({
    data: {
      code,
      customer: input.customer.trim(),
      status: 'RESERVED',
      note: input.note ?? null,
      createdBy: userId,
      lines: { create: input.lines.map((l) => ({ productId: l.productId, locationId: l.locationId, qty: l.qty })) },
    },
  })
  for (const l of input.lines) {
    await bumpStock(tx, l.productId, l.locationId, { reserved: l.qty }, {
      docType: 'DELIVERY',
      docCode: code,
      reason: `Delivery ${code} created for ${input.customer.trim()} — stock reserved`,
      performedBy: userId,
    })
  }
  return order
}

export async function markDeliveryPicked(tx: Tx, orderId: number, userId: number) {
  const order = await tx.deliveryOrder.findUnique({ where: { id: orderId } })
  if (!order) throw new HttpError(404, 'Delivery order not found')
  if (order.status !== 'RESERVED') throw new HttpError(400, `Order is ${order.status}; only RESERVED orders can be marked picked`)
  return tx.deliveryOrder.update({ where: { id: orderId }, data: { status: 'PICKED', pickedAt: new Date() } })
}

export async function markDeliveryPacked(tx: Tx, orderId: number, userId: number) {
  const order = await tx.deliveryOrder.findUnique({ where: { id: orderId }, include: { lines: true } })
  if (!order) throw new HttpError(404, 'Delivery order not found')
  if (order.status !== 'RESERVED' && order.status !== 'PICKED') {
    throw new HttpError(400, `Order is ${order.status}; only RESERVED or PICKED orders can be marked packed`)
  }
  for (const line of order.lines) {
    await bumpStock(tx, line.productId, line.locationId, { onHand: -line.qty, reserved: -line.qty }, {
      docType: 'DELIVERY',
      docCode: order.code,
      reason: `Delivery ${order.code} packed for ${order.customer} — stock physically left the warehouse`,
      performedBy: userId,
    })
    await tx.deliveryLine.update({ where: { id: line.id }, data: { pickedQty: line.qty } })
  }
  return tx.deliveryOrder.update({ where: { id: orderId }, data: { status: 'PACKED', packedAt: new Date() } })
}

export async function markDeliveryDelivered(tx: Tx, orderId: number, userId: number) {
  const order = await tx.deliveryOrder.findUnique({ where: { id: orderId } })
  if (!order) throw new HttpError(404, 'Delivery order not found')
  if (order.status !== 'PACKED') throw new HttpError(400, `Order is ${order.status}; only PACKED orders can be marked delivered`)
  return tx.deliveryOrder.update({ where: { id: orderId }, data: { status: 'DELIVERED', deliveredAt: new Date() } })
}

export async function cancelDelivery(tx: Tx, orderId: number, userId: number) {
  const order = await tx.deliveryOrder.findUnique({ where: { id: orderId }, include: { lines: true } })
  if (!order) throw new HttpError(404, 'Delivery order not found')
  if (order.status !== 'RESERVED' && order.status !== 'PICKED') {
    throw new HttpError(400, `Order is ${order.status}; only RESERVED or PICKED orders can be cancelled (packed stock has already left)`)
  }
  for (const line of order.lines) {
    await bumpStock(tx, line.productId, line.locationId, { reserved: -line.qty }, {
      docType: 'DELIVERY',
      docCode: order.code,
      reason: `Delivery ${order.code} cancelled — reservation released back to available`,
      performedBy: userId,
    })
  }
  return tx.deliveryOrder.update({ where: { id: orderId }, data: { status: 'CANCELLED' } })
}

// ---------------------------------------------------------------------------
// Internal transfers — Source Available → In Transit → Destination Available
// ---------------------------------------------------------------------------

export async function createTransfer(
  tx: Tx,
  input: { fromLocationId: number; toLocationId: number; note?: string | null; lines: { productId: number; qty: number }[] },
  userId: number
) {
  if (input.fromLocationId === input.toLocationId) throw new HttpError(400, 'Source and destination must differ')
  if (!input.lines?.length) throw new HttpError(400, 'A transfer needs at least one line')
  for (const l of input.lines) {
    await assertProduct(tx, l.productId)
    if (!(l.qty > 0)) throw new HttpError(400, 'Quantities must be positive')
    const stock = await getStock(tx, l.productId, input.fromLocationId)
    const available = availableOf(stock)
    if (l.qty > available) {
      const p = await tx.product.findUnique({ where: { id: l.productId } })
      throw new HttpError(400, `Insufficient available stock for ${p?.sku} at source: available ${available}, requested ${l.qty}`)
    }
  }
  await assertLocation(tx, input.fromLocationId)
  await assertLocation(tx, input.toLocationId)
  const code = await nextDocCode(tx, 'transfer')
  const transfer = await tx.transfer.create({
    data: {
      code,
      status: 'IN_TRANSIT',
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      note: input.note ?? null,
      createdBy: userId,
      shippedAt: new Date(),
      lines: { create: input.lines.map((l) => ({ productId: l.productId, qty: l.qty })) },
    },
  })
  for (const l of input.lines) {
    await bumpStock(tx, l.productId, input.fromLocationId, { onHand: -l.qty }, {
      docType: 'TRANSFER',
      docCode: code,
      reason: `Transfer ${code} shipped — left source`,
      performedBy: userId,
    })
    await bumpStock(tx, l.productId, input.toLocationId, { inTransit: l.qty }, {
      docType: 'TRANSFER',
      docCode: code,
      reason: `Transfer ${code} in transit — arriving`,
      performedBy: userId,
    })
  }
  return transfer
}

export async function receiveTransfer(tx: Tx, transferId: number, userId: number) {
  const transfer = await tx.transfer.findUnique({ where: { id: transferId }, include: { lines: true } })
  if (!transfer) throw new HttpError(404, 'Transfer not found')
  if (transfer.status !== 'IN_TRANSIT') throw new HttpError(400, `Transfer is ${transfer.status}; only IN_TRANSIT transfers can be received`)
  for (const line of transfer.lines) {
    await bumpStock(tx, line.productId, transfer.toLocationId, { inTransit: -line.qty, onHand: line.qty }, {
      docType: 'TRANSFER',
      docCode: transfer.code,
      reason: `Transfer ${transfer.code} received — destination available`,
      performedBy: userId,
    })
  }
  return tx.transfer.update({ where: { id: transferId }, data: { status: 'RECEIVED', receivedAt: new Date() } })
}

export async function cancelTransfer(tx: Tx, transferId: number, userId: number) {
  const transfer = await tx.transfer.findUnique({ where: { id: transferId }, include: { lines: true } })
  if (!transfer) throw new HttpError(404, 'Transfer not found')
  if (transfer.status !== 'IN_TRANSIT') throw new HttpError(400, 'Only IN_TRANSIT transfers can be cancelled')
  for (const line of transfer.lines) {
    await bumpStock(tx, line.productId, transfer.toLocationId, { inTransit: -line.qty }, {
      docType: 'TRANSFER',
      docCode: transfer.code,
      reason: `Transfer ${transfer.code} cancelled — returned to source`,
      performedBy: userId,
    })
    await bumpStock(tx, line.productId, transfer.fromLocationId, { onHand: line.qty }, {
      docType: 'TRANSFER',
      docCode: transfer.code,
      reason: `Transfer ${transfer.code} cancelled — restocked at source`,
      performedBy: userId,
    })
  }
  return tx.transfer.update({ where: { id: transferId }, data: { status: 'CANCELLED' } })
}

// ---------------------------------------------------------------------------
// Stock adjustments + severity rules (Phase 4 governance)
//   LOW      < 2% one-off mismatch        → posted, logged automatically
//   MEDIUM   2–15%, or repeated mismatch  → posted, flagged for manager review
//   HIGH     > 15% of stock               → held for manager approval before posting
//   CRITICAL would go below zero          → blocked outright (never stored)
// ---------------------------------------------------------------------------

export const SEVERITY = { LOW_PCT: 0.02, HIGH_PCT: 0.15, REPEATED_DAYS: 30, REPEATED_PRIORS: 2, STAFF_7D: 6 }

export interface AdjustLineInput {
  productId: number
  locationId: number
  countedQty: number
}

export interface AdjustOutcome {
  adjustment: { id: number; code: string; status: string; severity: string; reason: string; note: string | null; createdAt: Date; postedAt: Date | null }
  explanation: string
  flagsCreated: { type: string; message: string }[]
}

export async function createAdjustment(
  tx: Tx,
  input: { reason: string; note?: string | null; lines: AdjustLineInput[]; sourceCountCode?: string },
  userId: number
): Promise<AdjustOutcome> {
  if (!input.reason?.trim()) throw new HttpError(400, 'A reason is required for every stock adjustment')
  if (!input.lines?.length) throw new HttpError(400, 'An adjustment needs at least one line')

  const prepared: { productId: number; locationId: number; systemQty: number; countedQty: number; delta: number; pct: number; downward: boolean }[] = []
  for (const l of input.lines) {
    const product = await assertProduct(tx, l.productId)
    await assertLocation(tx, l.locationId)
    const stock = await getStock(tx, l.productId, l.locationId)
    const systemQty = stock?.onHand ?? 0
    if (l.countedQty < 0) {
      throw new HttpError(
        422,
        `Blocked (CRITICAL): entering ${l.countedQty} ${product.unit} for ${product.sku} would take stock below zero. Adjustments can never set negative stock.`,
        'CRITICAL'
      )
    }
    const delta = Math.round((l.countedQty - systemQty) * 1000) / 1000
    const pct = systemQty > 0 ? Math.abs(delta) / systemQty : delta > 0 ? 1 : 0
    prepared.push({ productId: l.productId, locationId: l.locationId, systemQty, countedQty: l.countedQty, delta, pct, downward: delta < 0 })
  }

  // severity classification
  let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW'
  const big = prepared.filter((p) => p.downward && p.pct > SEVERITY.HIGH_PCT)
  const moderate = prepared.filter((p) => p.downward && p.pct >= SEVERITY.LOW_PCT && p.pct <= SEVERITY.HIGH_PCT)
  if (big.length > 0) severity = 'HIGH'
  else if (moderate.length > 0) severity = 'MEDIUM'

  // repeated-mismatch pattern: ≥3rd downward adjustment at same product+location in 30 days
  const flags: { type: string; message: string }[] = []
  const since = new Date(Date.now() - SEVERITY.REPEATED_DAYS * 86400000)
  const repeatedAt: typeof prepared = []
  for (const p of prepared.filter((x) => x.downward)) {
    const priors = await tx.adjustmentLine.count({
      where: {
        productId: p.productId,
        locationId: p.locationId,
        delta: { lt: 0 },
        adjustment: { createdAt: { gte: since }, status: { in: ['POSTED', 'PENDING_APPROVAL'] } },
      },
    })
    if (priors >= SEVERITY.REPEATED_PRIORS) {
      repeatedAt.push(p)
      if (severity === 'LOW') severity = 'MEDIUM'
    }
  }

  // staff anomaly: unusually high adjustment count by one user in 7 days (review item, not an accusation)
  const staffAdjustments7d = await tx.adjustment.count({
    where: { createdBy: userId, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
  })

  const code = await nextDocCode(tx, 'adjustment')
  const reasonText = input.sourceCountCode ? `${input.reason} (cycle count ${input.sourceCountCode})` : input.reason.trim()

  const adjustment = await tx.adjustment.create({
    data: {
      code,
      status: severity === 'HIGH' ? 'PENDING_APPROVAL' : 'POSTED',
      severity,
      reason: reasonText,
      note: input.note ?? null,
      createdBy: userId,
      postedAt: severity === 'HIGH' ? null : new Date(),
      lines: {
        create: prepared.map((p) => ({
          productId: p.productId,
          locationId: p.locationId,
          systemQty: p.systemQty,
          countedQty: p.countedQty,
          delta: p.delta,
        })),
      },
    },
  })

  if (severity !== 'HIGH') {
    for (const p of prepared) {
      if (p.delta === 0) continue
      await bumpStock(tx, p.productId, p.locationId, { onHand: p.delta }, {
        docType: input.sourceCountCode ? 'COUNT' : 'ADJUSTMENT',
        docCode: code,
        reason: reasonText,
        performedBy: userId,
      })
    }
  }

  // plain-language explanations, mirroring the plan's example style
  const parts: string[] = []
  if (severity === 'HIGH') {
    parts.push(
      `Held for manager approval: removes ${Math.round(big[0].pct * 100)}% of current stock at this location` +
        (repeatedAt.length > 0 ? ` and is a repeated downward adjustment (3rd+ in ${SEVERITY.REPEATED_DAYS} days)` : '') +
        `. It will only post once approved.`
    )
  } else if (repeatedAt.length > 0) {
    parts.push(`Flagged for review: this is the 3rd+ downward adjustment at this product/location within ${SEVERITY.REPEATED_DAYS} days.`)
  } else if (severity === 'MEDIUM') {
    parts.push(`Flagged for review: adjusts ${Math.round(moderate[0].pct * 100)}% of stock at this location.`)
  } else {
    parts.push(`Logged automatically: one-off mismatch under ${Math.round(SEVERITY.LOW_PCT * 100)}% of stock — no action needed.`)
  }

  if (repeatedAt.length > 0) {
    flags.push({
      type: 'REPEATED_MISMATCH',
      message: `Repeated mismatch: 3rd+ downward adjustment within ${SEVERITY.REPEATED_DAYS} days at the same product/location (${repeatedAt.map((r) => `#${r.productId}`).join(', ')}).`,
    })
  } else if (severity === 'MEDIUM') {
    flags.push({
      type: 'MODERATE_VARIANCE',
      message: `Moderate variance: adjusts ${Math.round(moderate[0].pct * 100)}% of stock at this location — flagged for manager review.`,
    })
  }
  if (staffAdjustments7d + 1 > SEVERITY.STAFF_7D) {
    flags.push({
      type: 'STAFF_ANOMALY',
      message: `Unusually high adjustment activity: ${staffAdjustments7d + 1} adjustments by this user in the past 7 days — surfaced as a review item.`,
    })
  }
  for (const f of flags) {
    await tx.exceptionFlag.create({
      data: { type: f.type, severity: 'MEDIUM', message: f.message, refType: 'ADJUSTMENT', refId: adjustment.id, refCode: code, status: 'OPEN', createdBy: userId },
    })
  }

  return { adjustment, explanation: parts.join(' '), flagsCreated: flags }
}

export async function approveAdjustment(tx: Tx, adjustmentId: number, approverId: number) {
  const adjustment = await tx.adjustment.findUnique({ where: { id: adjustmentId }, include: { lines: true } })
  if (!adjustment) throw new HttpError(404, 'Adjustment not found')
  if (adjustment.status !== 'PENDING_APPROVAL') throw new HttpError(400, `Adjustment is ${adjustment.status}; only PENDING_APPROVAL adjustments can be approved`)
  for (const line of adjustment.lines) {
    if (line.delta === 0) continue
    await bumpStock(tx, line.productId, line.locationId, { onHand: line.delta }, {
      docType: 'ADJUSTMENT',
      docCode: adjustment.code,
      reason: adjustment.reason,
      performedBy: adjustment.createdBy ?? null,
      approvedBy: approverId,
    })
  }
  return tx.adjustment.update({ where: { id: adjustmentId }, data: { status: 'POSTED', approvedBy: approverId, postedAt: new Date() } })
}

export async function rejectAdjustment(tx: Tx, adjustmentId: number, approverId: number) {
  const adjustment = await tx.adjustment.findUnique({ where: { id: adjustmentId } })
  if (!adjustment) throw new HttpError(404, 'Adjustment not found')
  if (adjustment.status !== 'PENDING_APPROVAL') throw new HttpError(400, 'Only PENDING_APPROVAL adjustments can be rejected')
  return tx.adjustment.update({ where: { id: adjustmentId }, data: { status: 'REJECTED', approvedBy: approverId } })
}

// ---------------------------------------------------------------------------
// Cycle counts (Phase 4) — only a real variance opens an adjustment
// ---------------------------------------------------------------------------

const CADENCE_BY_CLASS: Record<string, string> = { HIGH: 'WEEKLY', MEDIUM: 'MONTHLY', LOW: 'QUARTERLY' }
const CADENCE_DAYS: Record<string, number> = { WEEKLY: 7, MONTHLY: 30, QUARTERLY: 91 }

export async function createCount(
  tx: Tx,
  input: { scope: 'LOCATION' | 'PRODUCT'; locationId?: number; productId?: number; dueDate?: string; note?: string | null },
  userId: number
) {
  let lines: { productId: number; systemQty: number; locationId: number }[] = []
  let cadence = 'MONTHLY'
  if (input.scope === 'LOCATION') {
    if (!input.locationId) throw new HttpError(400, 'locationId required for a LOCATION count')
    await assertLocation(tx, input.locationId)
    const stocks = await tx.stockLevel.findMany({ where: { locationId: input.locationId }, include: { product: true } })
    lines = stocks.map((s) => ({ productId: s.productId, systemQty: s.onHand, locationId: input.locationId! }))
    const classes = new Set(stocks.map((s) => s.product.valueClass))
    cadence = classes.has('HIGH') ? 'WEEKLY' : classes.has('MEDIUM') ? 'MONTHLY' : 'QUARTERLY'
  } else {
    if (!input.productId) throw new HttpError(400, 'productId required for a PRODUCT count')
    const product = await assertProduct(tx, input.productId)
    const stocks = await tx.stockLevel.findMany({ where: { productId: input.productId } })
    lines = stocks.map((s) => ({ productId: s.productId, systemQty: s.onHand, locationId: s.locationId }))
    cadence = CADENCE_BY_CLASS[product.valueClass] ?? 'MONTHLY'
  }
  if (lines.length === 0) throw new HttpError(400, 'Nothing to count at this scope (no stock records found)')
  const code = await nextDocCode(tx, 'cycleCount')
  const due = input.dueDate ? new Date(input.dueDate) : new Date(Date.now() + (CADENCE_DAYS[cadence] ?? 30) * 86400000)
  const count = await tx.cycleCount.create({
    data: {
      code,
      status: 'OPEN',
      scope: input.scope,
      locationId: input.scope === 'LOCATION' ? input.locationId! : null,
      productId: input.scope === 'PRODUCT' ? input.productId! : null,
      dueDate: due,
      cadence,
      note: input.note ?? null,
      lines: { create: lines },
    },
  })
  return count
}

export async function submitCount(
  tx: Tx,
  countId: number,
  input: { lines: { lineId: number; countedQty: number }[]; note?: string | null },
  userId: number
) {
  const count = await tx.cycleCount.findUnique({ where: { id: countId }, include: { lines: { include: { product: true } } } })
  if (!count) throw new HttpError(404, 'Cycle count not found')
  if (count.status !== 'OPEN') throw new HttpError(400, `Count is ${count.status}; only OPEN counts can be submitted`)
  const byId = new Map(input.lines.map((l) => [l.lineId, l]))
  const varianceLines: { productId: number; locationId: number; countedQty: number }[] = []
  const locationId = count.locationId
  for (const line of count.lines) {
    const given = byId.get(line.id)
    if (given == null) throw new HttpError(400, `Missing counted quantity for ${line.product.sku}`)
    const variance = Math.round((given.countedQty - line.systemQty) * 1000) / 1000
    await tx.cycleCountLine.update({ where: { id: line.id }, data: { countedQty: given.countedQty, variance } })
    if (variance !== 0) {
      const locId = line.locationId ?? locationId ?? (await tx.stockLevel.findFirst({ where: { productId: line.productId } }))?.locationId
      if (locId) varianceLines.push({ productId: line.productId, locationId: locId, countedQty: given.countedQty })
    }
  }
  const updated = await tx.cycleCount.update({
    where: { id: countId },
    data: { status: 'COMPLETED', completedAt: new Date(), completedBy: userId, note: input.note ?? count.note },
  })
  let outcome: AdjustOutcome | null = null
  if (varianceLines.length > 0) {
    // only a real variance opens an adjustment — and it passes through the same severity engine
    outcome = await createAdjustment(
      tx,
      { reason: `Cycle count ${count.code} variance on ${varianceLines.length} SKU(s)`, lines: varianceLines, sourceCountCode: count.code },
      userId
    )
  }
  return { count: updated, outcome }
}

export async function cancelCount(tx: Tx, countId: number, userId: number) {
  const count = await tx.cycleCount.findUnique({ where: { id: countId } })
  if (!count) throw new HttpError(404, 'Cycle count not found')
  if (count.status !== 'OPEN') throw new HttpError(400, 'Only OPEN counts can be cancelled')
  return tx.cycleCount.update({ where: { id: countId }, data: { status: 'CANCELLED' } })
}

// ---------------------------------------------------------------------------
// Reorder intelligence (Phase 3) — supplier-aware, explainable
// projected available = on-hand + incoming − reserved  (vs the reorder point)
// ---------------------------------------------------------------------------

export interface ProductNeed {
  productId: number
  sku: string
  name: string
  unit: string
  category: string
  onHand: number
  reserved: number
  incoming: number
  inTransit: number
  projectedAvailable: number
  reorderPoint: number
  dailyUsage: number
  safetyStock: number
  belowReorder: boolean
  stockoutRisk: boolean
}

export async function computeNeeds(tx: Tx = db): Promise<ProductNeed[]> {
  const products = await tx.product.findMany({
    where: { active: true },
    include: { stocks: true, suppliers: { include: { supplier: true } } },
    orderBy: { sku: 'asc' },
  })
  return products.map((p) => {
    const onHand = p.stocks.reduce((a, s) => a + s.onHand, 0)
    const reserved = p.stocks.reduce((a, s) => a + s.reserved, 0)
    const incoming = p.stocks.reduce((a, s) => a + s.incoming, 0)
    const inTransit = p.stocks.reduce((a, s) => a + s.inTransit, 0)
    const projectedAvailable = Math.round((onHand + incoming - reserved) * 1000) / 1000
    return {
      productId: p.id,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
      category: p.category,
      onHand,
      reserved,
      incoming,
      inTransit,
      projectedAvailable,
      reorderPoint: p.reorderPoint,
      dailyUsage: p.dailyUsage,
      safetyStock: p.safetyStock,
      belowReorder: projectedAvailable < p.reorderPoint,
      stockoutRisk: projectedAvailable <= p.safetyStock,
    }
  })
}

export function buildReorderReason(need: ProductNeed, supplierName: string | null, leadDays: number, suggestedQty: number, minOrderQty: number, orderMultiple: number): string {
  const u = need.unit
  const lead = supplierName ? `${supplierName}'s ${leadDays}-day lead time` : `a ${leadDays}-day lead time`
  const moq = minOrderQty > 0 ? ` (MOQ ${minOrderQty} ${u}, order multiple ${orderMultiple} ${u})` : orderMultiple > 1 ? ` (order multiple ${orderMultiple} ${u})` : ''
  return (
    `On-hand: ${need.onHand} ${u} · Reserved: ${need.reserved} ${u} · Incoming: ${need.incoming} ${u} · Available: ${need.projectedAvailable} ${u}\n` +
    `Reorder point: ${need.reorderPoint} ${u} (${need.dailyUsage} ${u}/day × ${leadDays}-day lead time + ${need.safetyStock} ${u} safety stock)\n` +
    `→ Reorder recommended: projected available stock (${need.projectedAvailable} ${u}) is below the ${need.reorderPoint} ${u} reorder point within ${lead}.\n` +
    `→ Suggested quantity: ${suggestedQty} ${u}${moq}` +
    (supplierName ? ` · Preferred supplier: ${supplierName}` : '')
  )
}

/** Recompute PENDING suggestions for every product needing reorder (idempotent). */
export async function refreshSuggestions(tx: Tx = db) {
  const needs = await computeNeeds(tx)
  const needing = needs.filter((n) => n.belowReorder)
  const withSuppliers = await tx.product.findMany({
    where: { id: { in: needing.map((n) => n.productId) } },
    include: { suppliers: { include: { supplier: true } } },
  })
  const byId = new Map(withSuppliers.map((p) => [p.id, p]))
  const now = new Date()

  for (const need of needing) {
    const existing = await tx.reorderSuggestion.findUnique({ where: { productId: need.productId } })
    if (existing) {
      if (existing.status === 'ACCEPTED') continue // already converted to an expected receipt
      if (existing.status === 'DISMISSED' && existing.decidedAt && now.getTime() - existing.decidedAt.getTime() < 7 * 86400000) continue
    }
    const product = byId.get(need.productId)
    const links = (product?.suppliers ?? []).slice().sort(
      (a, b) => Number(b.preferred) - Number(a.preferred) || a.supplier.leadTimeDays - b.supplier.leadTimeDays
    )
    const link = links[0]
    const leadDays = link?.supplier.leadTimeDays ?? 7
    const moq = link?.minOrderQty ?? 0
    const multiple = link?.orderMultiple && link.orderMultiple > 0 ? link.orderMultiple : 1
    const target = need.dailyUsage * (leadDays + 7) + need.safetyStock // cover lead + review period + safety
    let qty = Math.max(0, target - need.projectedAvailable)
    qty = Math.ceil(qty / multiple) * multiple
    if (moq > 0) qty = Math.max(qty, Math.ceil(moq / multiple) * multiple)
    qty = Math.max(qty, multiple)
    const reason = buildReorderReason(need, link?.supplier.name ?? null, leadDays, qty, moq, multiple)
    const data = {
      suggestedQty: qty,
      preferredName: link?.supplier.name ?? '—',
      preferredLeadDays: leadDays,
      reason,
      status: 'PENDING',
      decidedBy: null,
      decidedAt: null,
      receiptCode: null,
    }
    await tx.reorderSuggestion.upsert({ where: { productId: need.productId }, create: { productId: need.productId, ...data }, update: data })
  }
  return tx.reorderSuggestion.findMany({ include: { product: true }, orderBy: { updatedAt: 'desc' } })
}

export async function acceptSuggestion(tx: Tx, suggestionId: number, userId: number, expectedAt?: string) {
  const s = await tx.reorderSuggestion.findUnique({ where: { id: suggestionId }, include: { product: { include: { stocks: true } } } })
  if (!s) throw new HttpError(404, 'Suggestion not found')
  if (s.status !== 'PENDING') throw new HttpError(400, `Suggestion is ${s.status}; only PENDING suggestions can be accepted`)
  const product = s.product
  const stockRows = product.stocks.slice().sort((a, b) => b.onHand - a.onHand)
  const locationId = stockRows[0]?.locationId ?? (await tx.location.findFirst())!.id
  const supplier = await tx.supplier.findUnique({ where: { name: s.preferredName } })
  const receipt = await createReceipt(
    tx,
    {
      supplierId: supplier?.id ?? null,
      expectedAt: expectedAt ?? new Date(Date.now() + s.preferredLeadDays * 86400000).toISOString(),
      note: `Created from reorder suggestion for ${product.sku}`,
      lines: [{ productId: product.id, locationId, expectedQty: s.suggestedQty }],
    },
    userId
  )
  return tx.reorderSuggestion.update({
    where: { id: suggestionId },
    data: { status: 'ACCEPTED', decidedBy: userId, decidedAt: new Date(), receiptCode: receipt.code },
  })
}

export async function dismissSuggestion(tx: Tx, suggestionId: number, userId: number) {
  const s = await tx.reorderSuggestion.findUnique({ where: { id: suggestionId } })
  if (!s) throw new HttpError(404, 'Suggestion not found')
  if (s.status !== 'PENDING') throw new HttpError(400, 'Only PENDING suggestions can be dismissed')
  return tx.reorderSuggestion.update({ where: { id: suggestionId }, data: { status: 'DISMISSED', decidedBy: userId, decidedAt: new Date() } })
}
