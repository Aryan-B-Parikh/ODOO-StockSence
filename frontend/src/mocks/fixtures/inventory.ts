import type { StockMoveStatus, StockMoveType } from '@stocksense/shared';

/**
 * Phase 2 MSW fixtures for 05_API_CONTRACTS.md §2–§5.
 * Mirrors the canonical backend seed (backend/prisma/seed.ts) so the UI behaves the
 * same against mocks and the live API (13_DEFINITION_OF_DONE.md screen checklist).
 */

export interface MockCategory {
  id: string;
  name: string;
}

export interface MockWarehouse {
  id: string;
  name: string;
  shortCode: string;
  address: string | null;
}

export interface MockLocation {
  id: string;
  warehouseId: string;
  name: string;
  shortCode: string;
}

export interface MockProduct {
  id: string;
  name: string;
  sku: string;
  categoryId: string | null;
  uom: string;
  costPerUnit: number | null;
  reorderMin: number | null;
  reorderMax: number | null;
}

export interface MockStock {
  productId: string;
  locationId: string;
  onHand: number;
  reserved: number;
}

export interface MockMove {
  id: string;
  reference: string;
  type: StockMoveType;
  status: StockMoveStatus;
  scheduleDate: string;
  warehouseId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  lines: Array<{ productId: string; quantity: number }>;
}

/** Phase 4 mock ledger — drives the Move History mock; workflows append rows. */
export interface MockLedgerRow {
  id: string;
  reference: string;
  type: StockMoveType;
  direction: 'IN' | 'OUT';
  productId: string;
  warehouseId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  contactId: string | null;
  quantity: number;
  movedAt: string;
}

export interface MockDb {
  categories: MockCategory[];
  warehouses: MockWarehouse[];
  locations: MockLocation[];
  products: MockProduct[];
  stock: MockStock[];
  moves: MockMove[];
  ledger: MockLedgerRow[];
  counters: Record<string, number>;
}

function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const mockIds = {
  warehouseMain: '10000000-0000-4000-8000-000000000001',
  warehouseSecond: '10000000-0000-4000-8000-000000000002',
  warehouseEmpty: '10000000-0000-4000-8000-000000000003',
  locationMainStock: '20000000-0000-4000-8000-000000000001',
  locationRackA: '20000000-0000-4000-8000-000000000002',
  locationRackB: '20000000-0000-4000-8000-000000000003',
  locationSecondStock: '20000000-0000-4000-8000-000000000004',
  categorySteel: '30000000-0000-4000-8000-000000000001',
  categoryTools: '30000000-0000-4000-8000-000000000002',
  categoryPackaging: '30000000-0000-4000-8000-000000000003',
  productSteelRod: '40000000-0000-4000-8000-000000000001',
  productSteelPlate: '40000000-0000-4000-8000-000000000002',
  productClawHammer: '40000000-0000-4000-8000-000000000003',
  productCordlessDrill: '40000000-0000-4000-8000-000000000004',
  productCardboardBox: '40000000-0000-4000-8000-000000000005',
  productWoodScrew: '40000000-0000-4000-8000-000000000006',
} as const;

