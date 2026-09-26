import { Prisma, type PrismaClient } from '@prisma/client';
import {
  collectFieldErrors,
  operationsQuerySchema,
  transferCreateSchema,
  transferUpdateSchema,
  type Paginated,
  type TransferDetail,
  type TransferSummary,
} from '@stocksense/shared';
import { releaseReservation, tryReserve } from '../deliveries/reservations.js';
import { formatDate, parseScheduleDate } from '../lib/dates.js';
import { ApiError } from '../lib/errors.js';
import type { ReferenceGenerator, StockEngine, StockEngineDb } from '../stock-engine/interface.js';

const transferInclude = {
  fromLocation: true,
  toLocation: true,
  responsibleUser: true,
  lines: { include: { product: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.StockMoveInclude;

type TransferWithRelations = Prisma.StockMoveGetPayload<{ include: typeof transferInclude }>;

/**
 * 05_API_CONTRACTS.md §8 — Internal Transfers (owner: Person 3).
 * Status flow DRAFT → READY → DONE (07); no WAITING state. Reservations are taken at
 * confirm and released on validate/cancel (PHASE4_DECISIONS §1).
 */
export class TransfersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly engine: StockEngine,
    private readonly referenceGenerator: ReferenceGenerator,
  ) {}

  private toSummary(move: TransferWithRelations): TransferSummary {
    return {
      id: move.id,
      reference: move.reference,
      status: move.status as TransferSummary['status'],
      scheduleDate: formatDate(move.scheduleDate),
      warehouseId: move.warehouseId,
      fromLocationId: move.fromLocationId ?? '',
      fromLocationName: move.fromLocation?.name ?? '',
      toLocationId: move.toLocationId ?? '',
      toLocationName: move.toLocation?.name ?? '',
      responsibleUserId: move.responsibleUserId,
    };
  }

  private toDetail(move: TransferWithRelations): TransferDetail {
    return {
      ...this.toSummary(move),
      responsibleUserName: move.responsibleUser.displayName ?? move.responsibleUser.loginId,
      validatedAt: move.validatedAt?.toISOString() ?? null,
      createdAt: move.createdAt.toISOString(),
      note: move.note,
      lines: move.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        productName: line.product.name,
        sku: line.product.sku,
        uom: line.product.uom,
        quantity: line.quantity.toNumber(),
      })),
    };
  }

  private async findTransferOrThrow(db: StockEngineDb, id: string): Promise<TransferWithRelations> {
    const move = await db.stockMove.findFirst({
      where: { id, type: 'TRANSFER' },
      include: transferInclude,
    });
    if (!move) throw ApiError.notFound('Transfer not found');
    return move;
  }

  private async validateReferences(
    db: StockEngineDb,
    data: {
      fromLocationId?: string;
      toLocationId?: string;
      responsibleUserId?: string;
      lines?: Array<{ productId: string }>;
    },
  ): Promise<void> {
    if (data.fromLocationId) {
      const location = await db.location.findUnique({ where: { id: data.fromLocationId } });
      if (!location) {
        throw ApiError.validation('Source location not found', { fromLocationId: 'Source location not found' });
      }
    }
    if (data.toLocationId) {
      const location = await db.location.findUnique({ where: { id: data.toLocationId } });
      if (!location) {
        throw ApiError.validation('Destination location not found', {
          toLocationId: 'Destination location not found',
        });
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

  async list(query: unknown): Promise<Paginated<TransferSummary>> {
    const parsed = operationsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw ApiError.validation('Invalid transfer query', collectFieldErrors(parsed.error));
    }
    const { search, status, warehouseId, page, pageSize } = parsed.data;

    const where: Prisma.StockMoveWhereInput = {
      type: 'TRANSFER',
      ...(status ? { status } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: 'insensitive' } },
              { fromLocation: { name: { contains: search, mode: 'insensitive' } } },
              { toLocation: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.stockMove.count({ where }),
      this.prisma.stockMove.findMany({
        where,
        include: transferInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data: rows.map((row) => this.toSummary(row)), total, page, pageSize };
  }

  async get(id: string): Promise<TransferDetail> {
    return this.toDetail(await this.findTransferOrThrow(this.prisma, id));
  }

  /** DRAFT is a plan: created without a reservation (PHASE4_DECISIONS §1). */
  async create(input: unknown, responsibleUserId: string): Promise<TransferDetail> {
    const parsed = transferCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid transfer details', collectFieldErrors(parsed.error));
    }
    const data = parsed.data;

    return this.prisma.$transaction(async (tx) => {
      await this.validateReferences(tx, data);
      const fromLocation = await tx.location.findUniqueOrThrow({ where: { id: data.fromLocationId } });
      const reference = await this.referenceGenerator.next(fromLocation.warehouseId, 'INT', tx);

      const move = await tx.stockMove.create({
        data: {
          reference,
          type: 'TRANSFER',
          warehouseId: fromLocation.warehouseId,
          fromLocationId: data.fromLocationId,
          toLocationId: data.toLocationId,
          scheduleDate: parseScheduleDate(data.scheduleDate),
          responsibleUserId: data.responsibleUserId ?? responsibleUserId,
          status: 'DRAFT',
          lines: { create: data.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })) },
        },
        include: transferInclude,
      });

      return this.toDetail(move);
    });
  }

  /**
   * PATCH /transfers/:id — editable while DRAFT/READY.
   * READY always holds a full reservation: the old one is released and the new lines are
   * reserved in the same transaction; if they do not fit, the update is rejected (409).
   */
  async update(id: string, input: unknown): Promise<TransferDetail> {
    const parsed = transferUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid transfer details', collectFieldErrors(parsed.error));
    }
    const data = parsed.data;

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findTransferOrThrow(tx, id);
      if (existing.status !== 'DRAFT' && existing.status !== 'READY') {
        throw ApiError.conflict('Only Draft or Ready transfers can be edited');
      }

      await this.validateReferences(tx, data);

      const nextFrom = data.fromLocationId ?? existing.fromLocationId ?? '';
      const nextTo = data.toLocationId ?? existing.toLocationId ?? '';
      if (nextFrom === nextTo) {
        throw ApiError.validation('Source and destination locations must differ', {
          toLocationId: 'Source and destination locations must differ',
        });
      }

      const previousLines = existing.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity.toNumber(),
      }));
      const nextLines = data.lines ?? previousLines;

      if (existing.status === 'READY') {
        await releaseReservation(tx, this.engine, existing.fromLocationId ?? '', previousLines);
        const fits = await tryReserve(tx, this.engine, nextFrom, nextLines);
        if (!fits) {
          throw ApiError.conflict('Insufficient free-to-use stock for the updated transfer lines');
        }
      }

      if (data.lines) {
        await tx.stockMoveLine.deleteMany({ where: { stockMoveId: id } });
      }

      const move = await tx.stockMove.update({
        where: { id },
        data: {
          ...(data.fromLocationId !== undefined ? { fromLocationId: data.fromLocationId } : {}),
          ...(data.toLocationId !== undefined ? { toLocationId: data.toLocationId } : {}),
          ...(data.scheduleDate !== undefined ? { scheduleDate: parseScheduleDate(data.scheduleDate) } : {}),
          ...(data.responsibleUserId !== undefined ? { responsibleUserId: data.responsibleUserId } : {}),
          ...(data.lines ? { lines: { create: nextLines } } : {}),
        },
        include: transferInclude,
      });

      return this.toDetail(move);
    });
  }

  /** POST /transfers/:id/confirm — Draft → Ready; reserves the lines or fails with CONFLICT. */
  async confirm(id: string): Promise<TransferDetail> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findTransferOrThrow(tx, id);
      if (existing.status !== 'DRAFT') {
        throw ApiError.conflict('Only Draft transfers can be confirmed');
      }

      const fits = await tryReserve(
        tx,
        this.engine,
        existing.fromLocationId ?? '',
        existing.lines.map((line) => ({ productId: line.productId, quantity: line.quantity.toNumber() })),
      );
      if (!fits) {
        throw ApiError.conflict('Insufficient free-to-use stock to confirm this transfer');
      }

      const move = await tx.stockMove.update({
        where: { id },
        data: { status: 'READY' },
        include: transferInclude,
      });
      return this.toDetail(move);
    });
  }

  /**
   * POST /transfers/:id/validate — Ready → Done (R7.2/BR14): releases the reservation, then
   * moves every line with the engine's atomic two-leg transfer (one OUT + one IN ledger row
   * per line). Total system stock is unchanged.
   */
  async validate(id: string): Promise<TransferDetail> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findTransferOrThrow(tx, id);
      if (existing.status !== 'READY') {
        throw ApiError.conflict('Only Ready transfers can be validated');
      }

      const fromLocationId = existing.fromLocationId ?? '';
      const toLocationId = existing.toLocationId ?? '';
      const now = new Date();

      const lines = existing.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity.toNumber(),
      }));

      // Release our own reservation first so the engine's free-to-use guard does not count
      // this document's lines against itself.
      await releaseReservation(tx, this.engine, fromLocationId, lines);

      for (const line of lines) {
        await this.engine.transfer(
          {
            productId: line.productId,
            fromLocationId,
            toLocationId,
            quantity: line.quantity,
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
        include: transferInclude,
      });
      return this.toDetail(move);
    });
  }

  /** POST /transfers/:id/cancel — DRAFT/READY only; releases the reservation; no ledger (BR25/26). */
  async cancel(id: string): Promise<TransferDetail> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findTransferOrThrow(tx, id);
      if (existing.status !== 'DRAFT' && existing.status !== 'READY') {
        throw ApiError.conflict('Only Draft or Ready transfers can be canceled');
      }

      if (existing.status === 'READY' && existing.fromLocationId) {
        await releaseReservation(
          tx,
          this.engine,
          existing.fromLocationId,
          existing.lines.map((line) => ({ productId: line.productId, quantity: line.quantity.toNumber() })),
        );
      }

      const move = await tx.stockMove.update({
        where: { id },
        data: { status: 'CANCELED' },
        include: transferInclude,
      });
      return this.toDetail(move);
    });
  }
}
