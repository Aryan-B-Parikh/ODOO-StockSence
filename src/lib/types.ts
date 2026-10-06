/**
 * StockSense — shared DTOs (API ⇄ frontend contract).
 * Backend routes map Prisma rows + engine computations into these shapes.
 */

// ---------- Auth ----------

export interface SessionUser {
  id: number
  name: string
  email: string
  role: string
  permissions: string[]
}

// ---------- Products ----------

export interface StockByLocationDTO {
  locationId: number
  fullPath: string
  warehouseName: string
  onHand: number
  reserved: number
  available: number
  incoming: number
  inTransit: number
  damaged: number
}

export interface SupplierLinkDTO {
  supplierId: number
  name: string
  preferred: boolean
  leadTimeDays: number
  costPrice: number
  minOrderQty: number
  orderMultiple: number
  reliability: number
  damageRate: number
}

export interface ProductDTO {
  id: number
  sku: string
  name: string
  category: string
  unit: string
  unitCost: number
  reorderPoint: number
  dailyUsage: number
  safetyStock: number
  valueClass: string // HIGH | MEDIUM | LOW
  notes: string | null
  active: boolean
  // aggregated across locations (available = onHand − reserved, never oversold)
  onHand: number
  reserved: number
  available: number
  incoming: number
  inTransit: number
  damaged: number
  stockValue: number // onHand × unitCost
  belowReorder: boolean // projected available (onHand + incoming − reserved) < reorderPoint
  stockoutRisk: boolean // projected available ≤ safetyStock
  suppliers: SupplierLinkDTO[]
  stockByLocation: StockByLocationDTO[]
}

export interface ProductListDTO {
  products: ProductDTO[]
  categories: string[]
  summary: {
    totalSkus: number
    totalStockValue: number
    belowReorder: number
    stockoutRisk: number
  }
}

// ---------- Suppliers ----------

/**
 * A supplier → product link (the supplier-facing view of a ProductSupplier row).
 * Named SupplierProductLinkDTO because SupplierLinkDTO (above) is already the
 * product-facing view (product → its suppliers).
 */
export interface SupplierProductLinkDTO {
  productId: number
  sku: string
  productName: string
  unit: string
  preferred: boolean
  costPrice: number
  minOrderQty: number
  orderMultiple: number
}

/**
 * Measured supplier performance, computed from that supplier's real receipt
 * history (on-time = received on/before the expected date; damage = damaged
 * units ÷ received units from the immutable ledger). Distinct from the
 * editable `reliability`/`damageRate` plan fields so the form keeps working.
 */
export interface SupplierScorecardDTO {
  receipts: number // received receipts counted
  onTimeRate: number | null // 0-1, null until there is history
  damageRate: number | null // 0-1, null until there is history
  avgLeadDays: number | null // PO created → received, averaged
  measured: boolean // true when at least one received receipt exists
  basis: string // human-readable provenance
}

/** Full supplier record with its linked products and link economics. */
export interface SupplierDTO {
  id: number
  name: string
  contact: string | null
  leadTimeDays: number
  reliability: number // on-time delivery rate 0-1 (editable plan/estimate)
  damageRate: number // fraction of goods damaged 0-1 (editable plan/estimate)
  notes: string | null
  productCount: number
  products: SupplierProductLinkDTO[]
  scorecard: SupplierScorecardDTO
}

// ---------- Receipts ----------

export interface ReceiptLineDTO {
  id: number
  productId: number
  sku: string
  productName: string
  unit: string
  locationId: number
  locationPath: string
  expectedQty: number
  receivedQty: number | null
  damagedQty?: number | null
}

export interface ReceiptDTO {
  id: number
  code: string
  status: string // EXPECTED | RECEIVED | CANCELLED
  supplierId: number | null
  supplierName: string | null
  warehouseName: string
  expectedAt: string
  receivedAt: string | null
  note: string | null
  createdAt: string
  createdBy: number | null
  lines: ReceiptLineDTO[]
  daysLate: number // >0 only for EXPECTED past due
}

