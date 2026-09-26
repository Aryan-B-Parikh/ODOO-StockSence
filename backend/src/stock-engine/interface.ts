/**
 * Stock-engine interface draft — Phase 1 deliverable (Person 3 draft, Person 1 owns
 * the Phase 2 implementation).
 *
 * Per 03_ARCHITECTURE.md §4 and BR10: ONLY the stock-engine may write to the `stock`
 * table (`on_hand_qty`, `reserved_qty`) or insert into `stock_ledger`. Receipts,
 * Deliveries, Transfers and Adjustments (Person 3) call these functions instead of
 * touching SQL/Prisma directly. This file contains types and signatures only — no
 * implementation, no runtime code.
 *
 * References: BR11 (free_to_use), BR12 (receipt increases), BR13 (delivery decreases,
 * CONFLICT when insufficient), BR14 (transfer two-leg, total unchanged), BR15
 * (adjustment sets counted quantity), BR16 (one ledger row per line at DONE),
 * BR7-BR9 (reference numbering).
 */
import type { PrismaClient } from '@prisma/client';

export type StockDirection = 'IN' | 'OUT';
export type StockOperationType = 'IN' | 'OUT' | 'INT' | 'ADJ';

export interface StockSnapshot {
  productId: string;
  locationId: string;
  onHand: number;
  reserved: number;
  /** BR11: freeToUse = onHand - reserved, computed at read time, never persisted. */
  freeToUse: number;
}

/** Context the caller (receipts/deliveries/transfers/adjustments module) supplies so
 *  ledger rows written by the engine point back at the parent stock_move. */
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

export interface SetStockCountInput extends StockLineInput {
  locationId: string;
  countedQuantity: number;
  move: StockMoveContext;
  note?: string;
}

export interface AdjustmentResult {
  before: StockSnapshot;
  after: StockSnapshot;
  delta: number;
}

export interface StockEngine {
  /** Read current stock (and computed freeToUse) for a product/location pair. */
  getStock(productId: string, locationId: string): Promise<StockSnapshot | null>;

  /**
   * BR12: Receipt validation. Increments on_hand_qty at the destination location and
   * writes one IN ledger row per line, inside the caller's transaction.
   */
  increaseOnHand(input: IncreaseStockInput): Promise<StockSnapshot>;

  /**
   * BR13: Delivery validation. Decrements on_hand_qty at the source location and writes
   * one OUT ledger row per line. Throws a CONFLICT error when on_hand_qty would go
   * below zero; the caller keeps the delivery in WAITING.
   */
  decreaseOnHand(input: DecreaseStockInput): Promise<StockSnapshot>;

  /**
   * BR14/BR16: Transfer validation. Decrements the source and increments the destination
   * by the same quantity in ONE database transaction, writing two ledger rows per line
   * (OUT leg + IN leg). Total system stock for the product is unchanged.
   * Throws CONFLICT (BR13-style) when source free_to_use is insufficient — see the
   * transfer-1 OPEN DECISION in 07_STATUS_WORKFLOWS.md.
   */
  transfer(input: TransferStockInput): Promise<{ from: StockSnapshot; to: StockSnapshot }>;

  /**
   * BR15: Adjustment apply. Sets on_hand_qty to countedQuantity, returns before/after and
   * delta. Writes one ledger row (direction = sign of delta); writes none when delta = 0.
   */
  setOnHandFromCount(input: SetStockCountInput): Promise<AdjustmentResult>;

  /**
   * BR11/BR17 support: reservation lifecycle for open Delivery/Transfer lines.
   * NOTE: reserved_qty is defined in 04_DATABASE_SCHEMA.md as "allocated to open
   * Delivery/Transfer lines", but no BR specifies exactly when it is incremented or
   * released yet — flagged as an open question for Phase 3 kickoff (see INTERFACE.md).
   */
  reserve(input: StockLineInput & { locationId: string }): Promise<StockSnapshot>;
  releaseReservation(input: StockLineInput & { locationId: string }): Promise<StockSnapshot>;
}

/** Factory signature the stock-engine module will expose in Phase 2. */
export type CreateStockEngine = (prisma: PrismaClient) => StockEngine;

/** Reference generator (`sequence` module, Person 1): `<WH>/<OP>/<0001>` per BR7-BR9. */
export interface ReferenceGenerator {
  /** Atomically increments sequence_counters(warehouse_id, operation_type) and returns
   *  the formatted, immutable reference (e.g. WH/IN/0001). */
  next(warehouseId: string, operationType: StockOperationType): Promise<string>;
}
