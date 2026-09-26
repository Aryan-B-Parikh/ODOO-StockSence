import { Prisma, type PrismaClient, type Stock } from '@prisma/client';
import { ApiError } from '../lib/errors.js';
import type {
  AdjustmentResult,
  DecreaseStockInput,
  IncreaseStockInput,
  SetStockCountInput,
  StockEngine,
  StockEngineDb,
  StockLineInput,
  StockSnapshot,
  TransferStockInput,
} from './interface.js';

const ZERO = new Prisma.Decimal(0);

function toSnapshot(stock: Stock): StockSnapshot {
  const onHand = stock.onHandQty.toNumber();
  const reserved = stock.reservedQty.toNumber();
  return {
    productId: stock.productId,
    locationId: stock.locationId,
    onHand,
    reserved,
    freeToUse: onHand - reserved,
  };
}

function emptySnapshot(productId: string, locationId: string): StockSnapshot {
  return { productId, locationId, onHand: 0, reserved: 0, freeToUse: 0 };
}

function requirePositive(quantity: number, label = 'Quantity'): Prisma.Decimal {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw ApiError.validation(`${label} must be greater than 0`, { quantity: `${label} must be greater than 0` });
  }
  return new Prisma.Decimal(quantity);
}

/**
 * The single writer of `stock` and `stock_ledger` (BR10). All methods are atomic:
 * stock arithmetic uses conditional SQL/atomic increments so concurrent validations
 * cannot push `on_hand_qty` below zero or double-apply a change.
 */