export interface ReceiptListDTO {
  receipts: ReceiptDTO[]
}

// ---------- Delivery orders ----------

export interface DeliveryLineDTO {
  id: number
  productId: number
  sku: string
  productName: string
  unit: string
  locationId: number
  locationPath: string
  qty: number
  pickedQty: number | null
  availableAtLocation: number
}

export interface DeliveryDTO {
  id: number
  code: string
  customer: string
  status: string // RESERVED | PICKED | PACKED | DELIVERED | CANCELLED
  note: string | null
  createdAt: string
  pickedAt: string | null
  packedAt: string | null
  deliveredAt: string | null
  createdBy: number | null
  lines: DeliveryLineDTO[]
}

export interface DeliveryListDTO {
  deliveries: DeliveryDTO[]
}

// ---------- Transfers ----------

export interface TransferLineDTO {
  id: number
  productId: number
  sku: string
  productName: string
  unit: string
  qty: number
  availableAtSource: number
}

export interface TransferDTO {
  id: number
  code: string
  status: string // IN_TRANSIT | RECEIVED | CANCELLED
  fromLocationId: number
  fromLocationPath: string
  toLocationId: number
  toLocationPath: string
  note: string | null
  shippedAt: string
  receivedAt: string | null
  createdBy: number | null
  lines: TransferLineDTO[]
}

export interface TransferListDTO {
  transfers: TransferDTO[]
}

// ---------- Adjustments ----------

export interface AdjustmentLineDTO {
  id: number
  productId: number
  sku: string
  productName: string
  unit: string
  locationId: number
  locationPath: string
  systemQty: number
  countedQty: number
  delta: number
}

export interface AdjustmentDTO {
  id: number
  code: string
  status: string // PENDING_APPROVAL | POSTED | REJECTED
  severity: string // LOW | MEDIUM | HIGH
  reason: string
  note: string | null
  createdByName?: string | null
  approvedByName?: string | null
  createdAt: string
  postedAt: string | null
  lines: AdjustmentLineDTO[]
}

export interface AdjustmentListDTO {
  adjustments: AdjustmentDTO[]
}

// ---------- Ledger (Move History) ----------

export interface LedgerEntryDTO {
  id: number
  code: string // LEDGER-2026-000184
  docType: string // RECEIPT | DELIVERY | TRANSFER | ADJUSTMENT | COUNT | OPENING
  docCode: string // RCPT-1042 …
  productId: number
  sku: string
  productName: string
  unit: string
  locationId: number
  locationPath: string
  field: string // ON_HAND | RESERVED | INCOMING | IN_TRANSIT | DAMAGED
  prevQty: number
  newQty: number
  diff: number
  reason: string | null
  performedByName?: string | null
  createdAt: string
}

export interface LedgerListDTO {
  entries: LedgerEntryDTO[]
  total: number
  docTypes: string[]
}

// ---------- Cycle counts ----------

export interface CountLineDTO {
  id: number
  productId: number
  sku: string
  productName: string
  unit: string
  systemQty: number
  countedQty: number | null
  variance: number | null
}

export interface CycleCountDTO {
  id: number
  code: string
  status: string // OPEN | COMPLETED | CANCELLED
  scope: string // LOCATION | PRODUCT
  locationId: number | null
  locationPath: string | null
  productId: number | null
  productSku: string | null
  productName: string | null
  dueDate: string
  cadence: string // WEEKLY | MONTHLY | QUARTERLY
  note: string | null
  completedAt: string | null
  lines: CountLineDTO[]
  daysOverdue: number
  totalVariance: number | null
  adjustmentCodes: string[]
}

export interface CountListDTO {
  counts: CycleCountDTO[]
}

// ---------- Reorder (Phase 3) ----------

/**
 * Demand forecast derived from the immutable ledger: units that physically
 * left the warehouse on delivered/packed orders inside the rolling window,
 * blended with the editable planning figure. Not a heuristic — real history.
 */
