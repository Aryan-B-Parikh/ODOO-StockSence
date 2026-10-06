/**
 * StockSense — Prisma row → DTO mappers (shared by every API route so the
 * frontend contract stays identical everywhere).
 */

import type {
  AdjustmentDTO,
  CountLineDTO,
  CycleCountDTO,
  DeliveryDTO,
  LedgerEntryDTO,
  ProductDTO,
  ReceiptDTO,
  ReorderSuggestionDTO,
  StockByLocationDTO,
  TransferDTO,
} from '@/lib/types'


type Row = any

export const RECEIPT_INCLUDE = {
  supplier: true,
  warehouse: true,
  lines: { include: { product: true, location: true } },
} as const

export const DELIVERY_INCLUDE = {
  lines: { include: { product: true, location: true } },
} as const

export const TRANSFER_INCLUDE = {
  fromLocation: true,
  toLocation: true,
  lines: { include: { product: true } },
} as const

export const ADJUSTMENT_INCLUDE = {
  lines: { include: { product: true, location: true } },
} as const

export const LEDGER_INCLUDE = { product: true, location: true } as const

export const COUNT_INCLUDE = {
  location: true,
  product: true,
  lines: { include: { product: true } },
} as const

export const PRODUCT_INCLUDE = {
  suppliers: { include: { supplier: true } },
  stocks: { include: { location: { include: { rack: { include: { zone: { include: { warehouse: true } } } } } } } },
} as const

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

export function toProductDTO(p: Row): ProductDTO {
  const onHand = p.stocks.reduce((a: number, s: Row) => a + s.onHand, 0)
  const reserved = p.stocks.reduce((a: number, s: Row) => a + s.reserved, 0)
  const incoming = p.stocks.reduce((a: number, s: Row) => a + s.incoming, 0)
  const inTransit = p.stocks.reduce((a: number, s: Row) => a + s.inTransit, 0)
  const damaged = p.stocks.reduce((a: number, s: Row) => a + s.damaged, 0)
  const available = onHand - reserved
  const projectedAvailable = onHand + incoming - reserved
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    unit: p.unit,
    unitCost: p.unitCost,
    reorderPoint: p.reorderPoint,
    dailyUsage: p.dailyUsage,
    safetyStock: p.safetyStock,
    valueClass: p.valueClass,
    notes: p.notes,
    active: p.active,
    onHand,
    reserved,
    available,
    incoming,
    inTransit,
    damaged,
    stockValue: onHand * p.unitCost,
    belowReorder: projectedAvailable < p.reorderPoint,
    stockoutRisk: projectedAvailable <= p.safetyStock,
    suppliers: (p.suppliers ?? [])
      .slice()
      .sort((a: Row, b: Row) => Number(b.preferred) - Number(a.preferred) || a.supplier.leadTimeDays - b.supplier.leadTimeDays)
      .map((ps: Row) => ({
        supplierId: ps.supplier.id,
        name: ps.supplier.name,
        preferred: ps.preferred,
        leadTimeDays: ps.supplier.leadTimeDays,
        costPrice: ps.costPrice,
        minOrderQty: ps.minOrderQty,
        orderMultiple: ps.orderMultiple,
        reliability: ps.supplier.reliability,
        damageRate: ps.supplier.damageRate,
      })),
    stockByLocation: p.stocks
      .slice()
      .sort((a: Row, b: Row) => b.onHand - a.onHand)
      .map((s: Row): StockByLocationDTO => ({
        locationId: s.locationId,
        fullPath: s.location.fullPath,
        warehouseName: s.location.rack?.zone?.warehouse?.name ?? '',
        onHand: s.onHand,
        reserved: s.reserved,
        available: s.onHand - s.reserved,
        incoming: s.incoming,
        inTransit: s.inTransit,
        damaged: s.damaged,
      })),
  }
}

export function toReceiptDTO(r: Row): ReceiptDTO {
  const daysLate = r.status === 'EXPECTED' ? Math.max(0, Math.ceil((Date.now() - r.expectedAt.getTime()) / 86400000)) : 0
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    supplierId: r.supplierId,
    supplierName: r.supplier?.name ?? null,
    warehouseName: r.warehouse?.name ?? '',
    expectedAt: r.expectedAt.toISOString(),
    receivedAt: iso(r.receivedAt),
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
    daysLate,
    lines: r.lines.map((l: Row) => ({
      id: l.id,
      productId: l.productId,
      sku: l.product.sku,
      productName: l.product.name,
      unit: l.product.unit,
      locationId: l.locationId,
      locationPath: l.location.fullPath,
      expectedQty: l.expectedQty,
      receivedQty: l.receivedQty,
    })),
  }
}

export function toDeliveryDTO(d: Row, stockByProductLocation?: Map<string, { onHand: number; reserved: number }>): DeliveryDTO {
  return {
    id: d.id,
    code: d.code,
    customer: d.customer,
    status: d.status,
    note: d.note,
    createdAt: d.createdAt.toISOString(),
    pickedAt: iso(d.pickedAt),
    packedAt: iso(d.packedAt),
    deliveredAt: iso(d.deliveredAt),
    createdBy: d.createdBy,
    lines: d.lines.map((l: Row) => {
      const key = `${l.productId}:${l.locationId}`
      const s = stockByProductLocation?.get(key)
      return {
        id: l.id,
        productId: l.productId,
        sku: l.product.sku,
        productName: l.product.name,
        unit: l.product.unit,
        locationId: l.locationId,
        locationPath: l.location.fullPath,
        qty: l.qty,
        pickedQty: l.pickedQty ?? null,
        availableAtLocation: s ? s.onHand - s.reserved : 0,
      }
    }),
  }
}