export function createStockEngine(prisma: PrismaClient): StockEngine {
  async function readStock(
    productId: string,
    locationId: string,
    db: StockEngineDb,
  ): Promise<StockSnapshot | null> {
    const stock = await db.stock.findUnique({
      where: { productId_locationId: { productId, locationId } },
    });
    return stock ? toSnapshot(stock) : null;
  }

  return {
    getStock(productId, locationId, db = prisma) {
      return readStock(productId, locationId, db);
    },

    /** BR12 */
    async increaseOnHand(input: IncreaseStockInput, db: StockEngineDb = prisma) {
      const quantity = requirePositive(input.quantity);

      const row = await db.stock.upsert({
        where: { productId_locationId: { productId: input.productId, locationId: input.locationId } },
        create: { productId: input.productId, locationId: input.locationId, onHandQty: quantity },
        update: { onHandQty: { increment: quantity } },
      });

      await db.stockLedger.create({
        data: {
          stockMoveId: input.move.stockMoveId,
          reference: input.move.reference,
          productId: input.productId,
          fromLocationId: null,
          toLocationId: input.locationId,
          contactId: input.move.contactId ?? null,
          quantity,
          direction: 'IN',
          movedAt: input.move.movedAt,
        },
      });

      return toSnapshot(row);
    },

    /** BR13 */
    async decreaseOnHand(input: DecreaseStockInput, db: StockEngineDb = prisma) {
      const quantity = requirePositive(input.quantity);

      const result = await db.stock.updateMany({
        where: {
          productId: input.productId,
          locationId: input.locationId,
          onHandQty: { gte: quantity },
        },
        data: { onHandQty: { decrement: quantity } },
      });

      if (result.count === 0) {
        const existing = await readStock(input.productId, input.locationId, db);
        if (!existing) {
          throw ApiError.conflict('No stock record for this product at the source location');
        }
        throw ApiError.conflict(
          `Insufficient stock: ${existing.onHand} available, ${input.quantity} requested`,
        );
      }

      const row = await db.stock.findUniqueOrThrow({
        where: { productId_locationId: { productId: input.productId, locationId: input.locationId } },
      });

      await db.stockLedger.create({
        data: {
          stockMoveId: input.move.stockMoveId,
          reference: input.move.reference,
          productId: input.productId,
          fromLocationId: input.locationId,
          toLocationId: null,
          contactId: input.move.contactId ?? null,
          quantity,
          direction: 'OUT',
          movedAt: input.move.movedAt,
        },
      });

      return toSnapshot(row);
    },

    /** BR14 + BR16 — two legs, two ledger rows, one atomic source decrement. */
    async transfer(input: TransferStockInput, db: StockEngineDb = prisma) {
      const quantity = requirePositive(input.quantity);

      if (input.fromLocationId === input.toLocationId) {
        throw ApiError.validation('Source and destination locations must differ', {
          toLocationId: 'Source and destination locations must differ',
        });
      }

      const affected = await db.$executeRaw`
        UPDATE stock
        SET on_hand_qty = on_hand_qty - ${quantity}, updated_at = now()
        WHERE product_id = ${input.productId}::uuid
          AND location_id = ${input.fromLocationId}::uuid
          AND on_hand_qty - reserved_qty >= ${quantity}
      `;

      if (affected === 0) {
        const existing = await readStock(input.productId, input.fromLocationId, db);
        if (!existing) {
          throw ApiError.conflict('No stock record for this product at the source location');
        }
        throw ApiError.conflict(
          `Insufficient free-to-use stock: ${existing.freeToUse} available, ${input.quantity} requested`,
        );
      }

      const toRow = await db.stock.upsert({
        where: {
          productId_locationId: { productId: input.productId, locationId: input.toLocationId },
        },
        create: { productId: input.productId, locationId: input.toLocationId, onHandQty: quantity },
        update: { onHandQty: { increment: quantity } },
      });

      const fromRow = await db.stock.findUniqueOrThrow({
        where: {
          productId_locationId: { productId: input.productId, locationId: input.fromLocationId },
        },
      });

      const ledgerBase = {
        stockMoveId: input.move.stockMoveId,
        reference: input.move.reference,
        productId: input.productId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        contactId: input.move.contactId ?? null,
        quantity,
        movedAt: input.move.movedAt,
      };

      await db.stockLedger.createMany({
        data: [
          { ...ledgerBase, direction: 'OUT' },
          { ...ledgerBase, direction: 'IN' },
        ],
      });

      return { from: toSnapshot(fromRow), to: toSnapshot(toRow) };
    },

    /** BR15 */
    async setOnHandFromCount(input: SetStockCountInput, db: StockEngineDb = prisma) {
      if (!Number.isFinite(input.countedQuantity) || input.countedQuantity < 0) {
        throw ApiError.validation('Counted quantity must be 0 or more', {
          countedQuantity: 'Counted quantity must be 0 or more',
        });
      }
      const counted = new Prisma.Decimal(input.countedQuantity);

      const beforeRow = await db.stock.findUnique({
        where: { productId_locationId: { productId: input.productId, locationId: input.locationId } },
      });

      // Phase 3 guard (PHASE3_DECISIONS §7): never strand open delivery reservations.
      if (beforeRow && counted.lessThan(beforeRow.reservedQty)) {
        throw ApiError.conflict(
          `Cannot set on-hand below the reserved quantity (${beforeRow.reservedQty.toNumber()}) for open deliveries`,
        );
      }

      const before = beforeRow ? toSnapshot(beforeRow) : emptySnapshot(input.productId, input.locationId);
      const delta = counted.minus(beforeRow?.onHandQty ?? ZERO);

      const afterRow = await db.stock.upsert({
        where: { productId_locationId: { productId: input.productId, locationId: input.locationId } },
        create: { productId: input.productId, locationId: input.locationId, onHandQty: counted },
        update: { onHandQty: counted },
      });

      if (!delta.isZero()) {
        if (!input.move) {
          throw new Error('setOnHandFromCount requires a move context when delta is non-zero (BR16)');
        }
        const isIncrease = delta.greaterThan(0);
        await db.stockLedger.create({
          data: {
            stockMoveId: input.move.stockMoveId,
            reference: input.move.reference,
            productId: input.productId,
            fromLocationId: isIncrease ? null : input.locationId,
            toLocationId: isIncrease ? input.locationId : null,
            contactId: input.move.contactId ?? null,
            quantity: delta.abs(),
            direction: isIncrease ? 'IN' : 'OUT',
            movedAt: input.move.movedAt,
          },
        });
      }

      return {
        before,
        after: toSnapshot(afterRow),
        delta: delta.toNumber(),
      } satisfies AdjustmentResult;
    },

    /** BR11/BR17 primitive — reservations never move stock, so no ledger rows. */
    async reserve(input: StockLineInput & { locationId: string }, db: StockEngineDb = prisma) {
      const quantity = requirePositive(input.quantity);

      const affected = await db.$executeRaw`
        UPDATE stock
        SET reserved_qty = reserved_qty + ${quantity}, updated_at = now()
        WHERE product_id = ${input.productId}::uuid
          AND location_id = ${input.locationId}::uuid
          AND reserved_qty + ${quantity} <= on_hand_qty
      `;

      if (affected === 0) {
        throw ApiError.conflict('Cannot reserve more than the free-to-use quantity');
      }

      const row = await db.stock.findUniqueOrThrow({
        where: { productId_locationId: { productId: input.productId, locationId: input.locationId } },
      });
      return toSnapshot(row);
    },

    async releaseReservation(input: StockLineInput & { locationId: string }, db: StockEngineDb = prisma) {
      const quantity = requirePositive(input.quantity);

      const affected = await db.$executeRaw`
        UPDATE stock
        SET reserved_qty = reserved_qty - ${quantity}, updated_at = now()
        WHERE product_id = ${input.productId}::uuid
          AND location_id = ${input.locationId}::uuid
          AND reserved_qty >= ${quantity}
      `;

      if (affected === 0) {
        throw ApiError.conflict('Cannot release more than the currently reserved quantity');
      }

      const row = await db.stock.findUniqueOrThrow({
        where: { productId_locationId: { productId: input.productId, locationId: input.locationId } },
      });
      return toSnapshot(row);
    },
  };
}