function createSeedDb(): MockDb {
  return {
    categories: [
      { id: mockIds.categorySteel, name: 'Steel' },
      { id: mockIds.categoryTools, name: 'Tools' },
      { id: mockIds.categoryPackaging, name: 'Packaging' },
    ],
    warehouses: [
      { id: mockIds.warehouseMain, name: 'Main Warehouse', shortCode: 'WH', address: '12 Industrial Park, Zone A' },
      { id: mockIds.warehouseSecond, name: 'Secondary Warehouse', shortCode: 'WH2', address: '5 Riverside Depot' },
      { id: mockIds.warehouseEmpty, name: 'Empty Warehouse', shortCode: 'WH3', address: null },
    ],
    locations: [
      { id: mockIds.locationMainStock, warehouseId: mockIds.warehouseMain, name: 'Stock', shortCode: 'STOCK' },
      { id: mockIds.locationRackA, warehouseId: mockIds.warehouseMain, name: 'Rack A', shortCode: 'RACKA' },
      { id: mockIds.locationRackB, warehouseId: mockIds.warehouseMain, name: 'Rack B', shortCode: 'RACKB' },
      { id: mockIds.locationSecondStock, warehouseId: mockIds.warehouseSecond, name: 'Stock', shortCode: 'STOCK' },
    ],
    products: [
      {
        id: mockIds.productSteelRod,
        name: 'Steel Rod',
        sku: 'STL-ROD-001',
        categoryId: mockIds.categorySteel,
        uom: 'kg',
        costPerUnit: 12.5,
        reorderMin: 50,
        reorderMax: 500,
      },
      {
        id: mockIds.productSteelPlate,
        name: 'Steel Plate',
        sku: 'STL-PLT-002',
        categoryId: mockIds.categorySteel,
        uom: 'kg',
        costPerUnit: 18,
        reorderMin: 20,
        reorderMax: 200,
      },
      {
        id: mockIds.productClawHammer,
        name: 'Claw Hammer',
        sku: 'TOL-HAM-003',
        categoryId: mockIds.categoryTools,
        uom: 'pcs',
        costPerUnit: 8.75,
        reorderMin: 10,
        reorderMax: 100,
      },
      {
        id: mockIds.productCordlessDrill,
        name: 'Cordless Drill',
        sku: 'TOL-DRL-004',
        categoryId: mockIds.categoryTools,
        uom: 'pcs',
        costPerUnit: 129,
        reorderMin: 5,
        reorderMax: 30,
      },
      {
        id: mockIds.productCardboardBox,
        name: 'Cardboard Box',
        sku: 'PKG-BOX-005',
        categoryId: mockIds.categoryPackaging,
        uom: 'pcs',
        costPerUnit: 0.8,
        reorderMin: 50,
        reorderMax: 1000,
      },
      {
        id: mockIds.productWoodScrew,
        name: 'Wood Screw 4x40',
        sku: 'PKG-SCR-006',
        categoryId: mockIds.categoryPackaging,
        uom: 'pcs',
        costPerUnit: 0.05,
        reorderMin: 500,
        reorderMax: 5000,
      },
    ],
    stock: [
      { productId: mockIds.productSteelRod, locationId: mockIds.locationMainStock, onHand: 100, reserved: 0 },
      { productId: mockIds.productSteelPlate, locationId: mockIds.locationRackA, onHand: 30, reserved: 5 },
      { productId: mockIds.productClawHammer, locationId: mockIds.locationMainStock, onHand: 23, reserved: 0 },
      // reserved 3 = open DRAFT delivery WH/OUT/0002 (Phase 3 reservations)
      { productId: mockIds.productCordlessDrill, locationId: mockIds.locationRackB, onHand: 8, reserved: 3 },
      // plate was split by the completed WH/INT/0001 transfer; Rack A also backs the
      // open READY WH/INT/0002 transfer with 5 reserved (Phase 4 reservations)
      { productId: mockIds.productSteelPlate, locationId: mockIds.locationRackB, onHand: 10, reserved: 0 },
      { productId: mockIds.productCardboardBox, locationId: mockIds.locationSecondStock, onHand: 20, reserved: 0 },
      { productId: mockIds.productWoodScrew, locationId: mockIds.locationMainStock, onHand: 0, reserved: 0 },
    ],
    moves: [
      {
        id: '50000000-0000-4000-8000-000000000001',
        reference: 'WH/IN/0001',
        type: 'RECEIPT',
        status: 'DONE',
        scheduleDate: dayOffset(-5),
        warehouseId: mockIds.warehouseMain,
        fromLocationId: null,
        toLocationId: mockIds.locationMainStock,
        lines: [{ productId: mockIds.productSteelRod, quantity: 60 }],
      },
      {
        id: '50000000-0000-4000-8000-000000000002',
        reference: 'WH/IN/0002',
        type: 'RECEIPT',
        status: 'DONE',
        scheduleDate: dayOffset(-3),
        warehouseId: mockIds.warehouseMain,
        fromLocationId: null,
        toLocationId: mockIds.locationMainStock,
        lines: [{ productId: mockIds.productClawHammer, quantity: 20 }],
      },
      {
        id: '50000000-0000-4000-8000-000000000003',
        reference: 'WH/OUT/0001',
        type: 'DELIVERY',
        status: 'DONE',
        scheduleDate: dayOffset(-1),
        warehouseId: mockIds.warehouseMain,
        fromLocationId: mockIds.locationMainStock,
        toLocationId: null,
        lines: [{ productId: mockIds.productClawHammer, quantity: 5 }],
      },
      {
        id: '50000000-0000-4000-8000-000000000004',
        reference: 'WH/IN/0003',
        type: 'RECEIPT',
        status: 'DRAFT',
        scheduleDate: dayOffset(-1),
        warehouseId: mockIds.warehouseMain,
        fromLocationId: null,
        toLocationId: mockIds.locationMainStock,
        lines: [{ productId: mockIds.productSteelPlate, quantity: 25 }],
      },
      {
        id: '50000000-0000-4000-8000-000000000005',
        reference: 'WH2/IN/0001',
        type: 'RECEIPT',
        status: 'READY',
        scheduleDate: dayOffset(3),
        warehouseId: mockIds.warehouseSecond,
        fromLocationId: null,
        toLocationId: mockIds.locationSecondStock,
        lines: [{ productId: mockIds.productCardboardBox, quantity: 100 }],
      },
      {
        id: '50000000-0000-4000-8000-000000000006',
        reference: 'WH/OUT/0002',
        type: 'DELIVERY',
        status: 'DRAFT',
        scheduleDate: dayOffset(2),
        warehouseId: mockIds.warehouseMain,
        fromLocationId: mockIds.locationRackB,
        toLocationId: null,
        lines: [{ productId: mockIds.productCordlessDrill, quantity: 3 }],
      },
      {
        id: '50000000-0000-4000-8000-000000000007',
        reference: 'WH/OUT/0003',
        type: 'DELIVERY',
        status: 'WAITING',
        scheduleDate: dayOffset(0),
        warehouseId: mockIds.warehouseMain,
        fromLocationId: mockIds.locationMainStock,
        toLocationId: null,
        lines: [{ productId: mockIds.productWoodScrew, quantity: 100 }],
      },
      {
        id: '50000000-0000-4000-8000-000000000008',
        reference: 'WH/INT/0001',
        type: 'TRANSFER',
        status: 'READY',
        scheduleDate: dayOffset(4),
        warehouseId: mockIds.warehouseMain,
        fromLocationId: mockIds.locationRackA,
        toLocationId: mockIds.locationRackB,
        lines: [{ productId: mockIds.productSteelRod, quantity: 10 }],
      },
      {
        id: '50000000-0000-4000-8000-000000000009',
        reference: 'WH/IN/0004',
        type: 'RECEIPT',
        status: 'CANCELED',
        scheduleDate: dayOffset(-2),
        warehouseId: mockIds.warehouseMain,
        fromLocationId: null,
        toLocationId: mockIds.locationMainStock,
        lines: [{ productId: mockIds.productSteelPlate, quantity: 5 }],
      },
    ],
    ledger: [
      ledgerRow('WH/ADJ/0001', 'ADJUSTMENT', 'IN', mockIds.productSteelRod, mockIds.warehouseMain, null, mockIds.locationMainStock, null, 40, -6),
      ledgerRow('WH/ADJ/0002', 'ADJUSTMENT', 'IN', mockIds.productSteelPlate, mockIds.warehouseMain, null, mockIds.locationRackA, null, 40, -6),
      ledgerRow('WH/ADJ/0003', 'ADJUSTMENT', 'IN', mockIds.productClawHammer, mockIds.warehouseMain, null, mockIds.locationMainStock, null, 10, -6),
      ledgerRow('WH/ADJ/0004', 'ADJUSTMENT', 'IN', mockIds.productCordlessDrill, mockIds.warehouseMain, null, mockIds.locationRackB, null, 8, -6),
      ledgerRow('WH2/ADJ/0001', 'ADJUSTMENT', 'IN', mockIds.productCardboardBox, mockIds.warehouseSecond, null, mockIds.locationSecondStock, null, 20, -6),
      ledgerRow('WH/IN/0001', 'RECEIPT', 'IN', mockIds.productSteelRod, mockIds.warehouseMain, null, mockIds.locationMainStock, null, 60, -5),
      ledgerRow('WH/IN/0002', 'RECEIPT', 'IN', mockIds.productClawHammer, mockIds.warehouseMain, null, mockIds.locationMainStock, null, 20, -3),
      ledgerRow('WH/OUT/0001', 'DELIVERY', 'OUT', mockIds.productClawHammer, mockIds.warehouseMain, mockIds.locationMainStock, null, null, 5, -1),
      ledgerRow('WH/ADJ/0005', 'ADJUSTMENT', 'OUT', mockIds.productClawHammer, mockIds.warehouseMain, mockIds.locationMainStock, null, null, 2, -1),
      ledgerRow('WH/INT/0001', 'TRANSFER', 'OUT', mockIds.productSteelPlate, mockIds.warehouseMain, mockIds.locationRackA, mockIds.locationRackB, null, 10, -2),
      ledgerRow('WH/INT/0001', 'TRANSFER', 'IN', mockIds.productSteelPlate, mockIds.warehouseMain, mockIds.locationRackA, mockIds.locationRackB, null, 10, -2),
    ],
    counters: {
      [`${mockIds.warehouseMain}:IN`]: 4,
      [`${mockIds.warehouseMain}:OUT`]: 3,
      [`${mockIds.warehouseMain}:INT`]: 2,
      [`${mockIds.warehouseMain}:ADJ`]: 5,
      [`${mockIds.warehouseSecond}:IN`]: 1,
      [`${mockIds.warehouseSecond}:ADJ`]: 1,
    },
  };
}

