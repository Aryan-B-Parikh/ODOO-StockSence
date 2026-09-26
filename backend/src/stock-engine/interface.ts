/**
 * Stock-engine contract — drafted in Phase 1 (Person 3), implemented in Phase 2
 * (Person 1) in `stock-engine.ts`.
 *
 * Per 03_ARCHITECTURE.md §4 and BR10: ONLY the stock-engine may write to the `stock`
 * table (`on_hand_qty`, `reserved_qty`) or insert into `stock_ledger`. Receipts,
 * Deliveries, Transfers and Adjustments (Phase 3/4) call these functions instead of
 * touching SQL/Prisma directly.
 *
 * References: BR11 (free_to_use), BR12 (receipt increases), BR13 (delivery decreases,
 * CONFLICT when insufficient), BR14 (transfer two-leg, total unchanged), BR15
 * (adjustment sets counted quantity), BR16 (one ledger row per line at DONE),
 * BR7-BR9 (reference numbering).
 *
 * Phase 2 extension (documented in 14_CHANGELOG.md): every method accepts an optional
 * `db` handle (PrismaClient or an open `$transaction` client) so multi-line operation
 * validation in Phase 3 can run the status transition, all stock changes and all ledger
 * rows in ONE transaction. Defaults to the engine's PrismaClient.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export type StockDirection = 'IN' | 'OUT';
export type StockOperationType = 'IN' | 'OUT' | 'INT' | 'ADJ';

/** Prisma client or an open interactive transaction client. */
export type StockEngineDb = PrismaClient | Prisma.TransactionClient;

export interface StockSnapshot {
  productId: string;
  locationId: string;
  onHand: number;
  reserved: number;
  /** BR11: freeToUse = onHand - reserved, computed at read time, never persisted. */
  freeToUse: number;
}

/** Context the caller supplies so ledger rows written by the engine point back at the
 *  parent stock_move. */
export interface StockMoveContext {
  stockMoveId: string;
  reference: string;
  contactId?: string | null;
  /** Ledger `moved_at`; defaults to now() for adjustments (no parent DONE transition). */
  movedAt: Date;
}

export interface StockLineInput {
  productId: string;
  quantity: number;
}

export interface IncreaseStockInput extends StockLineInput {
  locationId: string;
  move: StockMoveContext;
}

export interface DecreaseStockInput extends StockLineInput {
  locationId: string;
  move: StockMoveContext;
}

export interface TransferStockInput extends StockLineInput {
  fromLocationId: string;
  toLocationId: string;
  move: StockMoveContext;
}

export interface SetStockCountInput {
  productId: string;
  locationId: string;
  countedQuantity: number;
  note?: string;
  /** Required only when the delta is non-zero (BR15: no ledger row for delta = 0). */
  move?: StockMoveContext;
}

export interface AdjustmentResult {
  before: StockSnapshot;
  after: StockSnapshot;
  delta: number;
}

export interface StockEngine {
  /** Read current stock (and computed freeToUse) for a product/location pair. */
  getStock(productId: string, locationId: string, db?: StockEngineDb): Promise<StockSnapshot | null>;

  /**
   * BR12: Receipt validation. Increments on_hand_qty at the destination location and
   * writes one IN ledger row per line.
   */
  increaseOnHand(input: IncreaseStockInput, db?: StockEngineDb): Promise<StockSnapshot>;

  /**
   * BR13: Delivery validation. Decrements on_hand_qty at the source location and writes
   * one OUT ledger row per line. Throws CONFLICT when on_hand_qty would go below zero;
   * the caller keeps the delivery in WAITING.
   */
  decreaseOnHand(input: DecreaseStockInput, db?: StockEngineDb): Promise<StockSnapshot>;

  /**
   * BR14/BR16: Transfer validation. Decrements the source and increments the destination
   * by the same quantity atomically, writing two ledger rows per line (OUT leg + IN leg).
   * Total system stock for the product is unchanged. Throws CONFLICT when the source
   * free_to_use is insufficient (transfer-1 OPEN DECISION in 07_STATUS_WORKFLOWS.md).
   */
  transfer(input: TransferStockInput, db?: StockEngineDb): Promise<{ from: StockSnapshot; to: StockSnapshot }>;

  /**
   * BR15: Adjustment apply. Sets on_hand_qty to countedQuantity, returns before/after and
   * delta. Writes one ledger row (direction = sign of delta); writes none when delta = 0.
   */
  setOnHandFromCount(input: SetStockCountInput, db?: StockEngineDb): Promise<AdjustmentResult>;

  /**
   * BR11/BR17 support: reservation lifecycle for open Delivery/Transfer lines.
   * Phase 2 note: no Phase 2 endpoint creates reservations (reserved_qty stays 0, so
   * freeToUse == onHand); the primitives exist for Phase 3, whose kickoff must still
   * decide WHEN reservations are taken/released (open question, see INTERFACE.md).
   */
  reserve(input: StockLineInput & { locationId: string }, db?: StockEngineDb): Promise<StockSnapshot>;
  releaseReservation(input: StockLineInput & { locationId: string }, db?: StockEngineDb): Promise<StockSnapshot>;
}

/** Factory signature exposed by the stock-engine module. */
export type CreateStockEngine = (prisma: PrismaClient) => StockEngine;

/** Reference generator (`sequence` module): `<WH>/<OP>/<0001>` per BR7-BR9. */
export interface ReferenceGenerator {
  /**
   * Atomically increments sequence_counters(warehouse_id, operation_type) and returns the
   * formatted, immutable reference (e.g. WH/IN/0001). Pass `db` to number the document
   * inside the same transaction that creates it (BR8).
   */
  next(warehouseId: string, operationType: StockOperationType, db?: StockEngineDb): Promise<string>;
}
