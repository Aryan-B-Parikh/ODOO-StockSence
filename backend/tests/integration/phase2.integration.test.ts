/**
 * Phase 2 integrated inventory flow — Person 4 harness
 * (11_TESTING_STRATEGY.md: full request→DB→response cycles + end-to-end scenario).
 *
 * Opt-in; run against a migrated throwaway database:
 *   DATABASE_URL=postgresql://... RUN_DB_TESTS=1 npm run test -w @stocksense/backend
 *
 * Verifies the Product → Warehouse → Location → Stock → Dashboard chain as one system,
 * including the stock-engine invariants from BR11–BR16 and the BR28/BR29 domain rules.
 * All rows created here are removed in afterAll.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { PrismaAuthStore } from '../../src/auth/store.prisma.js';
import type { AppConfig } from '../../src/config.js';
import { createReferenceGenerator } from '../../src/stock-engine/reference.js';
import { createStockEngine } from '../../src/stock-engine/stock-engine.js';
import type { StockEngine, StockMoveContext } from '../../src/stock-engine/interface.js';

const runDbTests = process.env.RUN_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDb = runDbTests ? describe : describe.skip;

describeDb('Phase 2 — Products + Stock + Warehouse + Locations + Dashboard (real PostgreSQL)', () => {
  const suffix = Date.now().toString(36).slice(-6);
  const loginId = `p2${suffix}`.slice(0, 12);
  const password = 'Abcdefg1!';

  let prisma: PrismaClient;
  let app: ReturnType<typeof createApp>;
  let engine: StockEngine;
  let referenceGenerator: ReturnType<typeof createReferenceGenerator>;
  let token: string;

  const tracked = {
    userIds: [] as string[],
    warehouseIds: [] as string[],
    categoryIds: [] as string[],
    productIds: [] as string[],
  };

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function createWarehouse(name: string, shortCode: string) {
    const res = await request(app).post('/api/v1/warehouses').set(auth()).send({ name, shortCode });
    expect(res.status).toBe(201);
    tracked.warehouseIds.push(res.body.id);
    return res.body as { id: string; name: string; shortCode: string; address: string | null };
  }

  async function createLocation(warehouseId: string, name: string, shortCode: string) {
    const res = await request(app)
      .post('/api/v1/locations')
      .set(auth())
      .send({ warehouseId, name, shortCode });
    expect(res.status).toBe(201);
    return res.body as { id: string; warehouseId: string; name: string; shortCode: string };
  }

  async function createCategory(name: string) {
    const res = await request(app).post('/api/v1/categories').set(auth()).send({ name });
    expect(res.status).toBe(201);
    tracked.categoryIds.push(res.body.id);
    return res.body as { id: string; name: string };
  }

  async function createProduct(body: Record<string, unknown>) {
    const res = await request(app).post('/api/v1/products').set(auth()).send(body);
    expect(res.status).toBe(201);
    tracked.productIds.push(res.body.id);
    return res.body;
  }

  async function createMoveRow(input: {
    warehouseId: string;
    type: 'RECEIPT' | 'DELIVERY' | 'TRANSFER' | 'ADJUSTMENT';
    operationType: 'IN' | 'OUT' | 'INT' | 'ADJ';
    status: string;
    scheduleDate: Date;
    fromLocationId?: string | null;
    toLocationId?: string | null;
    lines?: Array<{ productId: string; quantity: number }>;
  }) {
    return prisma.$transaction(async (tx) => {
      const reference = await referenceGenerator.next(input.warehouseId, input.operationType, tx);
      return tx.stockMove.create({
        data: {
          reference,
          type: input.type,
          warehouseId: input.warehouseId,
          fromLocationId: input.fromLocationId ?? null,
          toLocationId: input.toLocationId ?? null,
          scheduleDate: input.scheduleDate,
          responsibleUserId: tracked.userIds[0],
          status: input.status,
          validatedAt: input.status === 'DONE' ? new Date() : null,
          lines: input.lines ? { create: input.lines } : undefined,
        },
      });
    });
  }

  function moveContext(move: { id: string; reference: string }): StockMoveContext {
    return { stockMoveId: move.id, reference: move.reference, movedAt: new Date() };
  }

  const daysFromNow = (days: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date;
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    engine = createStockEngine(prisma);
    referenceGenerator = createReferenceGenerator(prisma);

    const config: AppConfig = {
      nodeEnv: 'test',
      port: 0,
      databaseUrl: process.env.DATABASE_URL!,
      jwtSecret: 'phase2-integration-secret',
      jwtExpiresIn: '1h',
      corsOrigin: '*',
      bcryptRounds: 4,
    };
    app = createApp({ config, store: new PrismaAuthStore(prisma), prisma });

    const signup = await request(app)
      .post('/api/v1/auth/signup')
      .send({ loginId, email: `${loginId}@example.com`, password, confirmPassword: password })
      .expect(201);
    tracked.userIds.push(signup.body.id);

    const login = await request(app).post('/api/v1/auth/login').send({ loginId, password }).expect(200);
    token = login.body.token;
  });

  afterAll(async () => {
    if (!prisma) return;
    const { warehouseIds, productIds } = tracked;
    if (warehouseIds.length > 0) {
      await prisma.stockMove.deleteMany({ where: { warehouseId: { in: warehouseIds } } });
      await prisma.stock.deleteMany({ where: { location: { warehouseId: { in: warehouseIds } } } });
      await prisma.sequenceCounter.deleteMany({ where: { warehouseId: { in: warehouseIds } } });
      await prisma.location.deleteMany({ where: { warehouseId: { in: warehouseIds } } });
    }
    if (productIds.length > 0) {
      await prisma.stockLedger.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.stock.deleteMany({ where: { productId: { in: productIds } } });
    }
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: { in: tracked.categoryIds } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    await prisma.otpRequest.deleteMany({ where: { userId: { in: tracked.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: tracked.userIds } } });
    await prisma.$disconnect();
  });

  // ------------------------------------------------------------------ warehouses

  it('creates, lists and updates warehouses with unique short codes', async () => {
    const warehouse = await createWarehouse('Integration Warehouse', `W${suffix}`);

    const list = await request(app).get('/api/v1/warehouses').set(auth()).expect(200);
    expect(list.body.map((w: { id: string }) => w.id)).toContain(warehouse.id);

    const duplicate = await request(app)
      .post('/api/v1/warehouses')
      .set(auth())
      .send({ name: 'Copy', shortCode: `W${suffix}` });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.fields.shortCode).toBe('Short Code already in use');

    const tooLong = await request(app)
      .post('/api/v1/warehouses')
      .set(auth())
      .send({ name: 'Bad', shortCode: 'ABCDEFGHIJK' });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.fields.shortCode).toBeDefined();

    const renamed = await request(app)
      .patch(`/api/v1/warehouses/${warehouse.id}`)
      .set(auth())
      .send({ name: 'Integration Warehouse (renamed)' })
      .expect(200);
    expect(renamed.body.name).toBe('Integration Warehouse (renamed)');
  });

  // ------------------------------------------------------------------- locations

  it('creates locations inside a warehouse and enforces BR29 (immutable warehouse)', async () => {
    const warehouse = await createWarehouse('Location Warehouse', `L${suffix}`);
    const location = await createLocation(warehouse.id, 'Rack A', 'RACKA');

    const scoped = await request(app)
      .get(`/api/v1/locations?warehouseId=${warehouse.id}`)
      .set(auth())
      .expect(200);
    expect(scoped.body).toHaveLength(1);
    expect(scoped.body[0]).toMatchObject({ id: location.id, warehouseId: warehouse.id });

    const duplicate = await request(app)
      .post('/api/v1/locations')
      .set(auth())
      .send({ warehouseId: warehouse.id, name: 'Copy', shortCode: 'RACKA' });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.fields.shortCode).toBeDefined();

    const unknownWarehouse = await request(app)
      .post('/api/v1/locations')
      .set(auth())
      .send({ warehouseId: '11111111-1111-4111-8111-111111111111', name: 'Ghost', shortCode: 'GHOST' });
    expect(unknownWarehouse.status).toBe(400);
    expect(unknownWarehouse.body.error.fields.warehouseId).toBe('Warehouse not found');

    const illegalMove = await request(app)
      .patch(`/api/v1/locations/${location.id}`)
      .set(auth())
      .send({ warehouseId: '11111111-1111-4111-8111-111111111111' });
    expect(illegalMove.status).toBe(400);
    expect(illegalMove.body.error.fields.warehouseId).toContain('BR29');

    const renamed = await request(app)
      .patch(`/api/v1/locations/${location.id}`)
      .set(auth())
      .send({ name: 'Rack A1' })
      .expect(200);
    expect(renamed.body.name).toBe('Rack A1');
  });

  // ------------------------------------------------------------------ categories

  it('creates categories and rejects duplicates', async () => {
    const category = await createCategory(`Integration Cat ${suffix}`);

    const list = await request(app).get('/api/v1/categories').set(auth()).expect(200);
    expect(list.body.map((c: { id: string }) => c.id)).toContain(category.id);

    const duplicate = await request(app)
      .post('/api/v1/categories')
      .set(auth())
      .send({ name: `Integration Cat ${suffix}` });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.fields.name).toBe('Category already exists');
  });

  // ------------------------------------------------- products + initial stock flow

  it('creates a product with initial stock: stock row, scan-able reference and IN ledger row', async () => {
    const warehouse = await createWarehouse('Product Warehouse', `P${suffix}`);
    const location = await createLocation(warehouse.id, 'Stock', 'STOCK');
    const category = await createCategory(`Product Cat ${suffix}`);

    const product = await createProduct({
      name: 'Integration Steel Rod',
      sku: `IT-ROD-${suffix}`,
      categoryId: category.id,
      uom: 'kg',
      costPerUnit: 12.5,
      reorderMin: 5,
      reorderMax: 50,
      initialStock: { locationId: location.id, quantity: 12.5 },
    });

    expect(product).toMatchObject({
      name: 'Integration Steel Rod',
      sku: `IT-ROD-${suffix}`,
      categoryId: category.id,
      categoryName: `Product Cat ${suffix}`,
      uom: 'kg',
      costPerUnit: 12.5,
      reorderMin: 5,
      reorderMax: 50,
    });

    const stock = await request(app)
      .get(`/api/v1/stock?locationId=${location.id}&search=IT-ROD`)
      .set(auth())
      .expect(200);
    expect(stock.body.total).toBe(1);
    expect(stock.body.data[0]).toMatchObject({
      productId: product.id,
      locationId: location.id,
      onHand: 12.5,
      reserved: 0,
      freeToUse: 12.5,
      reorderMin: 5,
      lowStock: false,
      outOfStock: false,
    });

    const ledger = await prisma.stockLedger.findMany({ where: { productId: product.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ direction: 'IN', toLocationId: location.id });
    expect(ledger[0].reference).toBe(`P${suffix}/ADJ/0001`);
    expect(ledger[0].quantity.toString()).toBe('12.5');

    const move = await prisma.stockMove.findUniqueOrThrow({ where: { id: ledger[0].stockMoveId } });
    expect(move).toMatchObject({ type: 'ADJUSTMENT', status: 'DONE' });
    expect(move.validatedAt).not.toBeNull();
  });

  it('enforces product validation rules (BR27, BR28, reorder range, unknown references)', async () => {
    const warehouse = await createWarehouse('Validation Warehouse', `V${suffix}`);
    const location = await createLocation(warehouse.id, 'Stock', 'STOCK');

    const base = {
      name: 'Validation Product',
      sku: `IT-VAL-${suffix}`,
      uom: 'pcs',
      initialStock: { locationId: location.id, quantity: 1 },
    };

    await createProduct(base);

    const duplicateSku = await request(app)
      .post('/api/v1/products')
      .set(auth())
      .send({ ...base, name: 'Duplicate' });
    expect(duplicateSku.status).toBe(400);
    expect(duplicateSku.body.error.fields.sku).toBe('SKU already in use');

    const zeroStock = await request(app)
      .post('/api/v1/products')
      .set(auth())
      .send({ ...base, sku: `IT-ZERO-${suffix}`, initialStock: { locationId: location.id, quantity: 0 } });
    expect(zeroStock.status).toBe(400);
    expect(zeroStock.body.error.fields).toBeDefined();

    const unknownCategory = await request(app)
      .post('/api/v1/products')
      .set(auth())
      .send({ ...base, sku: `IT-CAT-${suffix}`, categoryId: '11111111-1111-4111-8111-111111111111' });
    expect(unknownCategory.status).toBe(400);
    expect(unknownCategory.body.error.fields.categoryId).toBe('Category not found');

    const unknownLocation = await request(app)
      .post('/api/v1/products')
      .set(auth())
      .send({
        ...base,
        sku: `IT-LOC-${suffix}`,
        initialStock: { locationId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
      });
    expect(unknownLocation.status).toBe(400);
    expect(unknownLocation.body.error.fields.locationId).toBe('Location not found');

    const badRange = await request(app)
      .post('/api/v1/products')
      .set(auth())
      .send({ ...base, sku: `IT-RNG-${suffix}`, reorderMin: 10, reorderMax: 5 });
    expect(badRange.status).toBe(400);
    expect(badRange.body.error.fields.reorderMax).toContain('greater than or equal');
  });

  it('searches, filters and paginates products, and updates them', async () => {
    const warehouse = await createWarehouse('Catalog Warehouse', `C${suffix}`);
    const location = await createLocation(warehouse.id, 'Stock', 'STOCK');
    const categoryA = await createCategory(`Catalog A ${suffix}`);
    const categoryB = await createCategory(`Catalog B ${suffix}`);

    const productA = await createProduct({
      name: 'Catalog Widget',
      sku: `IT-CW-${suffix}`,
      categoryId: categoryA.id,
      uom: 'pcs',
      initialStock: { locationId: location.id, quantity: 3 },
    });
    await createProduct({
      name: 'Catalog Gadget',
      sku: `IT-CG-${suffix}`,
      categoryId: categoryB.id,
      uom: 'pcs',
    });

    const search = await request(app).get(`/api/v1/products?search=IT-CW-${suffix}`).set(auth()).expect(200);
    expect(search.body.total).toBe(1);
    expect(search.body.data[0].id).toBe(productA.id);

    const byCategory = await request(app)
      .get(`/api/v1/products?categoryId=${categoryA.id}&search=Catalog`)
      .set(auth())
      .expect(200);
    expect(byCategory.body.total).toBe(1);

    const paged = await request(app)
      .get(`/api/v1/products?search=IT-C&page=1&pageSize=1`)
      .set(auth())
      .expect(200);
    expect(paged.body.page).toBe(1);
    expect(paged.body.pageSize).toBe(1);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.total).toBeGreaterThanOrEqual(2);

    const updated = await request(app)
      .patch(`/api/v1/products/${productA.id}`)
      .set(auth())
      .send({ name: 'Catalog Widget v2', uom: 'box', categoryId: categoryB.id, reorderMin: 2, reorderMax: 20 })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: 'Catalog Widget v2',
      uom: 'box',
      categoryId: categoryB.id,
      categoryName: `Catalog B ${suffix}`,
    });

    await request(app)
      .patch('/api/v1/products/11111111-1111-4111-8111-111111111111')
      .set(auth())
      .send({ name: 'Ghost' })
      .expect(404);

    const duplicateSku = await request(app)
      .patch(`/api/v1/products/${productA.id}`)
      .set(auth())
      .send({ sku: `IT-CG-${suffix}` });
    expect(duplicateSku.status).toBe(400);
    expect(duplicateSku.body.error.fields.sku).toBe('SKU already in use');
  });

  // ---------------------------------------------------------------- manual stock

  it('manual stock edit writes an ADJUSTMENT ledger row and keeps deltas correct (BR15)', async () => {
    const warehouse = await createWarehouse('Stock Edit Warehouse', `S${suffix}`);
    const location = await createLocation(warehouse.id, 'Stock', 'STOCK');
    const product = await createProduct({
      name: 'Stock Edit Product',
      sku: `IT-SE-${suffix}`,
      uom: 'pcs',
      reorderMin: 5,
      initialStock: { locationId: location.id, quantity: 10 },
    });

    const lowered = await request(app)
      .patch(`/api/v1/stock/${product.id}/${location.id}`)
      .set(auth())
      .send({ onHand: 4, note: 'Stocktake correction' })
      .expect(200);
    expect(lowered.body).toMatchObject({ onHand: 4, freeToUse: 4, lowStock: true, outOfStock: false });

    let ledger = await prisma.stockLedger.findMany({ where: { productId: product.id }, orderBy: { movedAt: 'asc' } });
    expect(ledger).toHaveLength(2);
    expect(ledger[1]).toMatchObject({ direction: 'OUT', fromLocationId: location.id });
    expect(ledger[1].quantity.toString()).toBe('6');
    const adjustmentMove = await prisma.stockMove.findUniqueOrThrow({ where: { id: ledger[1].stockMoveId } });
    expect(adjustmentMove.note).toBe('Stocktake correction');

    const unchanged = await request(app)
      .patch(`/api/v1/stock/${product.id}/${location.id}`)
      .set(auth())
      .send({ onHand: 4 })
      .expect(200);
    expect(unchanged.body.onHand).toBe(4);
    ledger = await prisma.stockLedger.findMany({ where: { productId: product.id } });
    expect(ledger).toHaveLength(2); // BR15: delta 0 writes no ledger row

    const raised = await request(app)
      .patch(`/api/v1/stock/${product.id}/${location.id}`)
      .set(auth())
      .send({ onHand: 31 })
      .expect(200);
    expect(raised.body).toMatchObject({ onHand: 31, lowStock: false, outOfStock: false });

    const negative = await request(app)
      .patch(`/api/v1/stock/${product.id}/${location.id}`)
      .set(auth())
      .send({ onHand: -1 });
    expect(negative.status).toBe(400);
    expect(negative.body.error.fields.onHand).toBeDefined();

    await request(app)
      .patch(`/api/v1/stock/11111111-1111-4111-8111-111111111111/${location.id}`)
      .set(auth())
      .send({ onHand: 1 })
      .expect(404);
    await request(app)
      .patch(`/api/v1/stock/${product.id}/11111111-1111-4111-8111-111111111111`)
      .set(auth())
      .send({ onHand: 1 })
      .expect(404);

    const byWarehouse = await request(app)
      .get(`/api/v1/stock?warehouseId=${warehouse.id}`)
      .set(auth())
      .expect(200);
    expect(byWarehouse.body.total).toBe(1);
    expect(byWarehouse.body.data[0].productId).toBe(product.id);
  });

  // -------------------------------------------------------------- engine invariants

  it('stock-engine: increase, decrease, CONFLICT guard, transfer two legs, reservations', async () => {
    const warehouse = await createWarehouse('Engine Warehouse', `E${suffix}`);
    const locationA = await createLocation(warehouse.id, 'A', 'A');
    const locationB = await createLocation(warehouse.id, 'B', 'B');
    const product = await createProduct({
      name: 'Engine Product',
      sku: `IT-ENG-${suffix}`,
      uom: 'kg',
    });

    const move = await createMoveRow({
      warehouseId: warehouse.id,
      type: 'ADJUSTMENT',
      operationType: 'ADJ',
      status: 'DONE',
      scheduleDate: new Date(),
      toLocationId: locationA.id,
      lines: [{ productId: product.id, quantity: 10 }],
    });

    const increased = await engine.increaseOnHand(
      { productId: product.id, locationId: locationA.id, quantity: 10, move: moveContext(move) },
    );
    expect(increased).toMatchObject({ onHand: 10, reserved: 0, freeToUse: 10 });

    const decreased = await engine.decreaseOnHand(
      { productId: product.id, locationId: locationA.id, quantity: 4, move: moveContext(move) },
    );
    expect(decreased.onHand).toBe(6);

    await expect(
      engine.decreaseOnHand(
        { productId: product.id, locationId: locationA.id, quantity: 100, move: moveContext(move) },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const transferred = await engine.transfer({
      productId: product.id,
      fromLocationId: locationA.id,
      toLocationId: locationB.id,
      quantity: 4,
      move: moveContext(move),
    });
    expect(transferred.from.onHand).toBe(2);
    expect(transferred.to.onHand).toBe(4);

    const transferLedger = await prisma.stockLedger.findMany({
      where: { stockMoveId: move.id, productId: product.id, direction: { in: ['IN', 'OUT'] } },
    });
    const legs = transferLedger.filter((row) => row.fromLocationId === locationA.id && row.toLocationId === locationB.id);
    expect(legs.map((row) => row.direction).sort()).toEqual(['IN', 'OUT']);

    const reserved = await engine.reserve({ productId: product.id, locationId: locationB.id, quantity: 3 });
    expect(reserved).toMatchObject({ onHand: 4, reserved: 3, freeToUse: 1 });

    await expect(
      engine.reserve({ productId: product.id, locationId: locationB.id, quantity: 2 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const released = await engine.releaseReservation({
      productId: product.id,
      locationId: locationB.id,
      quantity: 3,
    });
    expect(released).toMatchObject({ onHand: 4, reserved: 0, freeToUse: 4 });

    await expect(
      engine.releaseReservation({ productId: product.id, locationId: locationB.id, quantity: 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('reference generator produces unique, formatted, incrementing references (BR7-BR9)', async () => {
    const warehouse = await createWarehouse('Reference Warehouse', `R${suffix}`);

    const first = await referenceGenerator.next(warehouse.id, 'IN');
    const second = await referenceGenerator.next(warehouse.id, 'IN');
    expect(first).toBe(`R${suffix}/IN/0001`);
    expect(second).toBe(`R${suffix}/IN/0002`);

    const parallel = await Promise.all(
      Array.from({ length: 5 }, () => referenceGenerator.next(warehouse.id, 'OUT')),
    );
    expect(new Set(parallel).size).toBe(5);
    expect(parallel.every((reference) => /\/OUT\/\d{4,}$/.test(reference))).toBe(true);

    const otherType = await referenceGenerator.next(warehouse.id, 'ADJ');
    expect(otherType).toBe(`R${suffix}/ADJ/0001`);
  });

  // ------------------------------------------------------------------- dashboard

  it('dashboard KPIs: counts, boundaries, filters and empty state (BR19-BR22, R2.7/R2.8)', async () => {
    const warehouse = await createWarehouse('Dashboard Warehouse', `D${suffix}`);
    const location = await createLocation(warehouse.id, 'Stock', 'STOCK');
    const category = await createCategory(`Dashboard Cat ${suffix}`);

    const healthy = await createProduct({
      name: 'Dashboard Healthy',
      sku: `IT-DH-${suffix}`,
      categoryId: category.id,
      uom: 'pcs',
      reorderMin: 2,
      initialStock: { locationId: location.id, quantity: 50 },
    });
    const low = await createProduct({
      name: 'Dashboard Low',
      sku: `IT-DL-${suffix}`,
      categoryId: category.id,
      uom: 'pcs',
      reorderMin: 100,
      initialStock: { locationId: location.id, quantity: 10 },
    });

    await createMoveRow({
      warehouseId: warehouse.id,
      type: 'RECEIPT',
      operationType: 'IN',
      status: 'DRAFT',
      scheduleDate: daysFromNow(-1), // late
      toLocationId: location.id,
      lines: [{ productId: healthy.id, quantity: 1 }],
    });
    await createMoveRow({
      warehouseId: warehouse.id,
      type: 'RECEIPT',
      operationType: 'IN',
      status: 'READY',
      scheduleDate: daysFromNow(2), // operations
      toLocationId: location.id,
      lines: [{ productId: healthy.id, quantity: 1 }],
    });
    await createMoveRow({
      warehouseId: warehouse.id,
      type: 'DELIVERY',
      operationType: 'OUT',
      status: 'WAITING',
      scheduleDate: new Date(), // due today
      fromLocationId: location.id,
      lines: [{ productId: low.id, quantity: 999 }],
    });
    await createMoveRow({
      warehouseId: warehouse.id,
      type: 'DELIVERY',
      operationType: 'OUT',
      status: 'DRAFT',
      scheduleDate: daysFromNow(3), // operations
      fromLocationId: location.id,
      lines: [{ productId: healthy.id, quantity: 1 }],
    });
    await createMoveRow({
      warehouseId: warehouse.id,
      type: 'TRANSFER',
      operationType: 'INT',
      status: 'READY',
      scheduleDate: daysFromNow(1),
      fromLocationId: location.id,
      toLocationId: location.id,
      lines: [{ productId: healthy.id, quantity: 1 }],
    });
    await createMoveRow({
      warehouseId: warehouse.id,
      type: 'RECEIPT',
      operationType: 'IN',
      status: 'CANCELED',
      scheduleDate: daysFromNow(-5),
      toLocationId: location.id,
      lines: [{ productId: healthy.id, quantity: 1 }],
    });

    const kpis = await request(app)
      .get(`/api/v1/dashboard/kpis?warehouseId=${warehouse.id}`)
      .set(auth())
      .expect(200);

    expect(kpis.body).toEqual({
      totalProductsInStock: 2,
      lowStockCount: 1, // Dashboard Low: 10 ≤ 100
      pendingReceipts: 2,
      pendingDeliveries: 2,
      internalTransfersScheduled: 1,
      receiptSummary: { toReceive: 1, late: 1, operations: 1 },
      deliverySummary: { toDeliver: 1, late: 0, waiting: 1, operations: 1 },
    });

    const byCategory = await request(app)
      .get(`/api/v1/dashboard/kpis?categoryId=${category.id}`)
      .set(auth())
      .expect(200);
    expect(byCategory.body.totalProductsInStock).toBe(2);
    expect(byCategory.body.lowStockCount).toBe(1);
    expect(byCategory.body.pendingReceipts).toBe(2);

    const typeFiltered = await request(app)
      .get(`/api/v1/dashboard/kpis?warehouseId=${warehouse.id}&type=DELIVERY`)
      .set(auth())
      .expect(200);
    expect(typeFiltered.body.pendingReceipts).toBe(0);
    expect(typeFiltered.body.pendingDeliveries).toBe(2);
    expect(typeFiltered.body.internalTransfersScheduled).toBe(0);

    const statusFiltered = await request(app)
      .get(`/api/v1/dashboard/kpis?warehouseId=${warehouse.id}&status=DONE`)
      .set(auth())
      .expect(200);
    expect(statusFiltered.body.pendingReceipts).toBe(0);
    expect(statusFiltered.body.pendingDeliveries).toBe(0);

    const emptyWarehouse = await createWarehouse('Empty Warehouse', `Z${suffix}`);
    const empty = await request(app)
      .get(`/api/v1/dashboard/kpis?warehouseId=${emptyWarehouse.id}`)
      .set(auth())
      .expect(200);
    expect(empty.body).toEqual({
      totalProductsInStock: 0,
      lowStockCount: 0,
      pendingReceipts: 0,
      pendingDeliveries: 0,
      internalTransfersScheduled: 0,
      receiptSummary: { toReceive: 0, late: 0, operations: 0 },
      deliverySummary: { toDeliver: 0, late: 0, waiting: 0, operations: 0 },
    });

    const invalid = await request(app)
      .get('/api/v1/dashboard/kpis?type=NOPE')
      .set(auth())
      .expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    expect(invalid.body.error.fields.type).toBeDefined();
  });

  it('requires authentication on every Phase 2 endpoint', async () => {
    for (const path of ['/api/v1/products', '/api/v1/categories', '/api/v1/warehouses', '/api/v1/locations', '/api/v1/stock', '/api/v1/dashboard/kpis']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
  });
});
