/**
 * COMPAT COPY of src/lib/attention.ts (computeAttention + computeDashboard)
 * with ONE bug fixed: the original builds its summary with the identifier
 * `pendingApprovalAdjustments`, which is never defined (the Promise.all
 * destructuring names the variable `pendingAdjustments`), so every call to
 * computeAttention / computeDashboard throws ReferenceError.
 *
 * API routes own only src/app/api/** — foundation libs must stay untouched —
 * so the corrected copies live here. Behaviour is otherwise IDENTICAL to the
 * original (same fields, same ordering).
 *
 * NOTE FOR MAIN AGENT: the one-character-class fix upstream is in
 * src/lib/attention.ts line 42: `pendingApprovalAdjustments,` → `pendingAdjustments,`.
 * Once applied, this file can be deleted and the routes switched back to
 * importing from '@/lib/attention'.
 */
import { db } from '@/lib/db'
import { computeNeeds, type Tx } from '@/lib/inventory'

export interface AttentionSummary {
  belowReorder: number
  stockouts: number
  pendingApprovalAdjustments: number
  openFlags: number
  delayedReceipts: number
  pendingSuggestions: number
  inTransitTransfers: number
  openCounts: number
}

export async function computeAttentionFixed(tx: Tx = db) {
  const needs = await computeNeeds(tx)
  const below = needs.filter((n) => n.belowReorder)
  const stockouts = needs.filter((n) => n.stockoutRisk)

  const [pendingAdjustments, openFlags, delayedReceipts, pendingSuggestions, inTransitTransfers, openCounts] = await Promise.all([
    tx.adjustment.count({ where: { status: 'PENDING_APPROVAL' } }),
    tx.exceptionFlag.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' } }),
    tx.receipt.findMany({
      where: { status: 'EXPECTED', expectedAt: { lt: new Date() } },
      include: { supplier: true },
      orderBy: { expectedAt: 'asc' },
    }),
    tx.reorderSuggestion.count({ where: { status: 'PENDING' } }),
    tx.transfer.count({ where: { status: 'IN_TRANSIT' } }),
    tx.cycleCount.count({ where: { status: 'OPEN' } }),
  ])

  const summary: AttentionSummary = {
    belowReorder: below.length,
    stockouts: stockouts.length,
    pendingApprovalAdjustments: pendingAdjustments, // ← the fixed line
    openFlags: openFlags.length,
    delayedReceipts: delayedReceipts.length,
    pendingSuggestions,
    inTransitTransfers,
    openCounts,
  }

  const items: { key: string; kind: string; severity: 'red' | 'orange' | 'green'; icon: string; title: string; detail: string; href: string }[] = []

  if (stockouts.length > 0) {
    items.push({
      key: 'stockouts',
      kind: 'STOCKOUT',
      severity: 'red',
      icon: '⛔',
      title: `${stockouts.length} potential stockout${stockouts.length > 1 ? 's' : ''}`,
      detail: stockouts.slice(0, 3).map((n) => `${n.sku} — projected available ${n.projectedAvailable} ${n.unit} (safety stock ${n.safetyStock})`).join(' · '),
      href: 'reorder',
    })
  }
  if (below.length > 0) {
    items.push({
      key: 'below-reorder',
      kind: 'BELOW_REORDER',
      severity: 'red',
      icon: '📉',
      title: `${below.length} SKU${below.length > 1 ? 's' : ''} below reorder point`,
      detail: below.slice(0, 3).map((n) => `${n.sku} — ${n.projectedAvailable}/${n.reorderPoint} ${n.unit}`).join(' · '),
      href: 'reorder',
    })
  }
  if (pendingAdjustments > 0) {
    items.push({
      key: 'pending-adjustments',
      kind: 'PENDING_ADJUSTMENT',
      severity: 'orange',
      icon: '⚖️',
      title: `${pendingAdjustments} large adjustment${pendingAdjustments > 1 ? 's' : ''} awaiting approval`,
      detail: 'HIGH severity — held until a manager approves (over 15% of stock)',
      href: 'adjustments',
    })
  }
  if (openFlags.length > 0) {
    items.push({
      key: 'review-flags',
      kind: 'REVIEW_FLAG',
      severity: 'orange',
      icon: '🚩',
      title: `${openFlags.length} unusual adjustment${openFlags.length > 1 ? 's' : ''} flagged for review`,
      detail: openFlags.slice(0, 2).map((f) => f.message).join(' · '),
      href: 'alerts',
    })
  }
  if (delayedReceipts.length > 0) {
    items.push({
      key: 'delayed-receipts',
      kind: 'DELAYED_RECEIPT',
      severity: 'orange',
      icon: '⏰',
      title: `${delayedReceipts.length} delayed receipt${delayedReceipts.length > 1 ? 's' : ''}`,
      detail: delayedReceipts.slice(0, 2).map((r) => `${r.code}${r.supplier ? ` (${r.supplier.name})` : ''} — expected ${r.expectedAt.toISOString().slice(0, 10)}`).join(' · '),
      href: 'receipts',
    })
  }
  if (pendingSuggestions > 0) {
    items.push({
      key: 'reorder-suggestions',
      kind: 'REORDER_SUGGESTION',
      severity: 'green',
      icon: '🛒',
      title: `${pendingSuggestions} reorder suggestion${pendingSuggestions > 1 ? 's' : ''} awaiting approval`,
      detail: 'Explainable suggestions based on projected available stock vs reorder point',
      href: 'reorder',
    })
  }

  return { summary, items, flags: openFlags, below, stockouts }
}

