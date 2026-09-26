/**
 * Phase 2 contract types (docs/05_API_CONTRACTS.md §2–§5).
 */

export const STOCK_MOVE_TYPES = ['RECEIPT', 'DELIVERY', 'TRANSFER', 'ADJUSTMENT'] as const;
export type StockMoveType = (typeof STOCK_MOVE_TYPES)[number];

export const STOCK_MOVE_STATUSES = ['DRAFT', 'WAITING', 'READY', 'DONE', 'CANCELED'] as const;
export type StockMoveStatus = (typeof STOCK_MOVE_STATUSES)[number];

/** Standard list envelope, docs/05_API_CONTRACTS.md §0. */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET /products item + POST/PATCH /products response (05 §2). */
export interface ProductSummary {
  id: string;
  name: string;
  sku: string;
  categoryId: string | null;
  categoryName: string | null;
  uom: string;
  costPerUnit: number | null;
  reorderMin: number | null;
  reorderMax: number | null;
}

/** 05 §2 categories. */
export interface CategorySummary {
  id: string;
  name: string;
}

/** 05 §4 warehouses. */
export interface WarehouseSummary {
  id: string;
  name: string;
  shortCode: string;
  address: string | null;
}

/** 05 §4 locations. */
export interface LocationSummary {
  id: string;
  warehouseId: string;
  name: string;
  shortCode: string;
}

/**
 * 05 §3 stock row.
 * Phase 2 additive extension (documented in 05 §3 / 14_CHANGELOG): `reorderMin`,
 * `lowStock` and `outOfStock` so the Stock tab can render low/out-of-stock badges using
 * the BR22 product-level rule (sum across locations ≤ reorder_min).
 */
export interface StockRow {
  productId: string;
  productName: string;
  sku: string;
  costPerUnit: number | null;
  locationId: string;
  onHand: number;
  reserved: number;
  freeToUse: number;
  reorderMin: number | null;
  lowStock: boolean;
  outOfStock: boolean;
}

/** GET /dashboard/kpis response (05 §5). */
export interface DashboardKpis {
  totalProductsInStock: number;
  lowStockCount: number;
  pendingReceipts: number;
  pendingDeliveries: number;
  internalTransfersScheduled: number;
  receiptSummary: {
    toReceive: number;
    late: number;
    operations: number;
  };
  deliverySummary: {
    toDeliver: number;
    late: number;
    waiting: number;
    operations: number;
  };
}
