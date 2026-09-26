import { Prisma, type PrismaClient } from '@prisma/client';
import {
  adjustmentCreateSchema,
  adjustmentQuerySchema,
  collectFieldErrors,
  type AdjustmentSummary,
  type Paginated,
} from '@stocksense/shared';
import { recheckWaitingDeliveries } from '../deliveries/reservations.js';
import { formatDate } from '../lib/dates.js';
import { ApiError } from '../lib/errors.js';
import { applyStockAdjustment } from '../stock-engine/adjustment.js';
import type { ReferenceGenerator, StockEngine } from '../stock-engine/interface.js';

const adjustmentInclude = {
  fromLocation: true,
  toLocation: true,
  lines: { include: { product: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.StockMoveInclude;

type AdjustmentWithRelations = Prisma.StockMoveGetPayload<{ include: typeof adjustmentInclude }>;

/**
 * 05_API_CONTRACTS.md §9 — Stock Adjustments (owner: Person 3).
 * Single-step `adjust-1`: create → DONE, applied immediately through the stock-engine
 * (BR15). Explicit adjustments always create a DONE document, including zero deltas
 * (no line/no ledger row) — PHASE4_DECISIONS §2.
 */
export class AdjustmentsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly engine: StockEngine,
    private readonly referenceGenerator: ReferenceGenerator,
  ) {}

  private toSummary(move: AdjustmentWithRelations): AdjustmentSummary {
    const line = move.lines[0];
    const location = move.fromLocation ?? move.toLocation;
    const recordedQuantity = move.recordedQuantity?.toNumber() ?? 0;
    const countedQuantity = move.countedQuantity?.toNumber() ?? 0;

    return {
      id: move.id,
      reference: move.reference,
      status: 'DONE',
      scheduleDate: formatDate(move.scheduleDate),
      movedAt: (move.validatedAt ?? move.updatedAt).toISOString(),
      productId: line?.productId ?? '',
      productName: line?.product.name ?? '',
      sku: line?.product.sku ?? null,
      locationId: location?.id ?? '',
      locationName: location?.name ?? '',
      recordedQuantity,
      countedQuantity,
      delta: Math.round((countedQuantity - recordedQuantity) * 1000) / 1000,
      note: move.note,
    };
  }

  async list(query: unknown): Promise<Paginated<AdjustmentSummary>> {
    const parsed = adjustmentQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw ApiError.validation('Invalid adjustment query', collectFieldErrors(parsed.error));
    }
    const { search, status, warehouseId, productId, locationId, page, pageSize } = parsed.data;

    const where: Prisma.StockMoveWhereInput = {
      type: 'ADJUSTMENT',
      ...(status ? { status } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(productId ? { lines: { some: { productId } } } : {}),
      ...(locationId ? { OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] } : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: 'insensitive' } },
              { lines: { some: { product: { name: { contains: search, mode: 'insensitive' } } } } },
              { lines: { some: { product: { sku: { contains: search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.stockMove.count({ where }),
      this.prisma.stockMove.findMany({
        where,
        include: adjustmentInclude,
        orderBy: { validatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data: rows.map((row) => this.toSummary(row)), total, page, pageSize };
  }

  async get(id: string): Promise<AdjustmentSummary> {
    const move = await this.prisma.stockMove.findFirst({
      where: { id, type: 'ADJUSTMENT' },
      include: adjustmentInclude,
    });
    if (!move) throw ApiError.notFound('Adjustment not found');
    return this.toSummary(move);
  }

  /** POST /adjustments — applies immediately (R8.3) and triggers the delivery recheck. */
  async create(input: unknown, responsibleUserId: string): Promise<AdjustmentSummary> {
    const parsed = adjustmentCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid adjustment details', collectFieldErrors(parsed.error));
    }
    const { productId, locationId, countedQuantity, note } = parsed.data;

    return this.prisma.$transaction(async (tx) => {
      const outcome = await applyStockAdjustment(
        tx,
        this.engine,
        this.referenceGenerator,
        { productId, locationId, countedQuantity, note, responsibleUserId },
        { createOnZeroDelta: true },
      );

      const move = await tx.stockMove.findUniqueOrThrow({
        where: { id: outcome.moveId! },
        include: adjustmentInclude,
      });

      await recheckWaitingDeliveries(tx, this.engine, { locationId, productIds: [productId] });

      return this.toSummary(move);
    });
  }
}
