import type { StockMoveStatus, StockMoveType } from './inventory.types.js';

/** Phase 3 contract types (docs/05_API_CONTRACTS.md §4b, §6, §7). */

export const CONTACT_TYPES = ['VENDOR', 'CUSTOMER'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export interface ContactSummary {
  id: string;
  name: string;
  type: ContactType;
  email: string | null;
  phone: string | null;
}

/** One product line of a receipt/delivery document. */
export interface DocumentLine {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  uom: string;
  quantity: number;
}

/** BR18/R6.11: a delivery line that is currently short on stock. */
export interface DeliveryLine extends DocumentLine {
  outOfStock: boolean;
}

export interface ReceiptSummary {
  id: string;
  reference: string;
  status: StockMoveStatus;
  scheduleDate: string;
  warehouseId: string;
  fromContactId: string;
  fromContactName: string;
  fromContactEmail: string | null;
  toLocationId: string;
  toLocationName: string;
  responsibleUserId: string;
}

export interface ReceiptDetail extends ReceiptSummary {
  responsibleUserName: string | null;
  validatedAt: string | null;
  createdAt: string;
  note: string | null;
  lines: DocumentLine[];
}

export interface DeliverySummary {
  id: string;
  reference: string;
  status: StockMoveStatus;
  scheduleDate: string;
  warehouseId: string;
  fromLocationId: string;
  fromLocationName: string;
  toContactId: string;
  toContactName: string;
  toContactEmail: string | null;
  operationType: string | null;
  responsibleUserId: string;
}

export interface DeliveryDetail extends DeliverySummary {
  responsibleUserName: string | null;
  validatedAt: string | null;
  createdAt: string;
  note: string | null;
  lines: DeliveryLine[];
}

export interface TransferSummary {
  id: string;
  reference: string;
  status: StockMoveStatus;
  scheduleDate: string;
  warehouseId: string;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  responsibleUserId: string;
}

export interface TransferDetail extends TransferSummary {
  responsibleUserName: string | null;
  validatedAt: string | null;
  createdAt: string;
  note: string | null;
  lines: DocumentLine[];
}

/** §9 Stock Adjustment (single-step, applied immediately). */
export interface AdjustmentSummary {
  id: string;
  reference: string | null;
  status: 'DONE';
  scheduleDate: string;
  movedAt: string;
  productId: string;
  productName: string;
  sku: string | null;
  locationId: string;
  locationName: string;
  recordedQuantity: number;
  countedQuantity: number;
  delta: number;
  note: string | null;
}

export type AdjustmentDetail = AdjustmentSummary;

export type LedgerDirection = 'IN' | 'OUT';

/** §10 Move History row — one row per stock_ledger entry (R9.3). */
export interface MoveHistoryRow {
  id: string;
  reference: string;
  date: string;
  movedAt: string;
  contactName: string | null;
  from: string;
  to: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  direction: LedgerDirection;
  status: StockMoveStatus;
  type: StockMoveType;
}

/** GET /receipts/:id/print | GET /deliveries/:id/print payload (R5.12). */
export interface PrintPayload {
  type: 'RECEIPT' | 'DELIVERY';
  reference: string;
  status: StockMoveStatus;
  date: string;
  contactName: string | null;
  locationName: string;
  lines: Array<{ productName: string; sku: string; uom: string; quantity: number }>;
}
