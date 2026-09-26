import { ApiError } from '../lib/errors.js';
import type { StockEngine, StockEngineDb } from '../stock-engine/interface.js';

/**
 * Reservation lifecycle for stock documents — docs/reviews/PHASE3_DECISIONS.md §1 and
 * docs/reviews/PHASE4_DECISIONS.md §1.
 *
 * Deliveries: DRAFT/READY hold `reserved_qty` equal to their line quantities at the source
 * location; WAITING deliveries hold none.
 * Transfers: READY holds the full reservation (reserved at confirm); DRAFT holds none.
 * All helpers operate on the caller's transaction so reservation changes commit/rollback
 * atomically with the document.
 */

export interface ReservationLine {
  productId: string;
  quantity: number;
}

export function aggregateQuantityByProduct(lines: ReservationLine[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
  }
  return totals;
}

/** Releases the reservation previously held by a document (per-product aggregate). */
export async function releaseReservation(
  db: StockEngineDb,
  engine: StockEngine,
  locationId: string,
  lines: ReservationLine[],
): Promise<void> {
  for (const [productId, quantity] of aggregateQuantityByProduct(lines)) {
    if (quantity <= 0) continue;
    await engine.releaseReservation({ productId, locationId, quantity }, db);
  }
}

/**
 * All-or-nothing reservation attempt. Returns false (without throwing) when any product
 * is short on free-to-use stock, rolling back the reservations already taken in this
 * attempt so the caller can keep the document in WAITING.
 */
export async function tryReserve(
  db: StockEngineDb,
  engine: StockEngine,
  locationId: string,
  lines: ReservationLine[],
): Promise<boolean> {
  const taken: Array<{ productId: string; quantity: number }> = [];

  for (const [productId, quantity] of aggregateQuantityByProduct(lines)) {
    try {
      await engine.reserve({ productId, locationId, quantity }, db);
      taken.push({ productId, quantity });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        for (const entry of taken.reverse()) {
          await engine.releaseReservation({ ...entry, locationId }, db);
        }
        return false;
      }
      throw error;
    }
  }
  return true;
}

/**
 * 07_STATUS_WORKFLOWS "Re-evaluation": after a stock-changing event at a location,
 * re-check open WAITING deliveries FIFO and promote those that now fit to READY.
 * Called by receipt validation and manual stock adjustments (Phase 4 transfers will
 * call it too).
 */
export async function recheckWaitingDeliveries(
  db: StockEngineDb,
  engine: StockEngine,
  context: { locationId: string; productIds?: string[] },
): Promise<number> {
  const waiting = await db.stockMove.findMany({
    where: {
      type: 'DELIVERY',
      status: 'WAITING',
      fromLocationId: context.locationId,
      ...(context.productIds && context.productIds.length > 0
        ? { lines: { some: { productId: { in: context.productIds } } } }
        : {}),
    },
    include: { lines: true },
    orderBy: { createdAt: 'asc' },
  });

  let promoted = 0;
  for (const delivery of waiting) {
    if (!delivery.fromLocationId) continue;
    const fits = await tryReserve(
      db,
      engine,
      delivery.fromLocationId,
      delivery.lines.map((line) => ({ productId: line.productId, quantity: line.quantity.toNumber() })),
    );
    if (fits) {
      await db.stockMove.update({ where: { id: delivery.id }, data: { status: 'READY' } });
      promoted += 1;
    }
  }
  return promoted;
}