export function toTransferDTO(t: Row, stockByProductLocation?: Map<string, { onHand: number; reserved: number }>): TransferDTO {
  return {
    id: t.id,
    code: t.code,
    status: t.status,
    fromLocationId: t.fromLocationId,
    fromLocationPath: t.fromLocation.fullPath,
    toLocationId: t.toLocationId,
    toLocationPath: t.toLocation.fullPath,
    note: t.note,
    shippedAt: t.shippedAt.toISOString(),
    receivedAt: iso(t.receivedAt),
    createdBy: t.createdBy,
    lines: t.lines.map((l: Row) => {
      const s = stockByProductLocation?.get(`${l.productId}:${t.fromLocationId}`)
      return {
        id: l.id,
        productId: l.productId,
        sku: l.product.sku,
        productName: l.product.name,
        unit: l.product.unit,
        qty: l.qty,
        availableAtSource: s ? s.onHand - s.reserved : 0,
      }
    }),
  }
}

export function toAdjustmentDTO(a: Row, userNames?: Map<number, string>): AdjustmentDTO {
  return {
    id: a.id,
    code: a.code,
    status: a.status,
    severity: a.severity,
    reason: a.reason,
    note: a.note,
    createdByName: a.createdBy != null ? (userNames?.get(a.createdBy) ?? null) : null,
    approvedByName: a.approvedBy != null ? (userNames?.get(a.approvedBy) ?? null) : null,
    createdAt: a.createdAt.toISOString(),
    postedAt: iso(a.postedAt),
    lines: a.lines.map((l: Row) => ({
      id: l.id,
      productId: l.productId,
      sku: l.product.sku,
      productName: l.product.name,
      unit: l.product.unit,
      locationId: l.locationId,
      locationPath: l.location.fullPath,
      systemQty: l.systemQty,
      countedQty: l.countedQty,
      delta: l.delta,
    })),
  }
}

export function toLedgerDTO(e: Row, userNames?: Map<number, string>): LedgerEntryDTO {
  return {
    id: e.id,
    code: e.code,
    docType: e.docType,
    docCode: e.docCode,
    productId: e.productId,
    sku: e.product.sku,
    productName: e.product.name,
    unit: e.product.unit,
    locationId: e.locationId,
    locationPath: e.location.fullPath,
    field: e.field,
    prevQty: e.prevQty,
    newQty: e.newQty,
    diff: e.diff,
    reason: e.reason,
    performedByName: e.performedBy != null ? (userNames?.get(e.performedBy) ?? null) : null,
    createdAt: e.createdAt.toISOString(),
  }
}

export function toCountDTO(c: Row, adjustmentCodes: string[] = []): CycleCountDTO {
  const daysOverdue = c.status === 'OPEN' ? Math.max(0, Math.ceil((Date.now() - c.dueDate.getTime()) / 86400000)) : 0
  const totalVariance =
    c.lines.some((l: Row) => l.countedQty != null)
      ? c.lines.reduce((a: number, l: Row) => a + (l.variance ?? 0), 0)
      : null
  return {
    id: c.id,
    code: c.code,
    status: c.status,
    scope: c.scope,
    locationId: c.locationId,
    locationPath: c.location?.fullPath ?? null,
    productId: c.productId,
    productSku: c.product?.sku ?? null,
    productName: c.product?.name ?? null,
    dueDate: c.dueDate.toISOString(),
    cadence: c.cadence,
    note: c.note,
    completedAt: iso(c.completedAt),
    lines: c.lines.map((l: Row): CountLineDTO => ({
      id: l.id,
      productId: l.productId,
      sku: l.product.sku,
      productName: l.product.name,
      unit: l.product.unit,
      systemQty: l.systemQty,
      countedQty: l.countedQty,
      variance: l.variance,
    })),
    daysOverdue,
    totalVariance,
    adjustmentCodes,
  }
}

export function toSuggestionDTO(s: Row, need?: Row): ReorderSuggestionDTO {
  const n =
    need ??
    (s.product
      ? {
          onHand: s.product.stocks?.reduce((a: number, x: Row) => a + x.onHand, 0) ?? 0,
          reserved: 0,
          incoming: 0,
          projectedAvailable: 0,
        }
      : { onHand: 0, reserved: 0, incoming: 0, projectedAvailable: 0 })
  return {
    id: s.id,
    productId: s.productId,
    sku: s.product.sku,
    productName: s.product.name,
    unit: s.product.unit,
    category: s.product.category,
    onHand: n.onHand,
    reserved: n.reserved,
    incoming: n.incoming,
    projectedAvailable: n.projectedAvailable,
    reorderPoint: s.product.reorderPoint,
    dailyUsage: n.dailyUsage ?? s.product.dailyUsage,
    planDailyUsage: n.planDailyUsage ?? s.product.dailyUsage,
    forecast: n.forecast ?? null,
    safetyStock: s.product.safetyStock,
    suggestedQty: s.suggestedQty,
    preferredName: s.preferredName,
    preferredLeadDays: s.preferredLeadDays,
    minOrderQty: 0,
    orderMultiple: 1,
    reason: s.reason,
    status: s.status,
    decidedAt: iso(s.decidedAt),
    receiptCode: s.receiptCode,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}
