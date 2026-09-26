import { Prisma, type PrismaClient } from '@prisma/client';
import {
  collectFieldErrors,
  stockQuerySchema,
  stockUpdateSchema,
  type Paginated,
  type StockRow,
} from '@stocksense/shared';
import { recheckWaitingDeliveries } from '../deliveries/reservations.js';
import { ApiError } from '../lib/errors.js';
import { applyStockAdjustment } from '../stock-engine/adjustment.js';
import type { ReferenceGenerator, StockEngine } from '../stock-engine/interface.js';

type StockWithRelations = Prisma.StockGetPayload<{ include: { product: true; location: true } }>;

/** 05_API_CONTRACTS.md §3 — Stock read + manual stock edit (owner: Person 1). */
export class StockService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly engine: StockEngine,
    private readonly referenceGenerator: ReferenceGenerator,
  ) {}

  private async productTotals(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const grouped = await this.prisma.stock.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { onHandQty: true },
    });
    return new Map(grouped.map((group) => [group.productId, group._sum.onHandQty?.toNumber() ?? 0]));
  }

  /**
   * BR22 uses the product-level rule (summed across all locations), so the low/out flags
   * in the Stock tab always agree with the Dashboard lowStockCount KPI.
   */
  private toStockRow(row: StockWithRelations, totals: Map<string, number>): StockRow {
    const onHand = row.onHandQty.toNumber();
    const reserved = row.reservedQty.toNumber();
    const total = totals.get(row.productId) ?? onHand;
    const reorderMin = row.product.reorderMin?.toNumber() ?? null;

    return {
      productId: row.productId,
      productName: row.product.name,
      sku: row.product.sku,
      costPerUnit: row.product.costPerUnit?.toNumber() ?? null,
      locationId: row.locationId,
      onHand,
      reserved,
      freeToUse: onHand - reserved,
      reorderMin,
      lowStock: reorderMin != null && total <= reorderMin,
      outOfStock: total <= 0,
    };
  }

  async listStock(query: unknown): Promise<Paginated<StockRow>> {
    const parsed = stockQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw ApiError.validation('Invalid stock query', collectFieldErrors(parsed.error));
    }
    const { search, locationId, warehouseId, page, pageSize } = parsed.data;

    const where: Prisma.StockWhereInput = {
      ...(locationId ? { locationId } : {}),
      ...(warehouseId ? { location: { warehouseId } } : {}),
      ...(search
        ? {
            product: {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.stock.count({ where }),
      this.prisma.stock.findMany({
        where,
        include: { product: true, location: true },
        orderBy: [{ product: { name: 'asc' } }, { location: { name: 'asc' } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const totals = await this.productTotals(rows.map((row) => row.productId));
    return { data: rows.map((row) => this.toStockRow(row, totals)), total, page, pageSize };
  }

  /** R4.7 — inline stock edit; written as a DONE ADJUSTMENT via the stock-engine (BR10/BR15). */
  async setOnHand(
    productId: string,
    locationId: string,
    input: unknown,
    responsibleUserId: string,
  ): Promise<StockRow> {
    const parsed = stockUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid stock details', collectFieldErrors(parsed.error));
    }

    const [product, location] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } }),
      this.prisma.location.findUnique({ where: { id: locationId }, select: { id: true } }),
    ]);
    if (!product) throw ApiError.notFound('Product not found');
    if (!location) throw ApiError.notFound('Location not found');

    await this.prisma.$transaction(async (tx) => {
      await applyStockAdjustment(tx, this.engine, this.referenceGenerator, {
        productId,
        locationId,
        countedQuantity: parsed.data.onHand,
        note: parsed.data.note,
        responsibleUserId,
      });

      // 07 "Re-evaluation": a manual adjustment may free stock for WAITING deliveries.
      await recheckWaitingDeliveries(tx, this.engine, { locationId, productIds: [productId] });
    });

    const row = await this.prisma.stock.findUniqueOrThrow({
      where: { productId_locationId: { productId, locationId } },
      include: { product: true, location: true },
    });
    const totals = await this.productTotals([productId]);
    return this.toStockRow(row, totals);
  }
}