function ledgerRow(
  reference: string,
  type: StockMoveType,
  direction: 'IN' | 'OUT',
  productId: string,
  warehouseId: string,
  fromLocationId: string | null,
  toLocationId: string | null,
  contactId: string | null,
  quantity: number,
  dayOffsetValue: number,
): MockLedgerRow {
  const movedAt = new Date(`${dayOffset(dayOffsetValue)}T10:00:00.000Z`).toISOString();
  return {
    id: crypto.randomUUID(),
    reference,
    type,
    direction,
    productId,
    warehouseId,
    fromLocationId,
    toLocationId,
    contactId,
    quantity,
    movedAt,
  };
}

let db: MockDb = createSeedDb();

export function resetInventoryMockStore(): void {
  db = createSeedDb();
}

export function inventoryDb(): MockDb {
  return db;
}

export function nextMockReference(warehouseId: string, operationType: string): string {
  const key = `${warehouseId}:${operationType}`;
  const next = (db.counters[key] ?? 0) + 1;
  db.counters[key] = next;
  const warehouse = db.warehouses.find((candidate) => candidate.id === warehouseId);
  return `${warehouse?.shortCode ?? 'WH'}/${operationType}/${String(next).padStart(4, '0')}`;
}

/** Appends a Move History row (mock workflows call this when documents reach DONE). */
export function pushMockLedger(row: Omit<MockLedgerRow, 'id' | 'movedAt'> & { movedAt?: string }): MockLedgerRow {
  const entry: MockLedgerRow = { id: crypto.randomUUID(), movedAt: new Date().toISOString(), ...row };
  db.ledger.push(entry);
  return entry;
}