export async function computeDashboardFixed(tx: Tx = db) {
  const stocks = await tx.stockLevel.findMany({ include: { product: true, location: { include: { rack: { include: { zone: true } } } } } })
  const products = await tx.product.findMany({ where: { active: true } })
  const needs = await computeNeeds(tx)
  const attention = await computeAttentionFixed(tx)

  const kpis = {
    totalStockValue: 0,
    availableValue: 0,
    reservedValue: 0,
    incomingValue: 0,
    inTransitValue: 0,
    damagedValue: 0,
    skuCount: products.length,
    lowStockCount: needs.filter((n) => n.belowReorder).length,
    stockoutCount: needs.filter((n) => n.stockoutRisk).length,
    openDeliveries: await tx.deliveryOrder.count({ where: { status: { in: ['RESERVED', 'PICKED', 'PACKED'] } } }),
    inTransitTransfers: attention.summary.inTransitTransfers,
    pendingAdjustments: attention.summary.pendingApprovalAdjustments,
    expectedReceipts: await tx.receipt.count({ where: { status: 'EXPECTED' } }),
  }
  for (const s of stocks) {
    const v = s.onHand * s.product.unitCost
    kpis.totalStockValue += v
    kpis.availableValue += (s.onHand - s.reserved) * s.product.unitCost
    kpis.reservedValue += s.reserved * s.product.unitCost
    kpis.incomingValue += s.incoming * s.product.unitCost
    kpis.inTransitValue += s.inTransit * s.product.unitCost
    kpis.damagedValue += s.damaged * s.product.unitCost
  }

  // value by category
  const catMap = new Map<string, number>()
  for (const s of stocks) catMap.set(s.product.category, (catMap.get(s.product.category) ?? 0) + s.onHand * s.product.unitCost)
  const valueByCategory = [...catMap.entries()].map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value)

  // rack breakdown (floor-plan-lite)
  const rackMap = new Map<string, { rackCode: string; zoneName: string; locationCount: number; onHandValue: number; locSet: Set<number> }>()
  for (const s of stocks) {
    const rack = s.location.rack
    const key = `${rack.zone.name}/${rack.code}`
    const row = rackMap.get(key) ?? { rackCode: rack.code, zoneName: rack.zone.name, locationCount: 0, onHandValue: 0, locSet: new Set<number>() }
    row.onHandValue += s.onHand * s.product.unitCost
    row.locSet.add(s.locationId)
    rackMap.set(key, row)
  }
  const racks = [...rackMap.values()].map((r) => ({ rackCode: r.rackCode, zoneName: r.zoneName, locationCount: r.locSet.size, onHandValue: r.onHandValue })).sort((a, b) => b.onHandValue - a.onHandValue)
  const maxRack = Math.max(...racks.map((r) => r.onHandValue), 1)
  const racksWithFill = racks.map((r) => ({ ...r, fillPct: Math.round((r.onHandValue / maxRack) * 100) }))

  // 14-day flows: value received vs delivered (from the ledger)
  const since = new Date(Date.now() - 13 * 86400000)
  since.setUTCHours(0, 0, 0, 0)
  const ledger = await tx.ledgerEntry.findMany({
    where: { createdAt: { gte: since }, field: 'ON_HAND' },
    include: { product: true },
  })
  const dayMap = new Map<string, { received: number; delivered: number }>()
  for (let i = 0; i < 14; i++) {
    const d = new Date(since.getTime() + i * 86400000).toISOString().slice(0, 10)
    dayMap.set(d, { received: 0, delivered: 0 })
  }
  for (const e of ledger) {
    const day = e.createdAt.toISOString().slice(0, 10)
    const row = dayMap.get(day)
    if (!row) continue
    const value = Math.abs(e.diff) * e.product.unitCost
    if (e.docType === 'RECEIPT' && e.diff > 0) row.received += value
    if (e.docType === 'DELIVERY' && e.diff < 0) row.delivered += value
  }
  const flows = [...dayMap.entries()].map(([date, v]) => ({ date, ...v }))

  // recent activity
  const activityRows = await tx.ledgerEntry.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: { product: true, location: true },
  })
  const userIds = [...new Set(activityRows.map((a) => a.performedBy).filter((x): x is number => x != null))]
  const users = await tx.user.findMany({ where: { id: { in: userIds } } })
  const userById = new Map(users.map((u) => [u.id, u.name]))
  const activity = activityRows.map((a) => ({
    id: a.id,
    code: a.code,
    docType: a.docType,
    docCode: a.docCode,
    productId: a.productId,
    sku: a.product.sku,
    productName: a.product.name,
    unit: a.product.unit,
    locationId: a.locationId,
    locationPath: a.location.fullPath,
    field: a.field,
    prevQty: a.prevQty,
    newQty: a.newQty,
    diff: a.diff,
    reason: a.reason,
    performedByName: a.performedBy ? (userById.get(a.performedBy) ?? null) : null,
    createdAt: a.createdAt.toISOString(),
  }))

  return { kpis, valueByCategory, racks: racksWithFill, flows, activity, attention }
}
