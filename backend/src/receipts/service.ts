import { Prisma, type PrismaClient } from '@prisma/client';
import {
  collectFieldErrors,
  operationsQuerySchema,
  receiptCreateSchema,
  receiptUpdateSchema,
  type DocumentLine,
  type Paginated,
  type PrintPayload,
  type ReceiptDetail,
  type ReceiptSummary,
} from '@stocksense/shared';
import { recheckWaitingDeliveries } from '../deliveries/reservations.js';
import { formatDate, parseScheduleDate } from '../lib/dates.js';
import { ApiError } from '../lib/errors.js';
import type { ReferenceGenerator, StockEngine, StockEngineDb } from '../stock-engine/interface.js';

const receiptInclude = {
  contact: true,
  toLocation: true,
  responsibleUser: true,
  lines: { include: { product: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.StockMoveInclude;

type ReceiptWithRelations = Prisma.StockMoveGetPayload<{ include: typeof receiptInclude }>;

/** 05_API_CONTRACTS.md §6 — Receipts (owner: Person 3). */
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly engine: StockEngine,
    private readonly referenceGenerator: ReferenceGenerator,
  ) {}

  private toSummary(move: ReceiptWithRelations): ReceiptSummary {
    return {
      id: move.id,
      reference: move.reference,
      status: move.status as ReceiptSummary['status'],
      scheduleDate: formatDate(move.scheduleDate),
      warehouseId: move.warehouseId,
      fromContactId: move.contactId ?? '',
      fromContactName: move.contact?.name ?? '',
      fromContactEmail: move.contact?.email ?? null,
      toLocationId: move.toLocationId ?? '',
      toLocationName: move.toLocation?.name ?? '',
      responsibleUserId: move.responsibleUserId,
    };
  }

  private toDetail(move: ReceiptWithRelations): ReceiptDetail {
    const lines: DocumentLine[] = move.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      productName: line.product.name,
      sku: line.product.sku,
      uom: line.product.uom,
      quantity: line.quantity.toNumber(),
    }));

    return {
      ...this.toSummary(move),
      responsibleUserName: move.responsibleUser.displayName ?? move.responsibleUser.loginId,
      validatedAt: move.validatedAt?.toISOString() ?? null,
      createdAt: move.createdAt.toISOString(),
      note: move.note,
      lines,
    };
  }

  private async findReceiptOrThrow(db: StockEngineDb, id: string): Promise<ReceiptWithRelations> {
    const move = await db.stockMove.findFirst({
      where: { id, type: 'RECEIPT' },
      include: receiptInclude,
    });
    if (!move) throw ApiError.notFound('Receipt not found');
    return move;
  }

  /** Supplier must exist and be a VENDOR; location/products/users must exist. */
  private async validateReferences(
    db: StockEngineDb,
    data: {
      fromContactId?: string;
      toLocationId?: string;
      responsibleUserId?: string;
      lines?: Array<{ productId: string }>;
    },
  ): Promise<void> {
    if (data.fromContactId) {
      const contact = await db.contact.findUnique({ where: { id: data.fromContactId } });
      if (!contact) {
        throw ApiError.validation('Contact not found', { fromContactId: 'Contact not found' });
      }
      if (contact.type !== 'VENDOR') {
        throw ApiError.validation('Receipt supplier must be a VENDOR contact', {
          fromContactId: 'Receipt supplier must be a VENDOR contact',
        });
      }
    }

    if (data.toLocationId) {
      const location = await db.location.findUnique({ where: { id: data.toLocationId } });
      if (!location) {
        throw ApiError.validation('Location not found', { toLocationId: 'Location not found' });
      }
    }

    if (data.responsibleUserId) {
      const user = await db.user.findUnique({ where: { id: data.responsibleUserId } });
      if (!user) {
        throw ApiError.validation('Responsible user not found', {
          responsibleUserId: 'Responsible user not found',
        });
      }
    }

    if (data.lines && data.lines.length > 0) {
      const ids = data.lines.map((line) => line.productId);
      const found = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true } });
      if (found.length !== ids.length) {
        throw ApiError.validation('Unknown product in lines', { lines: 'Unknown product in lines' });
      }
    }
  }

  async list(query: unknown): Promise<Paginated<ReceiptSummary>> {
    const parsed = operationsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw ApiError.validation('Invalid receipt query', collectFieldErrors(parsed.error));
    }
    const { search, status, warehouseId, page, pageSize } = parsed.data;

    const where: Prisma.StockMoveWhereInput = {
      type: 'RECEIPT',
      ...(status ? { status } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: 'insensitive' } },
              { contact: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.stockMove.count({ where }),
      this.prisma.stockMove.findMany({
        where,
        include: receiptInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data: rows.map((row) => this.toSummary(row)), total, page, pageSize };
  }

  async get(id: string): Promise<ReceiptDetail> {
    return this.toDetail(await this.findReceiptOrThrow(this.prisma, id));
  }

  async create(input: unknown, responsibleUserId: string): Promise<ReceiptDetail> {
    const parsed = receiptCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid receipt details', collectFieldErrors(parsed.error));
    }
    const data = parsed.data;

    return this.prisma.$transaction(async (tx) => {
      await this.validateReferences(tx, data);
      const location = await tx.location.findUniqueOrThrow({ where: { id: data.toLocationId } });
      const reference = await this.referenceGenerator.next(location.warehouseId, 'IN', tx);

      const move = await tx.stockMove.create({
        data: {
          reference,
          type: 'RECEIPT',
          warehouseId: location.warehouseId,
          toLocationId: data.toLocationId,
          contactId: data.fromContactId,
          scheduleDate: parseScheduleDate(data.scheduleDate),
          responsibleUserId: data.responsibleUserId ?? responsibleUserId,
          status: 'DRAFT',
          lines: { create: data.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })) },
        },
        include: receiptInclude,
      });

      return this.toDetail(move);
    });
  }

  /** PATCH /receipts/:id — editable while DRAFT or READY (05 §6). */
  async update(id: string, input: unknown): Promise<ReceiptDetail> {
    const parsed = receiptUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid receipt details', collectFieldErrors(parsed.error));
    }
    const data = parsed.data;

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findReceiptOrThrow(tx, id);
      if (existing.status !== 'DRAFT' && existing.status !== 'READY') {
        throw ApiError.conflict('Only Draft or Ready receipts can be edited');
      }

      await this.validateReferences(tx, data);

      if (data.lines) {
        await tx.stockMoveLine.deleteMany({ where: { stockMoveId: id } });
      }

      const move = await tx.stockMove.update({
        where: { id },
        data: {
          ...(data.fromContactId !== undefined ? { contactId: data.fromContactId } : {}),
          ...(data.toLocationId !== undefined ? { toLocationId: data.toLocationId } : {}),
          ...(data.scheduleDate !== undefined ? { scheduleDate: parseScheduleDate(data.scheduleDate) } : {}),
          ...(data.responsibleUserId !== undefined ? { responsibleUserId: data.responsibleUserId } : {}),
          ...(data.lines ? { lines: { create: data.lines } } : {}),
        },
        include: receiptInclude,
      });

      return this.toDetail(move);
    });
  }

  /** POST /receipts/:id/confirm — DRAFT → READY (R5.11). */
  async confirm(id: string): Promise<ReceiptDetail> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findReceiptOrThrow(tx, id);
      if (existing.status !== 'DRAFT') {
        throw ApiError.conflict('Only Draft receipts can be confirmed');
      }
      const move = await tx.stockMove.update({
        where: { id },
        data: { status: 'READY' },
        include: receiptInclude,
      });
      return this.toDetail(move);
    });
  }

  /**
   * POST /receipts/:id/validate — READY → DONE (R5.3/BR12): every line increases stock at
   * toLocationId and writes an IN ledger row in ONE transaction, then open WAITING
   * deliveries at that location are re-evaluated (07 "Re-evaluation").
   */
  async validate(id: string): Promise<ReceiptDetail> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findReceiptOrThrow(tx, id);
      if (existing.status !== 'READY') {
        throw ApiError.conflict('Only Ready receipts can be validated');
      }

      const locationId = existing.toLocationId!;
      const now = new Date();

      for (const line of existing.lines) {
        await this.engine.increaseOnHand(
          {
            productId: line.productId,
            locationId,
            quantity: line.quantity.toNumber(),
            move: {
              stockMoveId: existing.id,
              reference: existing.reference,
              contactId: existing.contactId,
              movedAt: now,
            },
          },
          tx,
        );
      }

      const move = await tx.stockMove.update({
        where: { id },
        data: { status: 'DONE', validatedAt: now },
        include: receiptInclude,
      });

      await recheckWaitingDeliveries(tx, this.engine, {
        locationId,
        productIds: existing.lines.map((line) => line.productId),
      });

      return this.toDetail(move);
    });
  }

  /** POST /receipts/:id/cancel — DRAFT/READY only, never writes the ledger (BR25/26). */
  async cancel(id: string): Promise<ReceiptDetail> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findReceiptOrThrow(tx, id);
      if (existing.status !== 'DRAFT' && existing.status !== 'READY') {
        throw ApiError.conflict('Only Draft or Ready receipts can be canceled');
      }
      const move = await tx.stockMove.update({
        where: { id },
        data: { status: 'CANCELED' },
        include: receiptInclude,
      });
      return this.toDetail(move);
    });
  }

  /** GET /receipts/:id/print — only once DONE (R5.12). */
  async print(id: string): Promise<PrintPayload> {
    const move = await this.findReceiptOrThrow(this.prisma, id);
    if (move.status !== 'DONE') {
      throw ApiError.conflict('Print is available once the receipt is Done');
    }
    return {
      type: 'RECEIPT',
      reference: move.reference,
      status: move.status as PrintPayload['status'],
      date: formatDate(move.scheduleDate),
      contactName: move.contact?.name ?? null,
      locationName: move.toLocation?.name ?? '',
      lines: move.lines.map((line) => ({
        productName: line.product.name,
        sku: line.product.sku,
        uom: line.product.uom,
        quantity: line.quantity.toNumber(),
      })),
    };
  }
}