export interface DemandForecastDTO {
  observedDaily: number // measured units/day from real delivery outflows
  unitsOut: number // total units shipped inside the window
  deliveries: number // number of delivery outflow events observed
  windowDays: number
  measured: boolean // true when at least one delivery was observed
  method: string // plain-language provenance of the figure
}

export interface ReorderSuggestionDTO {
  id: number
  productId: number
  sku: string
  productName: string
  unit: string
  category: string
  onHand: number
  reserved: number
  incoming: number
  projectedAvailable: number
  reorderPoint: number
  dailyUsage: number // forecasted demand used by the engine
  planDailyUsage: number // the editable planning figure (Product.dailyUsage)
  forecast: DemandForecastDTO | null
  safetyStock: number
  suggestedQty: number
  preferredName: string
  preferredLeadDays: number
  minOrderQty: number
  orderMultiple: number
  reason: string
  status: string // PENDING | ACCEPTED | DISMISSED
  decidedAt: string | null
  receiptCode: string | null
  createdAt: string
  updatedAt: string
}

export interface ReorderListDTO {
  suggestions: ReorderSuggestionDTO[]
}

// ---------- Attention / Exceptions (Phase 4) ----------

export interface AttentionItemDTO {
  key: string
  kind: string // BELOW_REORDER | STOCKOUT | PENDING_ADJUSTMENT | REVIEW_FLAG | DELAYED_RECEIPT | REORDER_SUGGESTION
  severity: 'red' | 'orange' | 'green'
  icon: string
  title: string
  detail: string
  href: string // app view to open
}

export interface AttentionDTO {
  summary: {
    belowReorder: number
    stockouts: number
    pendingApprovalAdjustments: number
    openFlags: number
    delayedReceipts: number
    pendingSuggestions: number
    inTransitTransfers: number
    openCounts: number
  }
  items: AttentionItemDTO[]
  flags: ExceptionFlagDTO[]
}

export interface ExceptionFlagDTO {
  id: number
  type: string
  severity: string
  message: string
  refCode: string | null
  status: string
  createdAt: string
}

// ---------- Dashboard ----------

export interface DashboardDTO {
  kpis: {
    totalStockValue: number
    availableValue: number
    reservedValue: number
    incomingValue: number
    inTransitValue: number
    damagedValue: number
    skuCount: number
    lowStockCount: number
    stockoutCount: number
    openDeliveries: number
    inTransitTransfers: number
    pendingAdjustments: number
    expectedReceipts: number
  }
  valueByCategory: { category: string; value: number }[]
  racks: { rackCode: string; zoneName: string; locationCount: number; onHandValue: number; fillPct: number }[]
  flows: { date: string; received: number; delivered: number }[]
  activity: LedgerEntryDTO[]
  attention: AttentionDTO
  metrics: PilotMetricsDTO
}

// ---------- Phase 5 pilot metrics (ledger-derived) ----------

export interface PilotMetricsDTO {
  inventoryAccuracy: { pct: number; countedLines: number; varianceLines: number; label: string }
  stockoutIncidents: { current: number; skus: string[]; label: string }
  oversellingPrevented: { blockedAttempts: number; label: string }
  reorderAcceptance: { accepted: number; dismissed: number; pct: number; label: string }
  cycleVarianceRate: { counts: number; withVariance: number; pct: number; label: string }
  flagReviewTime: { openFlags: number; avgHoursOpen: number | null; label: string }
  alertToAction: { avgHours: number | null; sampled: number; label: string }
}

// ---------- Meta (for forms) ----------

export interface MetaDTO {
  warehouses: { id: number; code: string; name: string }[]
  locations: { id: number; fullPath: string; warehouseName: string; zoneName: string; rackCode: string; code: string }[]
  suppliers: { id: number; name: string; leadTimeDays: number }[]
  products: { id: number; sku: string; name: string; unit: string; category: string; onHand: number; reserved: number; available: number }[]
  categories: string[]
}

// ---------- Search ----------

export interface SearchResultDTO {
  id: number
  sku: string
  name: string
  category: string
  unit: string
  onHand: number
  available: number
  belowReorder: boolean
}
