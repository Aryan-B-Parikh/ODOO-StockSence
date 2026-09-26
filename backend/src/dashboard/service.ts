import type { Prisma, PrismaClient } from '@prisma/client';
import {
  collectFieldErrors,
  dashboardQuerySchema,
  summarizeDashboard,
  type DashboardKpis,
  type StockMoveStatus,
  type StockMoveType,
} from '@stocksense/shared';
import { ApiError } from '../lib/errors.js';

/** 05_API_CONTRACTS.md §5 — Dashboard KPI aggregation (owner: Person 4). */
export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getKpis(query: unknown): Promise<DashboardKpis> {
    const parsed = dashboardQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw ApiError.validation('Invalid dashboard filters', collectFieldErrors(parsed.error));
    }
    const { warehouseId, locationId, categoryId, type, status } = parsed.data;

    const moveWhere: Prisma.StockMoveWhereInput = {
      ...(warehouseId ? { warehouseId } : {}),
      ...(locationId ? { OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] } : {}),
      ...(categoryId ? { lines: { some: { product: { categoryId } } } } : {}),
    };

    const stockWhere: Prisma.StockWhereInput = {
      ...(locationId ? { locationId } : {}),
      ...(warehouseId ? { location: { warehouseId } } : {}),
      ...(categoryId ? { product: { categoryId } } : {}),
    };

    const [moves, stockRows] = await Promise.all([
      this.prisma.stockMove.findMany({
        where: moveWhere,
        select: { type: true, status: true, scheduleDate: true },
      }),
      this.prisma.stock.findMany({
        where: stockWhere,
        select: { productId: true, onHandQty: true, product: { select: { reorderMin: true } } },
      }),
    ]);

    return summarizeDashboard({
      moves: moves.map((move) => ({
        type: move.type as StockMoveType,
        status: move.status as StockMoveStatus,
        scheduleDate: move.scheduleDate.toISOString().slice(0, 10),
      })),
      stock: stockRows.map((row) => ({
        productId: row.productId,
        onHand: row.onHandQty.toNumber(),
        reorderMin: row.product.reorderMin?.toNumber() ?? null,
      })),
      today: new Date().toISOString().slice(0, 10),
      type,
      status,
    });
  }
}
