/**
 * Canonical development seed — extended in Phase 3 to drive the REAL receipt/delivery
 * services, so demo documents, stock effects, ledger rows and delivery reservations are
 * always consistent with the running workflow code.
 *
 * Phase 3 changes: receipts are created → confirmed → validated through ReceiptsService;
 * deliveries through DeliveriesService (including the DRAFT reservation and
 * Ready → Done validation); the only directly-written document is the Phase 4 TRANSFER
 * placeholder (transfers do not exist until Phase 4).
 *
 * Idempotent: if the demo warehouse (short code WH) exists, the seed skips.
 * `SEED_RESET=1` wipes inventory tables first (auth data is never touched).
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { AdjustmentsService } from '../src/adjustments/service.js';
import { CatalogService } from '../src/catalog/service.js';
import { DeliveriesService } from '../src/deliveries/service.js';
import { ReceiptsService } from '../src/receipts/service.js';
import { createReferenceGenerator } from '../src/stock-engine/reference.js';
import { createStockEngine } from '../src/stock-engine/stock-engine.js';
import { TransfersService } from '../src/transfers/service.js';

const prisma = new PrismaClient();
const engine = createStockEngine(prisma);
const referenceGenerator = createReferenceGenerator(prisma);
const catalog = new CatalogService(prisma, engine, referenceGenerator);
const receipts = new ReceiptsService(prisma, engine, referenceGenerator);
const deliveries = new DeliveriesService(prisma, engine, referenceGenerator);
const transfers = new TransfersService(prisma, engine, referenceGenerator);
const adjustments = new AdjustmentsService(prisma, engine, referenceGenerator);

const DEMO_LOGIN_ID = 'demo01';
const DEMO_PASSWORD = 'Demo@123!';

function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function wipeInventory(): Promise<void> {
  await prisma.stockLedger.deleteMany({});
  await prisma.stockMoveLine.deleteMany({});
  await prisma.stockMove.deleteMany({});
  await prisma.stock.deleteMany({});
  await prisma.sequenceCounter.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.warehouse.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.contact.deleteMany({});
  console.log('[seed] inventory tables wiped (SEED_RESET=1)');
}

async function seed(): Promise<void> {
  const demoUser = await prisma.user.upsert({
    where: { loginId: DEMO_LOGIN_ID },
    update: {},
    create: {
      loginId: DEMO_LOGIN_ID,
      email: 'demo@example.com',
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      displayName: 'Demo User',
      role: 'INVENTORY_MANAGER',
    },
  });

  const categories = new Map<string, string>();
  for (const name of ['Steel', 'Tools', 'Packaging']) {
    const existing = await prisma.category.findUnique({ where: { name } });
    const category = existing ?? (await prisma.category.create({ data: { name } }));
    categories.set(name, category.id);
  }

  const mainWarehouse = await prisma.warehouse.create({
    data: { name: 'Main Warehouse', shortCode: 'WH', address: '12 Industrial Park, Zone A' },
  });
  const secondWarehouse = await prisma.warehouse.create({
    data: { name: 'Secondary Warehouse', shortCode: 'WH2', address: '5 Riverside Depot' },
  });

  const mainStock = await prisma.location.create({
    data: { warehouseId: mainWarehouse.id, name: 'Stock', shortCode: 'STOCK' },
  });
  const mainRackA = await prisma.location.create({
    data: { warehouseId: mainWarehouse.id, name: 'Rack A', shortCode: 'RACKA' },
  });
  const mainRackB = await prisma.location.create({
    data: { warehouseId: mainWarehouse.id, name: 'Rack B', shortCode: 'RACKB' },
  });
  const secondStock = await prisma.location.create({
    data: { warehouseId: secondWarehouse.id, name: 'Stock', shortCode: 'STOCK' },
  });

  const vendor = await prisma.contact.create({
    data: { name: 'Steel Supplier Co.', type: 'VENDOR', email: 'sales@steelsupplier.example' },
  });
  const customer = await prisma.contact.create({
    data: { name: 'Azure Interior', type: 'CUSTOMER', email: 'orders@azureinterior.example' },
  });

  // Products with initial stock (DONE ADJUSTMENT moves written by the stock-engine).
  const steelRod = await catalog.createProduct(
    {
      name: 'Steel Rod',
      sku: 'STL-ROD-001',
      categoryId: categories.get('Steel'),
      uom: 'kg',
      costPerUnit: 12.5,
      reorderMin: 50,
      reorderMax: 500,
      initialStock: { locationId: mainStock.id, quantity: 40 },
    },
    demoUser.id,
  );
  const steelPlate = await catalog.createProduct(
    {
      name: 'Steel Plate',
      sku: 'STL-PLT-002',
      categoryId: categories.get('Steel'),
      uom: 'kg',
      costPerUnit: 18,
      reorderMin: 20,
      reorderMax: 200,
      initialStock: { locationId: mainRackA.id, quantity: 40 },
    },
    demoUser.id,
  );
  const clawHammer = await catalog.createProduct(
    {
      name: 'Claw Hammer',
      sku: 'TOL-HAM-003',
      categoryId: categories.get('Tools'),
      uom: 'pcs',
      costPerUnit: 8.75,
      reorderMin: 10,
      reorderMax: 100,
      initialStock: { locationId: mainStock.id, quantity: 10 },
    },
    demoUser.id,
  );
  const cordlessDrill = await catalog.createProduct(
    {
      name: 'Cordless Drill',
      sku: 'TOL-DRL-004',
      categoryId: categories.get('Tools'),
      uom: 'pcs',
      costPerUnit: 129,
      reorderMin: 5,
      reorderMax: 30,
      initialStock: { locationId: mainRackB.id, quantity: 8 },
    },
    demoUser.id,
  );
  const cardboardBox = await catalog.createProduct(
    {
      name: 'Cardboard Box',
      sku: 'PKG-BOX-005',
      categoryId: categories.get('Packaging'),
      uom: 'pcs',
      costPerUnit: 0.8,
      reorderMin: 50,
      reorderMax: 1000,
      initialStock: { locationId: secondStock.id, quantity: 20 },
    },
    demoUser.id,
  );
  const woodScrew = await catalog.createProduct(
    {
      name: 'Wood Screw 4x40',
      sku: 'PKG-SCR-006',
      categoryId: categories.get('Packaging'),
      uom: 'pcs',
      costPerUnit: 0.05,
      reorderMin: 500,
      reorderMax: 5000,
    },
    demoUser.id,
  );

  // Out-of-stock demo row (no movement happened; the engine still owns the write).
  await engine.setOnHandFromCount({ productId: woodScrew.id, locationId: mainStock.id, countedQuantity: 0 });

  // --- Receipts through the real workflow (Draft → Ready → Done) ---
  const receiptA = await receipts.create(
    {
      fromContactId: vendor.id,
      toLocationId: mainStock.id,
      scheduleDate: daysFromNow(-5),
      lines: [{ productId: steelRod.id, quantity: 60 }],
    },
    demoUser.id,
  );
  await receipts.confirm(receiptA.id);
  await receipts.validate(receiptA.id);

  const receiptB = await receipts.create(
    {
      fromContactId: vendor.id,
      toLocationId: mainStock.id,
      scheduleDate: daysFromNow(-3),
      lines: [{ productId: clawHammer.id, quantity: 20 }],
    },
    demoUser.id,
  );
  await receipts.confirm(receiptB.id);
  await receipts.validate(receiptB.id);

  // --- Delivery through the real workflow (Draft → Ready → Done) ---
  const deliveryC = await deliveries.create(
    {
      fromLocationId: mainStock.id,
      toContactId: customer.id,
      scheduleDate: daysFromNow(-1),
      operationType: 'Delivery order',
      lines: [{ productId: clawHammer.id, quantity: 5 }],
    },
    demoUser.id,
  );
  await deliveries.validate(deliveryC.id); // Draft → Ready
  await deliveries.validate(deliveryC.id); // Ready → Done (stock decreases)

  // --- Open documents that drive the Dashboard late/operations/waiting KPIs ---
  await receipts.create(
    {
      fromContactId: vendor.id,
      toLocationId: mainStock.id,
      scheduleDate: daysFromNow(-1),
      lines: [{ productId: steelPlate.id, quantity: 25 }],
    },
    demoUser.id,
  );

  const receiptE = await receipts.create(
    {
      fromContactId: vendor.id,
      toLocationId: secondStock.id,
      scheduleDate: daysFromNow(3),
      lines: [{ productId: cardboardBox.id, quantity: 100 }],
    },
    demoUser.id,
  );
  await receipts.confirm(receiptE.id); // Ready to receive

  await deliveries.create(
    {
      fromLocationId: mainRackB.id,
      toContactId: customer.id,
      scheduleDate: daysFromNow(2),
      operationType: 'Delivery order',
      lines: [{ productId: cordlessDrill.id, quantity: 3 }],
    },
    demoUser.id,
  );

  await deliveries.create(
    {
      fromLocationId: mainStock.id,
      toContactId: customer.id,
      scheduleDate: daysFromNow(0),
      operationType: 'Delivery order',
      lines: [{ productId: woodScrew.id, quantity: 100 }],
    },
    demoUser.id,
  ); // → WAITING: no stock yet (R6.12)

  const receiptH = await receipts.create(
    {
      fromContactId: vendor.id,
      toLocationId: mainStock.id,
      scheduleDate: daysFromNow(-2),
      lines: [{ productId: steelPlate.id, quantity: 5 }],
    },
    demoUser.id,
  );
  await receipts.cancel(receiptH.id); // CANCELED — excluded from every dashboard count

  // --- Phase 4: transfers through the real workflow (Draft → Ready → Done / Ready) ---
  const completedTransfer = await transfers.create(
    {
      fromLocationId: mainRackA.id,
      toLocationId: mainRackB.id,
      scheduleDate: daysFromNow(-2),
      lines: [{ productId: steelPlate.id, quantity: 10 }],
    },
    demoUser.id,
  );
  await transfers.confirm(completedTransfer.id);
  await transfers.validate(completedTransfer.id); // plate 40 → Rack A 30 + Rack B 10

  const scheduledTransfer = await transfers.create(
    {
      fromLocationId: mainRackA.id,
      toLocationId: mainRackB.id,
      scheduleDate: daysFromNow(4),
      lines: [{ productId: steelPlate.id, quantity: 5 }],
    },
    demoUser.id,
  );
  await transfers.confirm(scheduledTransfer.id); // READY, reserves 5 at Rack A

  // --- Phase 4: physical-count adjustments (single-step, applied immediately) ---
  await adjustments.create(
    {
      productId: clawHammer.id,
      locationId: mainStock.id,
      countedQuantity: 23, // recorded 25 → -2 damaged
      note: '2 units damaged in handling',
    },
    demoUser.id,
  );
  await adjustments.create(
    {
      productId: cordlessDrill.id,
      locationId: mainRackB.id,
      countedQuantity: 9, // recorded 8 → +1 found during count (3 are reserved)
      note: 'One extra unit found during count',
    },
    demoUser.id,
  );

  const [products, stockRows, ledgerRows, moves, reservedRows] = await Promise.all([
    prisma.product.count(),
    prisma.stock.count(),
    prisma.stockLedger.count(),
    prisma.stockMove.count(),
    prisma.stock.count({ where: { reservedQty: { gt: 0 } } }),
  ]);

  console.log('[seed] done');
  console.log(`  demo login: ${DEMO_LOGIN_ID} / ${DEMO_PASSWORD}`);
  console.log(`  warehouses: 2, locations: 4, products: ${products}, stock rows: ${stockRows}`);
  console.log(`  stock moves: ${moves}, ledger rows: ${ledgerRows}, reserved stock rows: ${reservedRows}`);
}

async function main(): Promise<void> {
  try {
    if (process.env.SEED_RESET === '1') {
      await wipeInventory();
    }

    const existing = await prisma.warehouse.findUnique({ where: { shortCode: 'WH' } });
    if (existing) {
      console.log('[seed] demo data already present — skipping (set SEED_RESET=1 to reseed)');
      return;
    }

    await seed();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[seed] failed', error);
  process.exitCode = 1;
});
