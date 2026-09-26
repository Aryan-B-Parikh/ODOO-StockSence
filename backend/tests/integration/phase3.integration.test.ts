/**
 * Phase 3 integrated Receipt + Delivery workflows — Person 4 harness
 * (11_TESTING_STRATEGY.md: request→DB→response cycles + end-to-end scenarios).
 *
 * Opt-in; run against a migrated throwaway database:
 *   DATABASE_URL=postgresql://... RUN_DB_TESTS=1 npm run test -w @stocksense/backend
 *
 * Covers §6/§7 endpoints, BR12/BR13/BR17/BR18/BR25/BR26/BR27, the reservation
 * lifecycle (PHASE3_DECISIONS §1), multi-line atomicity, the WAITING re-check and the
 * dashboard KPI regression.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { PrismaAuthStore } from '../../src/auth/store.prisma.js';
import type { AppConfig } from '../../src/config.js';
import { DeliveriesService } from '../../src/deliveries/service.js';
import { ReceiptsService } from '../../src/receipts/service.js';
import { createReferenceGenerator } from '../../src/stock-engine/reference.js';
import { createStockEngine } from '../../src/stock-engine/stock-engine.js';
import type { StockEngine } from '../../src/stock-engine/interface.js';

const runDbTests = process.env.RUN_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDb = runDbTests ? describe : describe.skip;

describeDb('Phase 3 — Receipts + Deliveries against real PostgreSQL', () => {
  // Random (not timestamp-based) so suites running in parallel never collide on unique codes.
  const suffix = Math.random().toString(36).slice(2, 8);
  const loginId = `p3${suffix}`.slice(0, 12);
  const password = 'Abcdefg1!';
  const shortCode = `W${suffix}`.slice(0, 10);

  let prisma: PrismaClient;
  let app: ReturnType<typeof createApp>;
  let token: string;

  let warehouseId: string;
  let locationA: string; // stock for receipts/deliveries
  let locationB: string; // empty target for a second location scenario
  let vendorId: string;
  let customerId: string;
  let productA: string; // 10 at A
  let productB: string; // 5 at A
  let productC: string; // 0 at A (no stock row until receipts)

  const productIds: string[] = [];

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const today = new Date().toISOString().slice(0, 10);
  const dayOffset = (days: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  async function createProduct(skuSuffix: string, initialStock?: { locationId: string; quantity: number }) {
    const res = await request(app)
      .post('/api/v1/products')
      .set(auth())
      .send({
        name: `P3 Product ${skuSuffix}`,
        sku: `IT3-${skuSuffix}-${suffix}`,
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
      .send({ name: `${name} ${suffix}`, type, email: `${type.toLowerCase()}-${suffix}@example.com` });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function createReceipt(body: Record<string, unknown>) {
    const res = await request(app).post('/api/v1/receipts').set(auth()).send(body);
    expect(res.status).toBe(201);
    return res.body;
  }

  async function createDelivery(body: Record<string, unknown>) {
    const res = await request(app).post('/api/v1/deliveries').set(auth()).send(body);
    expect(res.status).toBe(201);
    return res.body;
  }

  async function stockAt(locationId: string, productId: string) {
    return prisma.stock.findUnique({
      where: { productId_locationId: { productId, locationId } },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();

    const config: AppConfig = {
      nodeEnv: 'test',
      port: 0,
      databaseUrl: process.env.DATABASE_URL!,
      jwtSecret: 'phase3-integration-secret',
      jwtExpiresIn: '1h',
      corsOrigin: '*',
      bcryptRounds: 4,
    };
    app = createApp({ config, store: new PrismaAuthStore(prisma), prisma });

    const signup = await request(app)
      .post('/api/v1/auth/signup')
      .send({ loginId, email: `${loginId}@example.com`, password, confirmPassword: password })
      .expect(201);
    const login = await request(app).post('/api/v1/auth/login').send({ loginId, password }).expect(200);
    token = login.body.token;

    const warehouse = await request(app)
      .post('/api/v1/warehouses')
      .set(auth())
      .send({ name: `Phase3 Warehouse ${suffix}`, shortCode, address: null })
      .expect(201);
    warehouseId = warehouse.body.id;

    const locA = await request(app)
      .post('/api/v1/locations')
      .set(auth())
      .send({ warehouseId, name: 'Stock', shortCode: 'STOCK' })
      .expect(201);
    locationA = locA.body.id;

    const locB = await request(app)
      .post('/api/v1/locations')
      .set(auth())
      .send({ warehouseId, name: 'Overflow', shortCode: 'OVER' })
      .expect(201);
    locationB = locB.body.id;

    vendorId = await createContact('Phase3 Vendor', 'VENDOR');
    customerId = await createContact('Phase3 Customer', 'CUSTOMER');

    productA = await createProduct('A', { locationId: locationA, quantity: 10 });
    productB = await createProduct('B', { locationId: locationA, quantity: 5 });
    productC = await createProduct('C');

    // Sanity: the users row exists (signup response id is not needed elsewhere).
    expect(signup.body.id).toEqual(expect.any(String));
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.stockMove.deleteMany({ where: { warehouseId } });
    await prisma.stock.deleteMany({ where: { location: { warehouseId } } });
    await prisma.sequenceCounter.deleteMany({ where: { warehouseId } });
    await prisma.location.deleteMany({ where: { warehouseId } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.contact.deleteMany({ where: { id: { in: [vendorId, customerId].filter(Boolean) } } });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await prisma.otpRequest.deleteMany({ where: { user: { loginId } } });
    await prisma.user.deleteMany({ where: { loginId } });
    await prisma.$disconnect();
  });

  // ----------------------------------------------------------------- contacts

  it('§4b contacts: create, filter by type, validate input, require auth', async () => {
    const vendors = await request(app).get('/api/v1/contacts?type=VENDOR').set(auth()).expect(200);
    expect(vendors.body.some((contact: { id: string }) => contact.id === vendorId)).toBe(true);
    expect(vendors.body.every((contact: { type: string }) => contact.type === 'VENDOR')).toBe(true);

    const search = await request(app)
      .get(`/api/v1/contacts?search=${encodeURIComponent(`Phase3 Customer ${suffix}`)}`)
      .set(auth())
      .expect(200);
    expect(search.body).toHaveLength(1);

    const badType = await request(app)
      .post('/api/v1/contacts')
      .set(auth())
      .send({ name: 'Nope', type: 'PARTNER' });
    expect(badType.status).toBe(400);

    const badEmail = await request(app)
      .post('/api/v1/contacts')
      .set(auth())
      .send({ name: 'Nope', type: 'VENDOR', email: 'not-an-email' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error.fields.email).toBeDefined();

    await request(app).get('/api/v1/contacts').expect(401);
  });

  // ----------------------------------------------------------------- receipts

  it('receipt create validates references, quantities and duplicates (BR27, contact types)', async () => {
    const base = {
      fromContactId: vendorId,
      toLocationId: locationA,
      scheduleDate: dayOffset(1),
      lines: [{ productId: productA, quantity: 2 }],
    };

    const wrongContactType = await request(app)
      .post('/api/v1/receipts')
      .set(auth())
      .send({ ...base, fromContactId: customerId });
    expect(wrongContactType.status).toBe(400);
    expect(wrongContactType.body.error.fields.fromContactId).toContain('VENDOR');

    const unknownLocation = await request(app)
      .post('/api/v1/receipts')
      .set(auth())
      .send({ ...base, toLocationId: '11111111-1111-4111-8111-111111111111' });
    expect(unknownLocation.status).toBe(400);
    expect(unknownLocation.body.error.fields.toLocationId).toBe('Location not found');

    const unknownProduct = await request(app)
      .post('/api/v1/receipts')
      .set(auth())
      .send({ ...base, lines: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 1 }] });
    expect(unknownProduct.status).toBe(400);
    expect(unknownProduct.body.error.fields.lines).toBe('Unknown product in lines');

    const zeroQuantity = await request(app)
      .post('/api/v1/receipts')
      .set(auth())
      .send({ ...base, lines: [{ productId: productA, quantity: 0 }] });
    expect(zeroQuantity.status).toBe(400);
    expect(zeroQuantity.body.error.fields.lines).toBeDefined();

    const duplicate = await request(app)
      .post('/api/v1/receipts')
      .set(auth())
      .send({
        ...base,
        lines: [
          { productId: productA, quantity: 1 },
          { productId: productA, quantity: 2 },
        ],
      });
    expect(duplicate.status).toBe(400);

    const badDate = await request(app)
      .post('/api/v1/receipts')
      .set(auth())
      .send({ ...base, scheduleDate: 'tomorrow' });
    expect(badDate.status).toBe(400);
  });

  it('receipt lifecycle: Draft → Ready → Done increases stock + ledger atomically (R5.3, BR12, BR16)', async () => {
    const beforeA = (await stockAt(locationA, productA))!;
    const beforeB = (await stockAt(locationA, productB))!;

    const receipt = await createReceipt({
      fromContactId: vendorId,
      toLocationId: locationA,
      scheduleDate: dayOffset(2),
      lines: [
        { productId: productA, quantity: 4 },
        { productId: productB, quantity: 5 },
      ],
    });
    expect(receipt.status).toBe('DRAFT');
    expect(receipt.reference).toBe(`${shortCode}/IN/0001`);
    expect(receipt.lines).toHaveLength(2);

    // no stock effect before validation
    expect((await stockAt(locationA, productA))!.onHandQty.toNumber()).toBe(beforeA.onHandQty.toNumber());
    expect((await stockAt(locationA, productB))!.onHandQty.toNumber()).toBe(beforeB.onHandQty.toNumber());

    const validateDraft = await request(app)
      .post(`/api/v1/receipts/${receipt.id}/validate`)
      .set(auth());
    expect(validateDraft.status).toBe(409);

    const confirmed = await request(app)
      .post(`/api/v1/receipts/${receipt.id}/confirm`)
      .set(auth())
      .expect(200);
    expect(confirmed.body.status).toBe('READY');

    await request(app).post(`/api/v1/receipts/${receipt.id}/confirm`).set(auth()).expect(409);
    await request(app)
      .get(`/api/v1/receipts/${receipt.id}/print`)
      .set(auth())
      .expect(409); // not Done yet

    const validated = await request(app)
      .post(`/api/v1/receipts/${receipt.id}/validate`)
      .set(auth())
      .expect(200);
    expect(validated.body.status).toBe('DONE');
    expect(validated.body.validatedAt).not.toBeNull();

    expect((await stockAt(locationA, productA))!.onHandQty.toNumber()).toBe(
      beforeA.onHandQty.toNumber() + 4,
    );
    expect((await stockAt(locationA, productB))!.onHandQty.toNumber()).toBe(
      beforeB.onHandQty.toNumber() + 5,
    );

    const ledger = await prisma.stockLedger.findMany({ where: { stockMoveId: receipt.id } });
    expect(ledger).toHaveLength(2);
    expect(ledger.every((row) => row.direction === 'IN' && row.reference === receipt.reference)).toBe(true);
    expect(ledger.map((row) => row.quantity.toNumber()).sort()).toEqual([4, 5]);

    // immutable after Done
    await request(app)
      .patch(`/api/v1/receipts/${receipt.id}`)
      .set(auth())
      .send({ scheduleDate: dayOffset(3) })
      .expect(409);
    await request(app).post(`/api/v1/receipts/${receipt.id}/cancel`).set(auth()).expect(409);

    const print = await request(app).get(`/api/v1/receipts/${receipt.id}/print`).set(auth()).expect(200);
    expect(print.body).toMatchObject({ type: 'RECEIPT', reference: receipt.reference, status: 'DONE' });
    expect(print.body.lines).toHaveLength(2);

    const list = await request(app)
      .get(`/api/v1/receipts?search=${encodeURIComponent(receipt.reference)}&warehouseId=${warehouseId}`)
      .set(auth())
      .expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.data[0].reference).toBe(receipt.reference);

    const byStatus = await request(app)
      .get(`/api/v1/receipts?status=DONE&warehouseId=${warehouseId}`)
      .set(auth())
      .expect(200);
    expect(byStatus.body.data.some((row: { id: string }) => row.id === receipt.id)).toBe(true);
  });

  it('receipt cancel from Draft/Ready writes no ledger and no stock change (BR25/BR26)', async () => {
    const before = (await stockAt(locationA, productB))!;
    const receipt = await createReceipt({
      fromContactId: vendorId,
      toLocationId: locationA,
      scheduleDate: dayOffset(1),
      lines: [{ productId: productB, quantity: 7 }],
    });

    const canceled = await request(app)
      .post(`/api/v1/receipts/${receipt.id}/cancel`)
      .set(auth())
      .expect(200);
    expect(canceled.body.status).toBe('CANCELED');
    expect((await stockAt(locationA, productB))!.onHandQty.toNumber()).toBe(before.onHandQty.toNumber());
    expect(await prisma.stockLedger.count({ where: { stockMoveId: receipt.id } })).toBe(0);
  });

  // ----------------------------------------------------------------- deliveries

  it('delivery create reserves stock and computes DRAFT vs WAITING (BR17, reservations §1)', async () => {
    const draft = await createDelivery({
      fromLocationId: locationA,
      toContactId: customerId,
      scheduleDate: dayOffset(1),
      operationType: 'Delivery order',
      lines: [{ productId: productA, quantity: 3 }],
    });
    expect(draft.status).toBe('DRAFT');
    expect(draft.reference).toBe(`${shortCode}/OUT/0001`);
    expect(draft.lines[0].outOfStock).toBe(false);
    expect((await stockAt(locationA, productA))!.reservedQty.toNumber()).toBe(3);

    const waiting = await createDelivery({
      fromLocationId: locationA,
      toContactId: customerId,
      scheduleDate: dayOffset(1),
      operationType: 'Delivery order',
      lines: [{ productId: productB, quantity: 500 }],
    });
    expect(waiting.status).toBe('WAITING');
    expect(waiting.lines[0].outOfStock).toBe(true);
    // no reservation for unsatisfiable docs
    expect((await stockAt(locationA, productB))!.reservedQty.toNumber()).toBe(0);

    const waitValidate = await request(app)
      .post(`/api/v1/deliveries/${waiting.id}/validate`)
      .set(auth());
    expect(waitValidate.status).toBe(409);
    expect(waitValidate.body.error.message).toContain('waiting for stock');

    const wrongContact = await request(app)
      .post('/api/v1/deliveries')
      .set(auth())
      .send({
        fromLocationId: locationA,
        toContactId: vendorId,
        scheduleDate: dayOffset(1),
        operationType: 'Delivery order',
        lines: [{ productId: productA, quantity: 1 }],
      });
    expect(wrongContact.status).toBe(400);
    expect(wrongContact.body.error.fields.toContactId).toContain('CUSTOMER');

    // cleanup this test's reservation so later tests see a clean location state
    await request(app).post(`/api/v1/deliveries/${draft.id}/cancel`).set(auth()).expect(200);
    expect((await stockAt(locationA, productA))!.reservedQty.toNumber()).toBe(0);
  });

  it('delivery pick & pack (Draft → Ready) then validate (Ready → Done) decreases stock (R6.2/R6.3)', async () => {
    const before = (await stockAt(locationA, productB))!;

    const delivery = await createDelivery({
      fromLocationId: locationA,
      toContactId: customerId,
      scheduleDate: dayOffset(1),
      operationType: 'Delivery order',
      lines: [{ productId: productB, quantity: 2 }],
    });
    expect(delivery.status).toBe('DRAFT');

    const ready = await request(app)
      .post(`/api/v1/deliveries/${delivery.id}/validate`)
      .set(auth())
      .expect(200);
    expect(ready.body.status).toBe('READY');
    expect((await stockAt(locationA, productB))!.onHandQty.toNumber()).toBe(before.onHandQty.toNumber());

    const done = await request(app)
      .post(`/api/v1/deliveries/${delivery.id}/validate`)
      .set(auth())
      .expect(200);
    expect(done.body.status).toBe('DONE');

    const row = (await stockAt(locationA, productB))!;
    expect(row.onHandQty.toNumber()).toBe(before.onHandQty.toNumber() - 2);
    expect(row.reservedQty.toNumber()).toBe(0);

    const ledger = await prisma.stockLedger.findMany({ where: { stockMoveId: delivery.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ direction: 'OUT', fromLocationId: locationA });

    await request(app).post(`/api/v1/deliveries/${delivery.id}/validate`).set(auth()).expect(409);
    const print = await request(app)
      .get(`/api/v1/deliveries/${delivery.id}/print`)
      .set(auth())
      .expect(200);
    expect(print.body).toMatchObject({ type: 'DELIVERY', reference: delivery.reference });
  });

  it('delivery PATCH re-evaluates Waiting and re-syncs reservations (05 §7, decision 1)', async () => {
    const waiting = await createDelivery({
      fromLocationId: locationA,
      toContactId: customerId,
      scheduleDate: dayOffset(1),
      operationType: 'Delivery order',
      lines: [{ productId: productA, quantity: 999 }],
    });
    expect(waiting.status).toBe('WAITING');

    const reduced = await request(app)
      .patch(`/api/v1/deliveries/${waiting.id}`)
      .set(auth())
      .send({ lines: [{ productId: productA, quantity: 2 }] })
      .expect(200);
    expect(reduced.body.status).toBe('READY');
    expect((await stockAt(locationA, productA))!.reservedQty.toNumber()).toBe(2);

    const increased = await request(app)
      .patch(`/api/v1/deliveries/${waiting.id}`)
      .set(auth())
      .send({ lines: [{ productId: productA, quantity: 999 }] })
      .expect(200);
    expect(increased.body.status).toBe('WAITING');
    expect((await stockAt(locationA, productA))!.reservedQty.toNumber()).toBe(0);

    const canceled = await request(app)
      .post(`/api/v1/deliveries/${waiting.id}/cancel`)
      .set(auth())
      .expect(200);
    expect(canceled.body.status).toBe('CANCELED');
    await request(app)
      .patch(`/api/v1/deliveries/${waiting.id}`)
      .set(auth())
      .send({ operationType: 'Changed' })
      .expect(409);
  });

  it('receipt validation promotes WAITING deliveries at the same location (07 re-evaluation)', async () => {
    const delivery = await createDelivery({
      fromLocationId: locationA,
      toContactId: customerId,
      scheduleDate: dayOffset(1),
      operationType: 'Delivery order',
      lines: [{ productId: productC, quantity: 10 }],
    });
    expect(delivery.status).toBe('WAITING');

    const receipt = await createReceipt({
      fromContactId: vendorId,
      toLocationId: locationA,
      scheduleDate: dayOffset(1),
      lines: [{ productId: productC, quantity: 10 }],
    });
    await request(app).post(`/api/v1/receipts/${receipt.id}/confirm`).set(auth()).expect(200);
    await request(app).post(`/api/v1/receipts/${receipt.id}/validate`).set(auth()).expect(200);

    const refreshed = await request(app)
      .get(`/api/v1/deliveries/${delivery.id}`)
      .set(auth())
      .expect(200);
    expect(refreshed.body.status).toBe('READY');
    expect((await stockAt(locationA, productC))!.reservedQty.toNumber()).toBe(10);

    // cancel releases the reservation again
    await request(app).post(`/api/v1/deliveries/${delivery.id}/cancel`).set(auth()).expect(200);
    expect((await stockAt(locationA, productC))!.reservedQty.toNumber()).toBe(0);
  });

  it('manual stock adjustment cannot drop on-hand below open reservations (PHASE3_DECISIONS §7)', async () => {
    const delivery = await createDelivery({
      fromLocationId: locationA,
      toContactId: customerId,
      scheduleDate: dayOffset(1),
      operationType: 'Delivery order',
      lines: [{ productId: productB, quantity: 1 }],
    });
    expect(delivery.status).toBe('DRAFT');

    const conflict = await request(app)
      .patch(`/api/v1/stock/${productB}/${locationA}`)
      .set(auth())
      .send({ onHand: 0 });
    expect(conflict.status).toBe(409);

    await request(app).post(`/api/v1/deliveries/${delivery.id}/cancel`).set(auth()).expect(200);
  });

  it('multi-line validation is atomic: a mid-transaction failure leaves no partial effects', async () => {
    const realEngine = createStockEngine(prisma);
    const referenceGenerator = createReferenceGenerator(prisma);

    // --- Receipt atomicity -----------------------------------------------------------------
    let increaseCalls = 0;
    const flakyReceiptEngine: StockEngine = {
      ...realEngine,
      increaseOnHand: async (input, db) => {
        increaseCalls += 1;
        if (increaseCalls === 2) throw new Error('simulated mid-transaction failure');
        return realEngine.increaseOnHand(input, db);
      },
    };
    const receiptsService = new ReceiptsService(prisma, flakyReceiptEngine, referenceGenerator);

    const receipt = await createReceipt({
      fromContactId: vendorId,
      toLocationId: locationA,
      scheduleDate: dayOffset(1),
      lines: [
        { productId: productA, quantity: 1 },
        { productId: productB, quantity: 1 },
      ],
    });
    await request(app).post(`/api/v1/receipts/${receipt.id}/confirm`).set(auth()).expect(200);

    const stockABefore = (await stockAt(locationA, productA))!.onHandQty.toNumber();
    const stockBBefore = (await stockAt(locationA, productB))!.onHandQty.toNumber();

    await expect(receiptsService.validate(receipt.id)).rejects.toThrow('simulated');

    expect((await stockAt(locationA, productA))!.onHandQty.toNumber()).toBe(stockABefore);
    expect((await stockAt(locationA, productB))!.onHandQty.toNumber()).toBe(stockBBefore);
    expect(await prisma.stockLedger.count({ where: { stockMoveId: receipt.id } })).toBe(0);
    const stillReady = await prisma.stockMove.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(stillReady.status).toBe('READY');

    // --- Delivery atomicity -----------------------------------------------------------------
    let decreaseCalls = 0;
    const flakyDeliveryEngine: StockEngine = {
      ...realEngine,
      decreaseOnHand: async (input, db) => {
        decreaseCalls += 1;
        if (decreaseCalls === 2) throw new Error('simulated mid-transaction failure');
        return realEngine.decreaseOnHand(input, db);
      },
    };
    const deliveriesService = new DeliveriesService(prisma, flakyDeliveryEngine, referenceGenerator);

    const delivery = await createDelivery({
      fromLocationId: locationA,
      toContactId: customerId,
      scheduleDate: dayOffset(1),
      operationType: 'Delivery order',
      lines: [
        { productId: productA, quantity: 1 },
        { productId: productB, quantity: 1 },
      ],
    });
    await request(app).post(`/api/v1/deliveries/${delivery.id}/validate`).set(auth()).expect(200); // → READY

    const stockABeforeDelivery = (await stockAt(locationA, productA))!.onHandQty.toNumber();
    const stockBBeforeDelivery = (await stockAt(locationA, productB))!.onHandQty.toNumber();

    await expect(deliveriesService.validate(delivery.id)).rejects.toThrow('simulated');

    expect((await stockAt(locationA, productA))!.onHandQty.toNumber()).toBe(stockABeforeDelivery);
    expect((await stockAt(locationA, productB))!.onHandQty.toNumber()).toBe(stockBBeforeDelivery);
    expect(await prisma.stockLedger.count({ where: { stockMoveId: delivery.id } })).toBe(0);
    const stillReadyDelivery = await prisma.stockMove.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(stillReadyDelivery.status).toBe('READY');

    // clean up the reservation left by the READY delivery
    await request(app).post(`/api/v1/deliveries/${delivery.id}/cancel`).set(auth()).expect(200);
  });

  it('dashboard KPIs reflect receipt/delivery status changes (P4 regression)', async () => {
    const receipt = await createReceipt({
      fromContactId: vendorId,
      toLocationId: locationB,
      scheduleDate: dayOffset(2),
      lines: [{ productId: productA, quantity: 1 }],
    });

    const withPending = await request(app)
      .get(`/api/v1/dashboard/kpis?warehouseId=${warehouseId}&type=RECEIPT`)
      .set(auth())
      .expect(200);
    expect(withPending.body.pendingReceipts).toBeGreaterThanOrEqual(1);

    await request(app).post(`/api/v1/receipts/${receipt.id}/confirm`).set(auth()).expect(200);
    await request(app)
      .post(`/api/v1/receipts/${receipt.id}/validate`)
      .set(auth())
      .expect(200);

    const afterDone = await request(app)
      .get(`/api/v1/dashboard/kpis?warehouseId=${warehouseId}&status=READY&type=RECEIPT`)
      .set(auth())
      .expect(200);
    const doneIds = await prisma.stockMove.findMany({
      where: { warehouseId, type: 'RECEIPT', status: 'READY' },
      select: { id: true },
    });
    expect(afterDone.body.pendingReceipts).toBe(doneIds.length);

    const canceledReceipt = await createReceipt({
      fromContactId: vendorId,
      toLocationId: locationB,
      scheduleDate: dayOffset(-3),
      lines: [{ productId: productA, quantity: 1 }],
    });
    await request(app).post(`/api/v1/receipts/${canceledReceipt.id}/cancel`).set(auth()).expect(200);

    const late = await request(app)
      .get(`/api/v1/dashboard/kpis?warehouseId=${warehouseId}&type=RECEIPT`)
      .set(auth())
      .expect(200);
    const openLate = await prisma.stockMove.count({
      where: {
        warehouseId,
        type: 'RECEIPT',
        status: { notIn: ['DONE', 'CANCELED'] },
        scheduleDate: { lt: new Date(`${today}T00:00:00.000Z`) },
      },
    });
    expect(late.body.receiptSummary.late).toBe(openLate);
  });

  it('requires authentication on every Phase 3 endpoint', async () => {
    for (const path of ['/api/v1/contacts', '/api/v1/receipts', '/api/v1/deliveries']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
  });
});
