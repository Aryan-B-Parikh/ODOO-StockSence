import type { Prisma, PrismaClient } from '@prisma/client';
import {
  collectFieldErrors,
  moveHistoryQuerySchema,
  type MoveHistoryRow,
  type Paginated,
  type StockMoveStatus,
  type StockMoveType,
} from '@stocksense/shared';
import { ApiError } from '../lib/errors.js';

type LedgerRow = Prisma.StockLedgerGetPayload<{
  include: {
    product: true;
    stockMove: { include: { contact: true; fromLocation: true; toLocation: true } };
  };
}>;

/**
 * 05_API_CONTRACTS.md §10 — Move History (owner: Person 4), read-only over `stock_ledger`.
 * One row per ledger entry (R9.3); IN rows render green, OUT rows red (R9.4/R9.5).
 */
export class MoveHistoryService {
  constructor(private readonly prisma: PrismaClient) {}

  private labels(row: LedgerRow): { from: string; to: string } {
    const move = row.stockMove;
    switch (move.type) {
      case 'RECEIPT':
        return { from: move.contact?.name ?? 'Vendor', to: move.toLocation?.name ?? '—' };
      case 'DELIVERY':
        return { from: move.fromLocation?.name ?? '—', to: move.contact?.name ?? 'Customer' };
      case 'TRANSFER':
        return { from: move.fromLocation?.name ?? '—', to: move.toLocation?.name ?? '—' };
      default: {
        const location = move.fromLocation?.name ?? move.toLocation?.name ?? '—';
        return row.direction === 'IN'
          ? { from: 'Inventory adjustment', to: location }
          : { from: location, to: 'Inventory adjustment' };
      }
    }
  }

  private toRow(row: LedgerRow): MoveHistoryRow {
    const { from, to } = this.labels(row);
    return {
      id: row.id,
      reference: row.reference,
      date: row.movedAt.toISOString().slice(0, 10),
      movedAt: row.movedAt.toISOString(),
      contactName: row.stockMove.contact?.name ?? null,
      from,
      to,
      productId: row.productId,
      productName: row.product.name,
      sku: row.product.sku,
      quantity: row.quantity.toNumber(),
      direction: row.direction as MoveHistoryRow['direction'],
      status: row.stockMove.status as StockMoveStatus,
      type: row.stockMove.type as StockMoveType,
    };
  }

  async list(query: unknown): Promise<Paginated<MoveHistoryRow>> {
    const parsed = moveHistoryQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw ApiError.validation('Invalid move history query', collectFieldErrors(parsed.error));
    }
    const { search, type, direction, status, productId, warehouseId, locationId, dateFrom, dateTo, page, pageSize } =
      parsed.data;

    const conditions: Prisma.StockLedgerWhereInput[] = [];
    if (type) conditions.push({ stockMove: { type } });
    if (status) conditions.push({ stockMove: { status } });
    if (warehouseId) conditions.push({ stockMove: { warehouseId } });
    if (direction) conditions.push({ direction });
    if (productId) conditions.push({ productId });
    if (locationId) {
      conditions.push({ OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] });
    }
    if (dateFrom || dateTo) {
      conditions.push({
        movedAt: {
          ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
          ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
        },
      });
    }
    if (search) {
      conditions.push({
        OR: [
          { reference: { contains: search, mode: 'insensitive' } },
          { product: { name: { contains: search, mode: 'insensitive' } } },
          { product: { sku: { contains: search, mode: 'insensitive' } } },
          { stockMove: { contact: { name: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }

    const where: Prisma.StockLedgerWhereInput = conditions.length > 0 ? { AND: conditions } : {};

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.stockLedger.count({ where }),
      this.prisma.stockLedger.findMany({
        where,
        include: {
          product: true,
          stockMove: { include: { contact: true, fromLocation: true, toLocation: true } },
        },
        orderBy: [{ movedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data: rows.map((row) => this.toRow(row)), total, page, pageSize };
  }
}
