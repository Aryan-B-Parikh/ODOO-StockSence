import type { DashboardKpis, StockMoveStatus, StockMoveType } from './inventory.types.js';

/**
 * Pure dashboard KPI computation — docs/06_BUSINESS_RULES.md BR19–BR22 plus the
 * Phase 2 dynamic-filter extension (R2.7/R2.8).
 *
 * The backend loads the already warehouse/location/category-scoped rows from the
 * database and calls this function; the frontend MSW mock uses the same function so
 * mock and live behavior cannot drift. No database access here.
 */

export interface DashboardMoveRow {
  type: StockMoveType;
  status: StockMoveStatus;
  /** ISO date (YYYY-MM-DD) of stock_moves.schedule_date. */
  scheduleDate: string;
}

export interface DashboardStockRow {
  productId: string;
  onHand: number;
  reorderMin: number | null;
}

export interface SummarizeDashboardInput {
  moves: DashboardMoveRow[];
  stock: DashboardStockRow[];
  /** Today as YYYY-MM-DD (server date). */
  today: string;
  /** Optional R2.7 document-type filter. */
  type?: StockMoveType | null;
  /** Optional R2.8 status filter. */
  status?: StockMoveStatus | null;
}

function matchesType(row: DashboardMoveRow, type?: StockMoveType | null): boolean {
  return !type || row.type === type;
}

/**
 * Default (no status filter): "open" = NOT IN (DONE, CANCELED), per BR19/BR20.
 * When a status filter is supplied it replaces the default open predicate so the
 * dynamic status filter actually constrains every displayed count (R2.8).
 */
function matchesStatus(row: DashboardMoveRow, status?: StockMoveStatus | null): boolean {
  if (status) return row.status === status;
  return row.status !== 'DONE' && row.status !== 'CANCELED';
}

export function summarizeDashboard(input: SummarizeDashboardInput): DashboardKpis {
  const scopedMoves = input.moves.filter(
    (move) => matchesType(move, input.type) && matchesStatus(move, input.status),
  );

  const ofType = (type: StockMoveType) => scopedMoves.filter((move) => move.type === type);
  const receipts = ofType('RECEIPT');
  const deliveries = ofType('DELIVERY');

  const toReceive = receipts.filter((move) => move.scheduleDate <= input.today).length;
  const receiptLate = receipts.filter((move) => move.scheduleDate < input.today).length;
  const receiptOperations = receipts.filter((move) => move.scheduleDate > input.today).length;

  const toDeliver = deliveries.filter((move) => move.scheduleDate <= input.today).length;
  const deliveryLate = deliveries.filter((move) => move.scheduleDate < input.today).length;
  const waiting = deliveries.filter((move) => move.status === 'WAITING').length;
  const deliveryOperations = deliveries.filter((move) => move.scheduleDate > input.today).length;

  // BR22: product-level low stock — sum across all (scoped) locations ≤ reorder_min.
  const perProduct = new Map<string, { onHand: number; reorderMin: number | null }>();
  for (const row of input.stock) {
    const current = perProduct.get(row.productId) ?? { onHand: 0, reorderMin: null };
    current.onHand += row.onHand;
    if (current.reorderMin == null && row.reorderMin != null) current.reorderMin = row.reorderMin;
    perProduct.set(row.productId, current);
  }

  let totalProductsInStock = 0;
  let lowStockCount = 0;
  for (const product of perProduct.values()) {
    if (product.onHand > 0) totalProductsInStock += 1;
    if (product.reorderMin != null && product.onHand <= product.reorderMin) lowStockCount += 1;
  }

  return {
    totalProductsInStock,
    lowStockCount,
    pendingReceipts: receipts.length,
    pendingDeliveries: deliveries.length,
    internalTransfersScheduled: ofType('TRANSFER').length,
    receiptSummary: { toReceive, late: receiptLate, operations: receiptOperations },
    deliverySummary: {
      toDeliver,
      late: deliveryLate,
      waiting,
      operations: deliveryOperations,
    },
  };
}
