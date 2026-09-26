/**
 * Phase 4 integrated workflows — Person 4 harness
 * (Transfers §8, Adjustments §9, Move History §10 + full inventory lifecycle).
 *
 * Opt-in; run against a migrated throwaway database:
 *   DATABASE_URL=postgresql://... RUN_DB_TESTS=1 npm run test -w @stocksense/backend
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AdjustmentsService } from '../../src/adjustments/service.js';
import { createApp } from '../../src/app.js';
import { PrismaAuthStore } from '../../src/auth/store.prisma.js';
import type { AppConfig } from '../../src/config.js';
import { TransfersService } from '../../src/transfers/service.js';
import { createReferenceGenerator } from '../../src/stock-engine/reference.js';
import { createStockEngine } from '../../src/stock-engine/stock-engine.js';
import type { StockEngine } from '../../src/stock-engine/interface.js';

const runDbTests = process.env.RUN_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDb = runDbTests ? describe : describe.skip;

describeDb('Phase 4 — Transfers + Adjustments + Move History (real PostgreSQL)', () => {
  const suffix = Math.random().toString(36).slice(2, 8);
  const loginId = `p4${suffix}`.slice(0, 12);
  const password = 'Abcdefg1!';
  const shortCode = `P4${suffix}`.slice(0, 10);

  let prisma: PrismaClient;
  let app: ReturnType<typeof createApp>;
  let token: string;

  let warehouseId: string;
  let warehouse2Id: string;
  let locationA: string;
  let locationB: string;
  let customerId: string;
  let vendorId: string;

  const productIds: string[] = [];
  const categoryIds: string[] = [];
  const extraWarehouseIds: string[] = [];
  const dayOffset = (days: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function createWarehouse(name: string, code: string) {
    const res = await request(app)
      .post('/api/v1/warehouses')
      .set(auth())
      .send({ name, shortCode: code, address: null });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function createLocation(wid: string, name: string, locationCode: string) {
    const res = await request(app)
      .post('/api/v1/locations')
      .set(auth())
      .send({ warehouseId: wid, name, shortCode: locationCode });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function createProduct(label: string, initialStock?: { locationId: string; quantity: number }) {
    const res = await request(app)
      .post('/api/v1/products')
      .set(auth())
      .send({
        name: `P4 Product ${label} ${suffix}`,
        sku: `IT4-${label}-${suffix}`,
        uom: 'pcs',
        ...(initialStock ? { initialStock } : {}),
      });
    expect(res.status).toBe(201);
    productIds.push(res.body.id);
    return res.body.id as string;
  }

  async function createContact(name: string, type: 'VENDOR' | 'CUSTOMER') {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set(auth())
      .send({ name: `${name} ${suffix}`, type });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function stockAt(locationId: string, productId: string) {
    return prisma.stock.findUnique({
      where: { productId_locationId: { productId, locationId } },
    });
  }

  async function createTransfer(body: Record<string, unknown>) {
    const res = await request(app).post('/api/v1/transfers').set(auth()).send(body);
    expect(res.status).toBe(201);
    return res.body;
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    const config: AppConfig = {
      nodeEnv: 'test',
      port: 0,
      databaseUrl: process.env.DATABASE_URL!,
      jwtSecret: 'phase4-integration-secret',
      jwtExpiresIn: '1h',
      corsOrigin: '*',
      bcryptRounds: 4,
    };
    app = createApp({ config, store: new PrismaAuthStore(prisma), prisma });

    const signup = await request(app)
      .post('/api/v1/auth/signup')
      .send({ loginId, email: `${loginId}@example.com`, password, confirmPassword: password })
      .expect(201);
    expect(signup.body.id).toEqual(expect.any(String));
    const login = await request(app).post('/api/v1/auth/login').send({ loginId, password }).expect(200);
    token = login.body.token;

    warehouseId = await createWarehouse(`P4 Warehouse ${suffix}`, shortCode);
    warehouse2Id = await createWarehouse(`P4 Warehouse 2 ${suffix}`, `Q${suffix}`.slice(0, 10));
    locationA = await createLocation(warehouseId, 'Stock', 'STOCK');
    locationB = await createLocation(warehouseId, 'Overflow', 'OVER');
    customerId = await createContact('P4 Customer', 'CUSTOMER');
    vendorId = await createContact('P4 Vendor', 'VENDOR');
  });

  afterAll(async () => {
    if (!prisma) return;
    const warehouseIds = [warehouseId, warehouse2Id, ...extraWarehouseIds].filter(Boolean);
    if (warehouseIds.length > 0) {
      await prisma.stockMove.deleteMany({ where: { warehouseId: { in: warehouseIds } } });
      await prisma.stock.deleteMany({ where: { location: { warehouseId: { in: warehouseIds } } } });
      await prisma.sequenceCounter.deleteMany({ where: { warehouseId: { in: warehouseIds } } });
      await prisma.location.deleteMany({ where: { warehouseId: { in: warehouseIds } } });
    }
    await prisma.stockLedger.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.stock.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    await prisma.contact.deleteMany({ where: { name: { contains: suffix } } });
    await prisma.otpRequest.deleteMany({ where: { user: { loginId } } });
    await prisma.user.deleteMany({ where: { loginId } });
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------- transfers

  it('transfer create validation: locations, product, quantity, duplicates, same-location', async () => {
    const product = await createProduct('VAL', { locationId: locationA, quantity: 10 });
    const base = {
      fromLocationId: locationA,
      toLocationId: locationB,
      scheduleDate: dayOffset(1),
      lines: [{ productId: product, quantity: 2 }],
    };

    const sameLocation = await request(app)
      .post('/api/v1/transfers')
      .set(auth())
      .send({ ...base, toLocationId: locationA });
    expect(sameLocation.status).toBe(400);
    expect(sameLocation.body.error.fields.toLocationId).toContain('must differ');

    const unknownSource = await request(app)
      .post('/api/v1/transfers')
      .set(auth())
      .send({ ...base, fromLocationId: '11111111-1111-4111-8111-111111111111' });
    expect(unknownSource.status).toBe(400);
    expect(unknownSource.body.error.fields.fromLocationId).toBe('Source location not found');

    const unknownProduct = await request(app)
      .post('/api/v1/transfers')
      .set(auth())
      .send({ ...base, lines: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 1 }] });
    expect(unknownProduct.status).toBe(400);
    expect(unknownProduct.body.error.fields.lines).toBe('Unknown product in lines');

    const zeroQuantity = await request(app)
      .post('/api/v1/transfers')
      .set(auth())
      .send({ ...base, lines: [{ productId: product, quantity: 0 }] });
    expect(zeroQuantity.status).toBe(400);

    const duplicate = await request(app)
      .post('/api/v1/transfers')
      .set(auth())
      .send({
        ...base,
        lines: [
          { productId: product, quantity: 1 },
          { productId: product, quantity: 1 },
        ],
      });
    expect(duplicate.status).toBe(400);
  });

  it('transfer lifecycle: Draft → Ready → Done preserves total stock and writes two ledger legs (BR14/BR16)', async () => {
    const product = await createProduct('LIFE', { locationId: locationA, quantity: 20 });

    const transfer = await createTransfer({
      fromLocationId: locationA,
      toLocationId: locationB,
      scheduleDate: dayOffset(2),
      lines: [{ productId: product, quantity: 6 }],
    });
    expect(transfer.status).toBe('DRAFT');
    expect(transfer.reference).toBe(`${shortCode}/INT/0001`);
    // Draft holds no reservation (PHASE4_DECISIONS §1)
    expect((await stockAt(locationA, product))!.reservedQty.toNumber()).toBe(0);

    const confirm = await request(app).post(`/api/v1/transfers/${transfer.id}/confirm`).set(auth()).expect(200);
    expect(confirm.body.status).toBe('READY');
    expect((await stockAt(locationA, product))!.reservedQty.toNumber()).toBe(6);

    const done = await request(app).post(`/api/v1/transfers/${transfer.id}/validate`).set(auth()).expect(200);
    expect(done.body.status).toBe('DONE');
    expect(done.body.validatedAt).not.toBeNull();

    const source = (await stockAt(locationA, product))!;
    const destination = (await stockAt(locationB, product))!;
    expect(source.onHandQty.toNumber()).toBe(14);
    expect(source.reservedQty.toNumber()).toBe(0);
    expect(destination.onHandQty.toNumber()).toBe(6);
    expect(source.onHandQty.toNumber() + destination.onHandQty.toNumber()).toBe(20); // invariant

    const ledger = await prisma.stockLedger.findMany({ where: { stockMoveId: transfer.id } });
    expect(ledger).toHaveLength(2);
    expect(ledger.map((row) => row.direction).sort()).toEqual(['IN', 'OUT']);
    expect(ledger.every((row) => row.reference === transfer.reference)).toBe(true);

    // invalid transitions
    await request(app).post(`/api/v1/transfers/${transfer.id}/confirm`).set(auth()).expect(409);
    await request(app).post(`/api/v1/transfers/${transfer.id}/validate`).set(auth()).expect(409);
    await request(app).post(`/api/v1/transfers/${transfer.id}/cancel`).set(auth()).expect(409);
    await request(app)
      .patch(`/api/v1/transfers/${transfer.id}`)
      .set(auth())
      .send({ scheduleDate: dayOffset(3) })
      .expect(409);
  });

  it('transfer confirm blocks on insufficient free-to-use stock and cancel releases reservations (07 transfer-1)', async () => {
    const product = await createProduct('SHORT', { locationId: locationA, quantity: 5 });

    const transfer = await createTransfer({
      fromLocationId: locationA,
      toLocationId: locationB,
      scheduleDate: dayOffset(1),
      lines: [{ productId: product, quantity: 100 }],
    });
    expect(transfer.status).toBe('DRAFT');

    const blocked = await request(app).post(`/api/v1/transfers/${transfer.id}/confirm`).set(auth());
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toContain('Insufficient free-to-use stock');
    expect((await stockAt(locationA, product))!.reservedQty.toNumber()).toBe(0);

    const stillDraft = await request(app).get(`/api/v1/transfers/${transfer.id}`).set(auth()).expect(200);
    expect(stillDraft.body.status).toBe('DRAFT');

    const reduced = await request(app)
      .patch(`/api/v1/transfers/${transfer.id}`)
      .set(auth())
      .send({ lines: [{ productId: product, quantity: 3 }] })
      .expect(200);
    expect(reduced.body.status).toBe('DRAFT');

    await request(app).post(`/api/v1/transfers/${transfer.id}/confirm`).set(auth()).expect(200);
    expect((await stockAt(locationA, product))!.reservedQty.toNumber()).toBe(3);

    const canceled = await request(app)
      .post(`/api/v1/transfers/${transfer.id}/cancel`)
      .set(auth())
      .expect(200);
    expect(canceled.body.status).toBe('CANCELED');
    expect((await stockAt(locationA, product))!.reservedQty.toNumber()).toBe(0);
    expect(await prisma.stockLedger.count({ where: { stockMoveId: transfer.id } })).toBe(0);
  });

  it('editing a READY transfer re-syncs its reservation and rejects unaffordable edits', async () => {
    const product = await createProduct('EDIT', { locationId: locationA, quantity: 10 });
    const transfer = await createTransfer({
      fromLocationId: locationA,
      toLocationId: locationB,
      scheduleDate: dayOffset(1),
      lines: [{ productId: product, quantity: 4 }],
    });
    await request(app).post(`/api/v1/transfers/${transfer.id}/confirm`).set(auth()).expect(200);
    expect((await stockAt(locationA, product))!.reservedQty.toNumber()).toBe(4);

    const tooBig = await request(app)
      .patch(`/api/v1/transfers/${transfer.id}`)
      .set(auth())
      .send({ lines: [{ productId: product, quantity: 500 }] });
    expect(tooBig.status).toBe(409);
    expect((await stockAt(locationA, product))!.reservedQty.toNumber()).toBe(4); // unchanged

    const smaller = await request(app)
      .patch(`/api/v1/transfers/${transfer.id}`)
      .set(auth())
      .send({ lines: [{ productId: product, quantity: 2 }] })
      .expect(200);
    expect(smaller.body.status).toBe('READY');
    expect((await stockAt(locationA, product))!.reservedQty.toNumber()).toBe(2);

    await request(app).post(`/api/v1/transfers/${transfer.id}/cancel`).set(auth()).expect(200);
  });

  it('transfer validate is atomic: a mid-transaction failure leaves stock, ledger and status untouched', async () => {
    const productA = await createProduct('ATOMA', { locationId: locationA, quantity: 8 });
    const productB = await createProduct('ATOMB', { locationId: locationA, quantity: 8 });

    const transfer = await createTransfer({
      fromLocationId: locationA,
      toLocationId: locationB,
      scheduleDate: dayOffset(1),
      lines: [
        { productId: productA, quantity: 2 },
        { productId: productB, quantity: 2 },
      ],
    });
    await request(app).post(`/api/v1/transfers/${transfer.id}/confirm`).set(auth()).expect(200);

    const realEngine = createStockEngine(prisma);
    let transferCalls = 0;
    const flakyEngine: StockEngine = {
      ...realEngine,
      transfer: async (input, db) => {
        transferCalls += 1;
        if (transferCalls === 2) throw new Error('simulated mid-transaction failure');
        return realEngine.transfer(input, db);
      },
    };
    const transfersService = new TransfersService(prisma, flakyEngine, createReferenceGenerator(prisma));

    await expect(transfersService.validate(transfer.id)).rejects.toThrow('simulated');

    expect((await stockAt(locationA, productA))!.onHandQty.toNumber()).toBe(8);
    expect((await stockAt(locationA, productB))!.onHandQty.toNumber()).toBe(8);
    expect(await stockAt(locationB, productA)).toBeNull();
    expect(await prisma.stockLedger.count({ where: { stockMoveId: transfer.id } })).toBe(0);
    const unchanged = await prisma.stockMove.findUniqueOrThrow({ where: { id: transfer.id } });
    expect(unchanged.status).toBe('READY');
    // reservation survived the rollback
    expect((await stockAt(locationA, productA))!.reservedQty.toNumber()).toBe(2);

    await request(app).post(`/api/v1/transfers/${transfer.id}/cancel`).set(auth()).expect(200);
  });

  // -------------------------------------------------------------- adjustments

  it('adjustments: negative, positive and zero deltas update stock + ledger per BR15', async () => {
    const product = await createProduct('ADJ', { locationId: locationA, quantity: 20 });

    // negative delta
    const lowered = await request(app)
      .post('/api/v1/adjustments')
      .set(auth())
      .send({ productId: product, locationId: locationA, countedQuantity: 17, note: '3 damaged' });
    expect(lowered.status).toBe(201);
    expect(lowered.body).toMatchObject({
      status: 'DONE',
      recordedQuantity: 20,
      countedQuantity: 17,
      delta: -3,
      note: '3 damaged',
    });
    expect(lowered.body.reference).toMatch(/\/ADJ\/\d{4}$/);
    expect((await stockAt(locationA, product))!.onHandQty.toNumber()).toBe(17);

    let ledger = await prisma.stockLedger.findMany({ where: { productId: product }, orderBy: { movedAt: 'asc' } });
    const outRow = ledger.find((row) => row.stockMoveId === lowered.body.id)!;
    expect(outRow).toMatchObject({ direction: 'OUT', fromLocationId: locationA });
    expect(outRow.quantity.toNumber()).toBe(3);

    // positive delta
    const raised = await request(app)
      .post('/api/v1/adjustments')
      .set(auth())
      .send({ productId: product, locationId: locationA, countedQuantity: 20 });
    expect(raised.status).toBe(201);
    expect(raised.body).toMatchObject({ recordedQuantity: 17, countedQuantity: 20, delta: 3 });
    expect((await stockAt(locationA, product))!.onHandQty.toNumber()).toBe(20);
    ledger = await prisma.stockLedger.findMany({ where: { productId: product }, orderBy: { movedAt: 'asc' } });
    const inRow = ledger.find((row) => row.stockMoveId === raised.body.id)!;
    expect(inRow).toMatchObject({ direction: 'IN', toLocationId: locationA });

    // zero delta: DONE document for the audit trail, no line, no ledger row
    const ledgerCountBefore = ledger.length;
    const zero = await request(app)
      .post('/api/v1/adjustments')
      .set(auth())
      .send({ productId: product, locationId: locationA, countedQuantity: 20, note: 'counted exactly' });
    expect(zero.status).toBe(201);
    expect(zero.body).toMatchObject({ delta: 0, recordedQuantity: 20, countedQuantity: 20 });
    expect(zero.body.reference).toMatch(/\/ADJ\/\d{4}$/);
    expect(await prisma.stockMoveLine.count({ where: { stockMoveId: zero.body.id } })).toBe(0);
    expect(await prisma.stockLedger.count({ where: { stockMoveId: zero.body.id } })).toBe(0);
    expect(
      await prisma.stockLedger.count({ where: { productId: product } }),
    ).toBe(ledgerCountBefore);

    // validation
    const negative = await request(app)
      .post('/api/v1/adjustments')
      .set(auth())
      .send({ productId: product, locationId: locationA, countedQuantity: -1 });
    expect(negative.status).toBe(400);
    const unknownProduct = await request(app)
      .post('/api/v1/adjustments')
      .set(auth())
      .send({ productId: '11111111-1111-4111-8111-111111111111', locationId: locationA, countedQuantity: 1 });
    expect(unknownProduct.status).toBe(400);

    // list / get / filters
    const list = await request(app)
      .get(`/api/v1/adjustments?warehouseId=${warehouseId}&productId=${product}`)
      .set(auth())
      .expect(200);
    expect(list.body.total).toBe(3);
    expect(list.body.data.every((row: { productId: string }) => row.productId === product)).toBe(true);

    const search = await request(app)
      .get(`/api/v1/adjustments?search=${encodeURIComponent(lowered.body.reference)}`)
      .set(auth())
      .expect(200);
    expect(search.body.total).toBe(1);
    expect(search.body.data[0].id).toBe(lowered.body.id);

    const single = await request(app).get(`/api/v1/adjustments/${lowered.body.id}`).set(auth()).expect(200);
    expect(single.body.note).toBe('3 damaged');
  });

  it('manual-style adjustment cannot drop stock below an open reservation (PHASE3_DECISIONS §7)', async () => {
    const product = await createProduct('GUARD', { locationId: locationA, quantity: 10 });

    const delivery = await request(app)
      .post('/api/v1/deliveries')
      .set(auth())
      .send({
        fromLocationId: locationA,
        toContactId: customerId,
        scheduleDate: dayOffset(1),
        operationType: 'Delivery order',
        lines: [{ productId: product, quantity: 6 }],
      });
    expect(delivery.status).toBe(201);
    expect(delivery.body.status).toBe('DRAFT'); // reserves 6

    const blocked = await request(app)
      .post('/api/v1/adjustments')
      .set(auth())
      .send({ productId: product, locationId: locationA, countedQuantity: 2 });
    expect(blocked.status).toBe(409);
    expect((await stockAt(locationA, product))!.onHandQty.toNumber()).toBe(10);

    await request(app).post(`/api/v1/deliveries/${delivery.body.id}/cancel`).set(auth()).expect(200);

    const allowed = await request(app)
      .post('/api/v1/adjustments')
      .set(auth())
      .send({ productId: product, locationId: locationA, countedQuantity: 2 });
    expect(allowed.status).toBe(201);
    expect((await stockAt(locationA, product))!.onHandQty.toNumber()).toBe(2);
  });

  // ------------------------------------------------------------- move history

  it('move history exposes every Phase 4 movement with filters, labels and pagination (§10)', async () => {
    const product = await createProduct('HIST', { locationId: locationA, quantity: 40 });

    // receipt IN
    const receipt = await request(app)
      .post('/api/v1/receipts')
      .set(auth())
      .send({
        fromContactId: vendorId,
        toLocationId: locationA,
        scheduleDate: dayOffset(1),
        lines: [{ productId: product, quantity: 10 }],
      })
      .expect(201);
    await request(app).post(`/api/v1/receipts/${receipt.body.id}/confirm`).set(auth()).expect(200);
    await request(app).post(`/api/v1/receipts/${receipt.body.id}/validate`).set(auth()).expect(200);

    // transfer OUT+IN
    const transfer = await createTransfer({
      fromLocationId: locationA,
      toLocationId: locationB,
      scheduleDate: dayOffset(1),
      lines: [{ productId: product, quantity: 8 }],
    });
    await request(app).post(`/api/v1/transfers/${transfer.id}/confirm`).set(auth()).expect(200);
    await request(app).post(`/api/v1/transfers/${transfer.id}/validate`).set(auth()).expect(200);

    // delivery OUT
    const delivery = await request(app)
      .post('/api/v1/deliveries')
      .set(auth())
      .send({
        fromLocationId: locationA,
        toContactId: customerId,
        scheduleDate: dayOffset(1),
        operationType: 'Delivery order',
        lines: [{ productId: product, quantity: 5 }],
      })
      .expect(201);
    await request(app).post(`/api/v1/deliveries/${delivery.body.id}/validate`).set(auth()).expect(200);
    await request(app).post(`/api/v1/deliveries/${delivery.body.id}/validate`).set(auth()).expect(200);

    // adjustment OUT
    const adjustment = await request(app)
      .post('/api/v1/adjustments')
      .set(auth())
      .send({ productId: product, locationId: locationA, countedQuantity: 36 }); // 40+10-8-5 = 37 → -1
    expect(adjustment.status).toBe(201);

    const all = await request(app)
      .get(`/api/v1/move-history?warehouseId=${warehouseId}&productId=${product}&pageSize=50`)
      .set(auth())
      .expect(200);

    // initial stock ADJ 40, receipt 10, transfer 8/8, delivery 5, adjustment 1 = 6 ledger rows
    expect(all.body.total).toBe(6);
    expect(all.body.data).toHaveLength(6);
    const byType = all.body.data.reduce(
      (accumulator: Record<string, number>, row: { type: string }) => ({
        ...accumulator,
        [row.type]: (accumulator[row.type] ?? 0) + 1,
      }),
      {},
    );
    expect(byType).toEqual({ ADJUSTMENT: 2, RECEIPT: 1, TRANSFER: 2, DELIVERY: 1 });

    const receiptRow = all.body.data.find((row: { reference: string }) => row.reference === receipt.body.reference);
    expect(receiptRow).toMatchObject({
      direction: 'IN',
      from: `P4 Vendor ${suffix}`,
      to: 'Stock',
      quantity: 10,
      status: 'DONE',
    });

    const deliveryRow = all.body.data.find(
      (row: { reference: string }) => row.reference === delivery.body.reference,
    );
    expect(deliveryRow).toMatchObject({ direction: 'OUT', from: 'Stock', to: `P4 Customer ${suffix}` });

    const transferOut = all.body.data.find(
      (row: { reference: string; direction: string }) =>
        row.reference === transfer.reference && row.direction === 'OUT',
    );
    expect(transferOut).toMatchObject({ from: 'Stock', to: 'Overflow' });

    const adjustmentRow = all.body.data.find(
      (row: { reference: string }) => row.reference === adjustment.body.reference,
    );
    expect(adjustmentRow).toMatchObject({ from: 'Stock', to: 'Inventory adjustment', quantity: 1 });

    // direction filter
    const outs = await request(app)
      .get(`/api/v1/move-history?warehouseId=${warehouseId}&productId=${product}&direction=OUT&pageSize=50`)
      .set(auth())
      .expect(200);
    expect(outs.body.total).toBe(3);
    expect(outs.body.data.every((row: { direction: string }) => row.direction === 'OUT')).toBe(true);

    // type filter
    const transfersOnly = await request(app)
      .get(`/api/v1/move-history?warehouseId=${warehouseId}&productId=${product}&type=TRANSFER&pageSize=50`)
      .set(auth())
      .expect(200);
    expect(transfersOnly.body.total).toBe(2);

    // location filter (rows touching Overflow)
    const atOverflow = await request(app)
      .get(`/api/v1/move-history?locationId=${locationB}&productId=${product}&pageSize=50`)
      .set(auth())
      .expect(200);
    expect(atOverflow.body.total).toBe(2);

    // reference search
    const byReference = await request(app)
      .get(`/api/v1/move-history?search=${encodeURIComponent(transfer.reference)}`)
      .set(auth())
      .expect(200);
    expect(byReference.body.total).toBe(2);

    // product name search
    const byProduct = await request(app)
      .get(`/api/v1/move-history?search=${encodeURIComponent(`P4 Product HIST ${suffix}`)}&warehouseId=${warehouseId}`)
      .set(auth())
      .expect(200);
    expect(byProduct.body.total).toBe(6);

    // date filters (all rows are today; a past-only range returns nothing)
    const futureOnly = await request(app)
      .get(`/api/v1/move-history?warehouseId=${warehouseId}&productId=${product}&dateFrom=${dayOffset(1)}`)
      .set(auth())
      .expect(200);
    expect(futureOnly.body.total).toBe(0);

    const todayOnly = await request(app)
      .get(
        `/api/v1/move-history?warehouseId=${warehouseId}&productId=${product}&dateFrom=${dayOffset(0)}&dateTo=${dayOffset(0)}&pageSize=50`,
      )
      .set(auth())
      .expect(200);
    expect(todayOnly.body.total).toBe(6);

    // pagination
    const pageOne = await request(app)
      .get(`/api/v1/move-history?warehouseId=${warehouseId}&productId=${product}&page=1&pageSize=2`)
      .set(auth())
      .expect(200);
    const pageTwo = await request(app)
      .get(`/api/v1/move-history?warehouseId=${warehouseId}&productId=${product}&page=2&pageSize=2`)
      .set(auth())
      .expect(200);
    expect(pageOne.body.data).toHaveLength(2);
    expect(pageTwo.body.data).toHaveLength(2);
    expect(pageOne.body.data[0].id).not.toBe(pageTwo.body.data[0].id);
    expect(pageOne.body.total).toBe(6);
  });

  // ------------------------------------------------- full lifecycle acceptance

  it('full inventory lifecycle: receipt → transfer → delivery → adjustment → history (P4 acceptance)', async () => {
    const lifecycleWarehouse = await createWarehouse(`Lifecycle ${suffix}`, `L${suffix}`.slice(0, 10));
    extraWarehouseIds.push(lifecycleWarehouse);
    const lifecycleA = await createLocation(lifecycleWarehouse, 'Stock', 'STOCK');
    const lifecycleB = await createLocation(lifecycleWarehouse, 'Production Floor', 'PROD');
    const product = await createProduct('FLOW', { locationId: lifecycleA, quantity: 100 });

    // Receipt +10
    const receipt = await request(app)
      .post('/api/v1/receipts')
      .set(auth())
      .send({
        fromContactId: vendorId,
        toLocationId: lifecycleA,
        scheduleDate: dayOffset(0),
        lines: [{ productId: product, quantity: 10 }],
      })
      .expect(201);
    await request(app).post(`/api/v1/receipts/${receipt.body.id}/confirm`).set(auth()).expect(200);
    await request(app).post(`/api/v1/receipts/${receipt.body.id}/validate`).set(auth()).expect(200);

    // Transfer 30 to the production floor
    const transfer = await createTransfer({
      fromLocationId: lifecycleA,
      toLocationId: lifecycleB,
      scheduleDate: dayOffset(1),
      lines: [{ productId: product, quantity: 30 }],
    });
    await request(app).post(`/api/v1/transfers/${transfer.id}/confirm`).set(auth()).expect(200);
    await request(app).post(`/api/v1/transfers/${transfer.id}/validate`).set(auth()).expect(200);

    // Delivery 20 from stock
    const delivery = await request(app)
      .post('/api/v1/deliveries')
      .set(auth())
      .send({
        fromLocationId: lifecycleA,
        toContactId: customerId,
        scheduleDate: dayOffset(1),
        operationType: 'Delivery order',
        lines: [{ productId: product, quantity: 20 }],
      })
      .expect(201);
    await request(app).post(`/api/v1/deliveries/${delivery.body.id}/validate`).set(auth()).expect(200);
    await request(app).post(`/api/v1/deliveries/${delivery.body.id}/validate`).set(auth()).expect(200);

    // Adjustment: count finds 2 units damaged at stock (60 recorded → 58)
    expect((await stockAt(lifecycleA, product))!.onHandQty.toNumber()).toBe(60);
    const adjustment = await request(app)
      .post('/api/v1/adjustments')
      .set(auth())
      .send({ productId: product, locationId: lifecycleA, countedQuantity: 58, note: 'damaged' });
    expect(adjustment.status).toBe(201);
    expect(adjustment.body.delta).toBe(-2);

    const stockA = (await stockAt(lifecycleA, product))!;
    const stockB = (await stockAt(lifecycleB, product))!;
    expect(stockA.onHandQty.toNumber()).toBe(58);
    expect(stockB.onHandQty.toNumber()).toBe(30);
    expect(stockA.onHandQty.toNumber() + stockB.onHandQty.toNumber()).toBe(88); // 100 + 10 - 20 - 2

    const history = await request(app)
      .get(`/api/v1/move-history?warehouseId=${lifecycleWarehouse}&pageSize=50`)
      .set(auth())
      .expect(200);
    const references = new Set(history.body.data.map((row: { reference: string }) => row.reference));
    expect(references.has(receipt.body.reference)).toBe(true);
    expect(references.has(transfer.reference)).toBe(true);
    expect(references.has(delivery.body.reference)).toBe(true);
    expect(references.has(adjustment.body.reference)).toBe(true);
    expect(history.body.total).toBe(6); // ADJ 100, IN 10, INT OUT/IN, OUT 20, ADJ -2

    const kpis = await request(app)
      .get(`/api/v1/dashboard/kpis?warehouseId=${lifecycleWarehouse}`)
      .set(auth())
      .expect(200);
    expect(kpis.body.pendingReceipts).toBe(0);
    expect(kpis.body.pendingDeliveries).toBe(0);
    expect(kpis.body.internalTransfersScheduled).toBe(0);
    expect(kpis.body.totalProductsInStock).toBe(1);
  });

  it('requires authentication on every Phase 4 endpoint', async () => {
    for (const path of ['/api/v1/transfers', '/api/v1/adjustments', '/api/v1/move-history']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
  });
});
