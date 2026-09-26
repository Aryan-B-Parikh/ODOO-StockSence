import { Prisma, type PrismaClient } from '@prisma/client';
import {
  collectFieldErrors,
  deliveryCreateSchema,
  deliveryUpdateSchema,
  operationsQuerySchema,
  type DeliveryDetail,
  type DeliveryLine,
  type DeliverySummary,
  type Paginated,
  type PrintPayload,
} from '@stocksense/shared';
import { formatDate, parseScheduleDate } from '../lib/dates.js';
import { ApiError } from '../lib/errors.js';
import type { ReferenceGenerator, StockEngine, StockEngineDb } from '../stock-engine/interface.js';
import { aggregateQuantityByProduct, releaseReservation, tryReserve } from './reservations.js';

const deliveryInclude = {
  fromLocation: true,
  contact: true,
  responsibleUser: true,
  lines: { include: { product: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.StockMoveInclude;

type DeliveryWithRelations = Prisma.StockMoveGetPayload<{ include: typeof deliveryInclude }>;

/** 05_API_CONTRACTS.md §7 — Deliveries (owner: Person 3). */
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly engine: StockEngine,
    private readonly referenceGenerator: ReferenceGenerator,
  ) {}

  private toSummary(move: DeliveryWithRelations): DeliverySummary {
    return {
      id: move.id,
      reference: move.reference,
      status: move.status as DeliverySummary['status'],
      scheduleDate: formatDate(move.scheduleDate),
      warehouseId: move.warehouseId,
      fromLocationId: move.fromLocationId ?? '',
      fromLocationName: move.fromLocation?.name ?? '',
      toContactId: move.contactId ?? '',
      toContactName: move.contact?.name ?? '',
      toContactEmail: move.contact?.email ?? null,
      operationType: move.operationType,
      responsibleUserId: move.responsibleUserId,
    };
  }

  /**
   * BR18/R6.11 + PHASE3_DECISIONS §2: availability excludes the document's own
   * reservation so its reserved lines are never falsely flagged as short.
   */
  private async toDetail(move: DeliveryWithRelations, db: StockEngineDb): Promise<DeliveryDetail> {
    const productIds = move.lines.map((line) => line.productId);
    const stockRows =
      productIds.length > 0 && move.fromLocationId
        ? await db.stock.findMany({
            where: { locationId: move.fromLocationId, productId: { in: productIds } },
          })
        : [];
    const stockByProduct = new Map(stockRows.map((row) => [row.productId, row]));
    const holdsReservation = move.status === 'DRAFT' || move.status === 'READY';

    const lines: DeliveryLine[] = move.lines.map((line) => {
      const quantity = line.quantity.toNumber();
      const row = stockByProduct.get(line.productId);
      const onHand = row?.onHandQty.toNumber() ?? 0;
      const reserved = row?.reservedQty.toNumber() ?? 0;
      const ownReservation = holdsReservation ? quantity : 0;
      const available = onHand - reserved + ownReservation;

      return {
        id: line.id,
        productId: line.productId,
        productName: line.product.name,
        sku: line.product.sku,
        uom: line.product.uom,
        quantity,
        outOfStock: quantity > available,
      };
    });

    return {
      ...this.toSummary(move),
      responsibleUserName: move.responsibleUser.displayName ?? move.responsibleUser.loginId,
      validatedAt: move.validatedAt?.toISOString() ?? null,
      createdAt: move.createdAt.toISOString(),
      note: move.note,
      lines,
    };
  }

  private async findDeliveryOrThrow(
    db: StockEngineDb,
    id: string,
  ): Promise<DeliveryWithRelations> {
    const move = await db.stockMove.findFirst({
      where: { id, type: 'DELIVERY' },
      include: deliveryInclude,
    });
    if (!move) throw ApiError.notFound('Delivery not found');
    return move;
  }

  /** Contact must exist and be a CUSTOMER; location/products/users must exist. */
  private async validateReferences(
    db: StockEngineDb,
    data: {
      fromLocationId?: string;
      toContactId?: string;
      responsibleUserId?: string;
      lines?: Array<{ productId: string }>;
    },
  ): Promise<void> {
    if (data.fromLocationId) {
      const location = await db.location.findUnique({ where: { id: data.fromLocationId } });
      if (!location) throw ApiError.validation('Location not found', { fromLocationId: 'Location not found' });
    }

    if (data.toContactId) {
      const contact = await db.contact.findUnique({ where: { id: data.toContactId } });
      if (!contact) throw ApiError.validation('Contact not found', { toContactId: 'Contact not found' });
      if (contact.type !== 'CUSTOMER') {
        throw ApiError.validation('Delivery customer must be a CUSTOMER contact', {
          toContactId: 'Delivery customer must be a CUSTOMER contact',
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

  async list(query: unknown): Promise<Paginated<DeliverySummary>> {
    const parsed = operationsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw ApiError.validation('Invalid delivery query', collectFieldErrors(parsed.error));
    }
    const { search, status, warehouseId, page, pageSize } = parsed.data;

    const where: Prisma.StockMoveWhereInput = {
      type: 'DELIVERY',
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
        include: deliveryInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data: rows.map((row) => this.toSummary(row)), total, page, pageSize };
  }

  async get(id: string): Promise<DeliveryDetail> {
    return this.toDetail(await this.findDeliveryOrThrow(this.prisma, id), this.prisma);
  }

  /** POST /deliveries — auto DRAFT (reserved) or WAITING (short on free-to-use stock, R6.12). */
  async create(input: unknown, responsibleUserId: string): Promise<DeliveryDetail> {
    const parsed = deliveryCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid delivery details', collectFieldErrors(parsed.error));
    }
    const data = parsed.data;

    return this.prisma.$transaction(async (tx) => {
      await this.validateReferences(tx, data);
      const location = await tx.location.findUniqueOrThrow({ where: { id: data.fromLocationId } });
      const reference = await this.referenceGenerator.next(location.warehouseId, 'OUT', tx);

      const fits = await tryReserve(tx, this.engine, data.fromLocationId, data.lines);

      const move = await tx.stockMove.create({
        data: {
          reference,
          type: 'DELIVERY',
          warehouseId: location.warehouseId,
          fromLocationId: data.fromLocationId,
          contactId: data.toContactId,
          operationType: data.operationType,
          scheduleDate: parseScheduleDate(data.scheduleDate),
          responsibleUserId: data.responsibleUserId ?? responsibleUserId,
          status: fits ? 'DRAFT' : 'WAITING',
          lines: { create: data.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })) },
        },
        include: deliveryInclude,
      });

      return this.toDetail(move, tx);
    });
  }

  /** PATCH /deliveries/:id — edit while not DONE/CANCELED; re-evaluates WAITING (05 §7). */
  async update(id: string, input: unknown): Promise<DeliveryDetail> {
    const parsed = deliveryUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid delivery details', collectFieldErrors(parsed.error));
    }
    const data = parsed.data;

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findDeliveryOrThrow(tx, id);
      if (existing.status === 'DONE' || existing.status === 'CANCELED') {
        throw ApiError.conflict('Done or canceled deliveries cannot be edited');
      }

      await this.validateReferences(tx, data);

      // Decision 1: release the old reservation, then re-evaluate the new lines.
      const holdsReservation = existing.status !== 'WAITING';
      const previousLines = existing.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity.toNumber(),
      }));
      if (holdsReservation && existing.fromLocationId) {
        await releaseReservation(tx, this.engine, existing.fromLocationId, previousLines);
      }

      const nextFromLocationId = data.fromLocationId ?? existing.fromLocationId ?? '';
      const nextLines = data.lines ?? previousLines;
      const fits =
        nextFromLocationId !== ''
          ? await tryReserve(tx, this.engine, nextFromLocationId, nextLines)
          : false;

      const status = fits ? (existing.status === 'DRAFT' ? 'DRAFT' : 'READY') : 'WAITING';

      if (data.lines) {
        await tx.stockMoveLine.deleteMany({ where: { stockMoveId: id } });
      }

      const move = await tx.stockMove.update({
        where: { id },
        data: {
          ...(data.fromLocationId !== undefined ? { fromLocationId: data.fromLocationId } : {}),
          ...(data.toContactId !== undefined ? { contactId: data.toContactId } : {}),
          ...(data.operationType !== undefined ? { operationType: data.operationType } : {}),
          ...(data.scheduleDate !== undefined ? { scheduleDate: parseScheduleDate(data.scheduleDate) } : {}),
          ...(data.responsibleUserId !== undefined ? { responsibleUserId: data.responsibleUserId } : {}),
          ...(data.lines ? { lines: { create: nextLines } } : {}),
          status,
        },
        include: deliveryInclude,
      });

      return this.toDetail(move, tx);
    });
  }

  /**
   * POST /deliveries/:id/validate (05 §7 / 07):
   * DRAFT → READY (first confirm, no stock change); READY → DONE (decrease + release);
   * WAITING → CONFLICT (BR17).
   */
  async validate(id: string): Promise<DeliveryDetail> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findDeliveryOrThrow(tx, id);

      if (existing.status === 'DRAFT') {
        const promoted = await tx.stockMove.update({
          where: { id },
          data: { status: 'READY' },
          include: deliveryInclude,
        });
        return this.toDetail(promoted, tx);
      }

      if (existing.status === 'WAITING') {
        throw ApiError.conflict('Delivery is waiting for stock to become available');
      }
      if (existing.status !== 'READY') {
        throw ApiError.conflict('Only Draft or Ready deliveries can be validated');
      }

      const now = new Date();
      const locationId = existing.fromLocationId!;

      // BR13/BR16: one atomic transaction for every line + its reservation release.
      for (const line of existing.lines) {
        await this.engine.decreaseOnHand(
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
      for (const [productId, quantity] of aggregateQuantityByProduct(
        existing.lines.map((line) => ({ productId: line.productId, quantity: line.quantity.toNumber() })),
      )) {
        await this.engine.releaseReservation({ productId, locationId, quantity }, tx);
      }

      const done = await tx.stockMove.update({
        where: { id },
        data: { status: 'DONE', validatedAt: now },
        include: deliveryInclude,
      });
      return this.toDetail(done, tx);
    });
  }

  /** POST /deliveries/:id/cancel — release held reservation, never writes the ledger (BR25/26). */
  async cancel(id: string): Promise<DeliveryDetail> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findDeliveryOrThrow(tx, id);
      if (existing.status === 'DONE' || existing.status === 'CANCELED') {
        throw ApiError.conflict('Only Draft, Waiting or Ready deliveries can be canceled');
      }

      if (existing.status !== 'WAITING' && existing.fromLocationId) {
        await releaseReservation(
          tx,
          this.engine,
          existing.fromLocationId,
          existing.lines.map((line) => ({ productId: line.productId, quantity: line.quantity.toNumber() })),
        );
      }

      const canceled = await tx.stockMove.update({
        where: { id },
        data: { status: 'CANCELED' },
        include: deliveryInclude,
      });
      return this.toDetail(canceled, tx);
    });
  }

  /** GET /deliveries/:id/print — only once DONE (05 §7). */
  async print(id: string): Promise<PrintPayload> {
    const move = await this.findDeliveryOrThrow(this.prisma, id);
    if (move.status !== 'DONE') {
      throw ApiError.conflict('Print is available once the delivery is Done');
    }
    return {
      type: 'DELIVERY',
      reference: move.reference,
      status: move.status as PrintPayload['status'],
      date: formatDate(move.scheduleDate),
      contactName: move.contact?.name ?? null,
      locationName: move.fromLocation?.name ?? '',
      lines: move.lines.map((line) => ({
        productName: line.product.name,
        sku: line.product.sku,
        uom: line.product.uom,
        quantity: line.quantity.toNumber(),
      })),
    };
  }
}
