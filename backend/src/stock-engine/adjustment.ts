import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/errors.js';
import type { ReferenceGenerator, StockEngine, StockEngineDb } from './interface.js';

export interface ApplyStockAdjustmentParams {
  productId: string;
  locationId: string;
  countedQuantity: number;
  note?: string;
  responsibleUserId: string;
}

export interface ApplyStockAdjustmentOptions {
  /**
   * Explicit adjustments (`POST /adjustments`) record a DONE document even when the delta is
   * zero — no line and no ledger row (BR15), but the reference/note stay auditable
   * (PHASE4_DECISIONS §2). `PATCH /stock` keeps its no-op behavior for delta 0.
   */
  createOnZeroDelta?: boolean;
}

export interface StockAdjustmentOutcome {
  reference: string | null;
  moveId: string | null;
  before: number;
  after: number;
  delta: number;
}

/**
 * Orchestrates a single stock adjustment (BR15/BR16), used by product initial stock,
 * the manual Stock-tab edit (05 §3) and the Phase 4 Adjustment form (05 §9): a DONE
 * `ADJUSTMENT` stock_move is created so every ledger row has a parent document, then the
 * stock-engine applies the count.
 *
 * Must run inside the caller's transaction (`db`). When the counted quantity equals the
 * recorded quantity (delta = 0) no ledger row is written (BR15); the stock row is still
 * ensured so the product/location pair remains visible in the Stock tab.
 */
export async function applyStockAdjustment(
  db: StockEngineDb,
  engine: StockEngine,
  referenceGenerator: ReferenceGenerator,
  params: ApplyStockAdjustmentParams,
  options: ApplyStockAdjustmentOptions = {},
): Promise<StockAdjustmentOutcome> {
  const location = await db.location.findUnique({ where: { id: params.locationId } });
  if (!location) {
    throw ApiError.validation('Location not found', { locationId: 'Location not found' });
  }

  const product = await db.product.findUnique({ where: { id: params.productId }, select: { id: true } });
  if (!product) {
    throw ApiError.validation('Product not found', { productId: 'Product not found' });
  }

  const current = await engine.getStock(params.productId, params.locationId, db);
  const recorded = current?.onHand ?? 0;
  const delta = Math.round((params.countedQuantity - recorded) * 1000) / 1000;

  const now = new Date();
  const adjustmentFields = {
    type: 'ADJUSTMENT',
    warehouseId: location.warehouseId,
    scheduleDate: now,
    responsibleUserId: params.responsibleUserId,
    status: 'DONE',
    note: params.note ?? null,
    recordedQuantity: new Prisma.Decimal(recorded),
    countedQuantity: new Prisma.Decimal(params.countedQuantity),
    validatedAt: now,
  };

  if (delta === 0) {
    await engine.setOnHandFromCount(
      { productId: params.productId, locationId: params.locationId, countedQuantity: params.countedQuantity },
      db,
    );

    if (!options.createOnZeroDelta) {
      return { reference: null, moveId: null, before: recorded, after: params.countedQuantity, delta: 0 };
    }

    const reference = await referenceGenerator.next(location.warehouseId, 'ADJ', db);
    const move = await db.stockMove.create({
      data: { reference, ...adjustmentFields, toLocationId: location.id },
    });
    return { reference, moveId: move.id, before: recorded, after: params.countedQuantity, delta: 0 };
  }

  const reference = await referenceGenerator.next(location.warehouseId, 'ADJ', db);

  const move = await db.stockMove.create({
    data: {
      reference,
      ...adjustmentFields,
      fromLocationId: delta < 0 ? location.id : null,
      toLocationId: delta > 0 ? location.id : null,
      lines: { create: [{ productId: params.productId, quantity: Math.abs(delta) }] },
    },
  });

  const result = await engine.setOnHandFromCount(
    {
      productId: params.productId,
      locationId: params.locationId,
      countedQuantity: params.countedQuantity,
      move: { stockMoveId: move.id, reference, movedAt: now },
    },
    db,
  );

  return {
    reference,
    moveId: move.id,
    before: result.before.onHand,
    after: result.after.onHand,
    delta: result.delta,
  };
}
