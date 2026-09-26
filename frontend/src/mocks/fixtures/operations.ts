import type {
  AdjustmentSummary,
  ContactSummary,
  DeliveryDetail,
  DeliveryLine,
  DeliverySummary,
  MoveHistoryRow,
  Paginated,
  PrintPayload,
  ReceiptDetail,
  ReceiptSummary,
  StockMoveStatus,
  TransferDetail,
  TransferSummary,
} from '@stocksense/shared';
import { inventoryDb, mockIds, nextMockReference, pushMockLedger, type MockDb } from './inventory';

/**
 * Phase 3 MSW fixtures for 05_API_CONTRACTS.md §4b/§6/§7 — stateful mocks that mirror the
 * backend workflows (create → transitions, delivery reservations, stock effects) so the UI
 * can be built and tested against mocks before/without the live API
 * (03_ARCHITECTURE.md "contract-first mocking").
 *
 * Note: this mock store is intentionally separate from `inventory.ts` (which powers the
 * dashboard/stock fixtures); both share the same stock rows for reservation math.
 */

export interface MockContact {
  id: string;
  name: string;
  type: 'VENDOR' | 'CUSTOMER';
  email: string | null;
  phone: string | null;
}

export interface MockDocLine {
  id: string;
  productId: string;
  quantity: number;
}

export interface MockReceipt {
  id: string;
  reference: string;
  status: StockMoveStatus;
  scheduleDate: string;
  warehouseId: string;
  fromContactId: string;
  toLocationId: string;
  responsibleUserId: string;
  validatedAt: string | null;
  note: string | null;
  createdAt: string;
  lines: MockDocLine[];
}

export interface MockDelivery {
  id: string;
  reference: string;
  status: StockMoveStatus;
  scheduleDate: string;
  warehouseId: string;
  fromLocationId: string;
  toContactId: string;
  operationType: string;
  responsibleUserId: string;
  validatedAt: string | null;
  note: string | null;
  createdAt: string;
  lines: MockDocLine[];
}

export interface MockTransfer {
  id: string;
  reference: string;
  status: StockMoveStatus;
  scheduleDate: string;
  warehouseId: string;
  fromLocationId: string;
  toLocationId: string;
  responsibleUserId: string;
  validatedAt: string | null;
  note: string | null;
  createdAt: string;
  lines: MockDocLine[];
}

export interface MockAdjustment {
  id: string;
  reference: string;
  status: 'DONE';
  movedAt: string;
  warehouseId: string;
  productId: string;
  locationId: string;
  recordedQuantity: number;
  countedQuantity: number;
  delta: number;
  note: string | null;
}

export type MockResult<T> =
  | { ok: true; status?: number; body: T }
  | { ok: false; status: number; code: string; message: string; fields?: Record<string, string> };

const RESPONSIBLE_USER = '11111111-1111-4111-8111-111111111111';

export const contactIds = {
  vendor: '70000000-0000-4000-8000-000000000001',
  customer: '70000000-0000-4000-8000-000000000002',
};

function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function lineId(seed: string): string {
  return `66000000-0000-4000-8000-${seed.padStart(12, '0')}`;
}

function createSeed() {
  const contacts: MockContact[] = [
    {
      id: contactIds.vendor,
      name: 'Steel Supplier Co.',
      type: 'VENDOR',
      email: 'sales@steelsupplier.example',
      phone: null,
    },
    {
      id: contactIds.customer,
      name: 'Azure Interior',
      type: 'CUSTOMER',
      email: 'orders@azureinterior.example',
      phone: null,
    },
  ];

  const receipts: MockReceipt[] = [
    {
      id: '60000000-0000-4000-8000-000000000001',
      reference: 'WH/IN/0001',
      status: 'DONE',
      scheduleDate: dayOffset(-5),
      warehouseId: mockIds.warehouseMain,
      fromContactId: contactIds.vendor,
      toLocationId: mockIds.locationMainStock,
      responsibleUserId: RESPONSIBLE_USER,
      validatedAt: dayOffset(-5),
      note: null,
      createdAt: dayOffset(-5),
      lines: [{ id: lineId('1'), productId: mockIds.productSteelRod, quantity: 60 }],
    },
    {
      id: '60000000-0000-4000-8000-000000000002',
      reference: 'WH/IN/0002',
      status: 'DONE',
      scheduleDate: dayOffset(-3),
      warehouseId: mockIds.warehouseMain,
      fromContactId: contactIds.vendor,
      toLocationId: mockIds.locationMainStock,
      responsibleUserId: RESPONSIBLE_USER,
      validatedAt: dayOffset(-3),
      note: null,
      createdAt: dayOffset(-3),
      lines: [{ id: lineId('2'), productId: mockIds.productClawHammer, quantity: 20 }],
    },
    {
      id: '60000000-0000-4000-8000-000000000003',
      reference: 'WH/IN/0003',
      status: 'DRAFT',
      scheduleDate: dayOffset(-1),
      warehouseId: mockIds.warehouseMain,
      fromContactId: contactIds.vendor,
      toLocationId: mockIds.locationMainStock,
      responsibleUserId: RESPONSIBLE_USER,
      validatedAt: null,
      note: null,
      createdAt: dayOffset(-1),
      lines: [{ id: lineId('3'), productId: mockIds.productSteelPlate, quantity: 25 }],
    },
    {
      id: '60000000-0000-4000-8000-000000000004',
      reference: 'WH2/IN/0001',
      status: 'READY',
      scheduleDate: dayOffset(3),
      warehouseId: mockIds.warehouseSecond,
      fromContactId: contactIds.vendor,
      toLocationId: mockIds.locationSecondStock,
      responsibleUserId: RESPONSIBLE_USER,
      validatedAt: null,
      note: null,
      createdAt: dayOffset(-2),
      lines: [{ id: lineId('4'), productId: mockIds.productCardboardBox, quantity: 100 }],
    },
  ];

  const deliveries: MockDelivery[] = [
    {
      id: '62000000-0000-4000-8000-000000000001',
      reference: 'WH/OUT/0001',
      status: 'DONE',
      scheduleDate: dayOffset(-1),
      warehouseId: mockIds.warehouseMain,
      fromLocationId: mockIds.locationMainStock,
      toContactId: contactIds.customer,
      operationType: 'Delivery order',
      responsibleUserId: RESPONSIBLE_USER,
      validatedAt: dayOffset(-1),
      note: null,
      createdAt: dayOffset(-1),
      lines: [{ id: lineId('11'), productId: mockIds.productClawHammer, quantity: 5 }],
    },
    {
      id: '62000000-0000-4000-8000-000000000002',
      reference: 'WH/OUT/0002',
      status: 'DRAFT',
      scheduleDate: dayOffset(2),
      warehouseId: mockIds.warehouseMain,
      fromLocationId: mockIds.locationRackB,
      toContactId: contactIds.customer,
      operationType: 'Delivery order',
      responsibleUserId: RESPONSIBLE_USER,
      validatedAt: null,
      note: null,
      createdAt: dayOffset(-1),
      lines: [{ id: lineId('12'), productId: mockIds.productCordlessDrill, quantity: 3 }],
    },
    {
      id: '62000000-0000-4000-8000-000000000003',
      reference: 'WH/OUT/0003',
      status: 'WAITING',
      scheduleDate: dayOffset(0),
      warehouseId: mockIds.warehouseMain,
      fromLocationId: mockIds.locationMainStock,
      toContactId: contactIds.customer,
      operationType: 'Delivery order',
      responsibleUserId: RESPONSIBLE_USER,
      validatedAt: null,
      note: null,
      createdAt: dayOffset(0),
      lines: [{ id: lineId('13'), productId: mockIds.productWoodScrew, quantity: 100 }],
    },
  ];

  const transfers: MockTransfer[] = [
    {
      id: '64000000-0000-4000-8000-000000000001',
      reference: 'WH/INT/0001',
      status: 'DONE',
      scheduleDate: dayOffset(-2),
      warehouseId: mockIds.warehouseMain,
      fromLocationId: mockIds.locationRackA,
      toLocationId: mockIds.locationRackB,
      responsibleUserId: RESPONSIBLE_USER,
      validatedAt: dayOffset(-2),
      note: null,
      createdAt: dayOffset(-2),
      lines: [{ id: lineId('21'), productId: mockIds.productSteelPlate, quantity: 10 }],
    },
    {
      id: '64000000-0000-4000-8000-000000000002',
      reference: 'WH/INT/0002',
      status: 'READY',
      scheduleDate: dayOffset(4),
      warehouseId: mockIds.warehouseMain,
      fromLocationId: mockIds.locationRackA,
      toLocationId: mockIds.locationRackB,
      responsibleUserId: RESPONSIBLE_USER,
      validatedAt: null,
      note: null,
      createdAt: dayOffset(-1),
      lines: [{ id: lineId('22'), productId: mockIds.productSteelPlate, quantity: 5 }],
    },
  ];

  const adjustments: MockAdjustment[] = [
    { reference: 'WH/ADJ/0001', productId: mockIds.productSteelRod, locationId: mockIds.locationMainStock, warehouseId: mockIds.warehouseMain, recorded: 0, counted: 40, note: 'Initial stock', day: -6 },
    { reference: 'WH/ADJ/0002', productId: mockIds.productSteelPlate, locationId: mockIds.locationRackA, warehouseId: mockIds.warehouseMain, recorded: 0, counted: 40, note: 'Initial stock', day: -6 },
    { reference: 'WH/ADJ/0003', productId: mockIds.productClawHammer, locationId: mockIds.locationMainStock, warehouseId: mockIds.warehouseMain, recorded: 0, counted: 10, note: 'Initial stock', day: -6 },
    { reference: 'WH/ADJ/0004', productId: mockIds.productCordlessDrill, locationId: mockIds.locationRackB, warehouseId: mockIds.warehouseMain, recorded: 0, counted: 8, note: 'Initial stock', day: -6 },
    { reference: 'WH2/ADJ/0001', productId: mockIds.productCardboardBox, locationId: mockIds.locationSecondStock, warehouseId: mockIds.warehouseSecond, recorded: 0, counted: 20, note: 'Initial stock', day: -6 },
    { reference: 'WH/ADJ/0005', productId: mockIds.productClawHammer, locationId: mockIds.locationMainStock, warehouseId: mockIds.warehouseMain, recorded: 25, counted: 23, note: '2 units damaged in handling', day: -1 },
  ].map((seed, index) => ({
    id: lineId(`3${index}`),
    reference: seed.reference,
    status: 'DONE' as const,
    movedAt: new Date(`${dayOffset(seed.day)}T10:00:00.000Z`).toISOString(),
    warehouseId: seed.warehouseId,
    productId: seed.productId,
    locationId: seed.locationId,
    recordedQuantity: seed.recorded,
    countedQuantity: seed.counted,
    delta: seed.counted - seed.recorded,
    note: seed.note,
  }));

  return { contacts, receipts, deliveries, transfers, adjustments };
}

let store = createSeed();

export function resetOperationsMockStore(): void {
  store = createSeed();
}

export function operationsDb() {
  return store;
}

// ------------------------------------------------------------ stock primitives

function stockRow(productId: string, locationId: string) {
  return inventoryDb().stock.find((row) => row.productId === productId && row.locationId === locationId);
}

function reserveStock(productId: string, locationId: string, quantity: number): boolean {
  const row = stockRow(productId, locationId);
  if (!row || row.reserved + quantity > row.onHand) return false;
  row.reserved += quantity;
  return true;
}

function releaseStock(productId: string, locationId: string, quantity: number): boolean {
  const row = stockRow(productId, locationId);
  if (!row || row.reserved < quantity) return false;
  row.reserved -= quantity;
  return true;
}

function increaseStock(productId: string, locationId: string, quantity: number): void {
  let row = stockRow(productId, locationId);
  if (!row) {
    row = { productId, locationId, onHand: 0, reserved: 0 };
    inventoryDb().stock.push(row);
  }
  row.onHand += quantity;
}

function decreaseStock(productId: string, locationId: string, quantity: number): boolean {
  const row = stockRow(productId, locationId);
  if (!row || row.onHand < quantity) return false;
  row.onHand -= quantity;
  return true;
}

function aggregate(lines: Array<{ productId: string; quantity: number }>): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity);
  return totals;
}

function releaseAll(locationId: string, lines: Array<{ productId: string; quantity: number }>): void {
  for (const [productId, quantity] of aggregate(lines)) releaseStock(productId, locationId, quantity);
}

function tryReserveAll(locationId: string, lines: Array<{ productId: string; quantity: number }>): boolean {
  const taken: Array<[string, number]> = [];
  for (const [productId, quantity] of aggregate(lines)) {
    if (!reserveStock(productId, locationId, quantity)) {
      for (const [releasedProduct, releasedQuantity] of taken) {
        releaseStock(releasedProduct, locationId, releasedQuantity);
      }
      return false;
    }
    taken.push([productId, quantity]);
  }
  return true;
}

function recheckWaitingDeliveries(locationId: string, productIds: string[]): void {
  const waiting = store.deliveries
    .filter(
      (delivery) =>
        delivery.status === 'WAITING' &&
        delivery.fromLocationId === locationId &&
        delivery.lines.some((line) => productIds.includes(line.productId)),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const delivery of waiting) {
    if (tryReserveAll(locationId, delivery.lines)) delivery.status = 'READY';
  }
}

// --------------------------------------------------------------- DTO mapping

function fail(status: number, code: string, message: string, fields?: Record<string, string>): MockResult<never> {
  return { ok: false, status, code, message, ...(fields ? { fields } : {}) };
}

function receiptSummary(db: MockDb, receipt: MockReceipt): ReceiptSummary {
  const contact = store.contacts.find((candidate) => candidate.id === receipt.fromContactId);
  const location = db.locations.find((candidate) => candidate.id === receipt.toLocationId);
  return {
    id: receipt.id,
    reference: receipt.reference,
    status: receipt.status,
    scheduleDate: receipt.scheduleDate,
    warehouseId: receipt.warehouseId,
    fromContactId: receipt.fromContactId,
    fromContactName: contact?.name ?? '',
    fromContactEmail: contact?.email ?? null,
    toLocationId: receipt.toLocationId,
    toLocationName: location?.name ?? '',
    responsibleUserId: receipt.responsibleUserId,
  };
}

function receiptDetail(db: MockDb, receipt: MockReceipt): ReceiptDetail {
  return {
    ...receiptSummary(db, receipt),
    responsibleUserName: 'Demo User',
    validatedAt: receipt.validatedAt,
    createdAt: receipt.createdAt,
    note: receipt.note,
    lines: receipt.lines.map((line) => {
      const product = db.products.find((candidate) => candidate.id === line.productId);
      return {
        id: line.id,
        productId: line.productId,
        productName: product?.name ?? 'Unknown product',
        sku: product?.sku ?? '',
        uom: product?.uom ?? '',
        quantity: line.quantity,
      };
    }),
  };
}

function deliverySummary(db: MockDb, delivery: MockDelivery): DeliverySummary {
  const contact = store.contacts.find((candidate) => candidate.id === delivery.toContactId);
  const location = db.locations.find((candidate) => candidate.id === delivery.fromLocationId);
  return {
    id: delivery.id,
    reference: delivery.reference,
    status: delivery.status,
    scheduleDate: delivery.scheduleDate,
    warehouseId: delivery.warehouseId,
    fromLocationId: delivery.fromLocationId,
    fromLocationName: location?.name ?? '',
    toContactId: delivery.toContactId,
    toContactName: contact?.name ?? '',
    toContactEmail: contact?.email ?? null,
    operationType: delivery.operationType,
    responsibleUserId: delivery.responsibleUserId,
  };
}

function deliveryDetail(db: MockDb, delivery: MockDelivery): DeliveryDetail {
  const holdsReservation = delivery.status === 'DRAFT' || delivery.status === 'READY';
  const lines: DeliveryLine[] = delivery.lines.map((line) => {
    const product = db.products.find((candidate) => candidate.id === line.productId);
    const row = stockRow(line.productId, delivery.fromLocationId);
    const onHand = row?.onHand ?? 0;
    const reserved = row?.reserved ?? 0;
    const own = holdsReservation ? line.quantity : 0;
    return {
      id: line.id,
      productId: line.productId,
      productName: product?.name ?? 'Unknown product',
      sku: product?.sku ?? '',
      uom: product?.uom ?? '',
      quantity: line.quantity,
      outOfStock: line.quantity > onHand - reserved + own,
    };
  });
  return {
    ...deliverySummary(db, delivery),
    responsibleUserName: 'Demo User',
    validatedAt: delivery.validatedAt,
    createdAt: delivery.createdAt,
    note: delivery.note,
    lines,
  };
}

// ------------------------------------------------------------- validation

interface ReferenceInput {
  fromContactId?: string;
  toContactId?: string;
  toLocationId?: string;
  fromLocationId?: string;
  lines?: Array<{ productId: string }>;
}

function validateReferences(db: MockDb, input: ReferenceInput, kind: 'receipt' | 'delivery'): MockResult<never> | null {
  const contactId = kind === 'receipt' ? input.fromContactId : input.toContactId;
  if (contactId) {
    const contact = store.contacts.find((candidate) => candidate.id === contactId);
    if (!contact) {
      const field = kind === 'receipt' ? 'fromContactId' : 'toContactId';
      return fail(400, 'VALIDATION_ERROR', 'Contact not found', { [field]: 'Contact not found' });
    }
    const expected = kind === 'receipt' ? 'VENDOR' : 'CUSTOMER';
    if (contact.type !== expected) {
      const field = kind === 'receipt' ? 'fromContactId' : 'toContactId';
      const message =
        kind === 'receipt'
          ? 'Receipt supplier must be a VENDOR contact'
          : 'Delivery customer must be a CUSTOMER contact';
      return fail(400, 'VALIDATION_ERROR', message, { [field]: message });
    }
  }

  const locationId = kind === 'receipt' ? input.toLocationId : input.fromLocationId;
  if (locationId && !db.locations.some((candidate) => candidate.id === locationId)) {
    const field = kind === 'receipt' ? 'toLocationId' : 'fromLocationId';
    return fail(400, 'VALIDATION_ERROR', 'Location not found', { [field]: 'Location not found' });
  }

  if (input.lines && input.lines.length > 0) {
    const known = new Set(db.products.map((product) => product.id));
    if (input.lines.some((line) => !known.has(line.productId))) {
      return fail(400, 'VALIDATION_ERROR', 'Unknown product in lines', { lines: 'Unknown product in lines' });
    }
  }

  return null;
}

// --------------------------------------------------------------- receipts

export function mockListReceipts(query: {
  search?: string;
  status?: string;
  warehouseId?: string;
  page: number;
  pageSize: number;
}): Paginated<ReceiptSummary> {
  const db = inventoryDb();
  const search = (query.search ?? '').toLowerCase();
  const filtered = store.receipts
    .filter((receipt) => {
      if (query.status && receipt.status !== query.status) return false;
      if (query.warehouseId && receipt.warehouseId !== query.warehouseId) return false;
      if (!search) return true;
      const contact = store.contacts.find((candidate) => candidate.id === receipt.fromContactId);
      return (
        receipt.reference.toLowerCase().includes(search) ||
        (contact?.name ?? '').toLowerCase().includes(search)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    data: filtered
      .slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
      .map((receipt) => receiptSummary(db, receipt)),
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export function mockGetReceipt(id: string): MockResult<ReceiptDetail> {
  const receipt = store.receipts.find((candidate) => candidate.id === id);
  return receipt ? { ok: true, body: receiptDetail(inventoryDb(), receipt) } : fail(404, 'NOT_FOUND', 'Receipt not found');
}

export function mockCreateReceipt(input: {
  fromContactId: string;
  toLocationId: string;
  scheduleDate: string;
  responsibleUserId?: string;
  lines: Array<{ productId: string; quantity: number }>;
}): MockResult<ReceiptDetail> {
  const db = inventoryDb();
  const invalid = validateReferences(db, input, 'receipt');
  if (invalid) return invalid;

  const location = db.locations.find((candidate) => candidate.id === input.toLocationId)!;
  const receipt: MockReceipt = {
    id: crypto.randomUUID(),
    reference: nextMockReference(location.warehouseId, 'IN'),
    status: 'DRAFT',
    scheduleDate: input.scheduleDate,
    warehouseId: location.warehouseId,
    fromContactId: input.fromContactId,
    toLocationId: input.toLocationId,
    responsibleUserId: input.responsibleUserId ?? RESPONSIBLE_USER,
    validatedAt: null,
    note: null,
    createdAt: new Date().toISOString(),
    lines: input.lines.map((line) => ({ id: crypto.randomUUID(), ...line })),
  };
  store.receipts.push(receipt);
  return { ok: true, status: 201, body: receiptDetail(db, receipt) };
}

export function mockUpdateReceipt(
  id: string,
  input: Partial<{
    fromContactId: string;
    toLocationId: string;
    scheduleDate: string;
    responsibleUserId: string;
    lines: Array<{ productId: string; quantity: number }>;
  }>,
): MockResult<ReceiptDetail> {
  const receipt = store.receipts.find((candidate) => candidate.id === id);
  if (!receipt) return fail(404, 'NOT_FOUND', 'Receipt not found');
  if (receipt.status !== 'DRAFT' && receipt.status !== 'READY') {
    return fail(409, 'CONFLICT', 'Only Draft or Ready receipts can be edited');
  }
  const db = inventoryDb();
  const invalid = validateReferences(db, input, 'receipt');
  if (invalid) return invalid;

  if (input.fromContactId) receipt.fromContactId = input.fromContactId;
  if (input.toLocationId) receipt.toLocationId = input.toLocationId;
  if (input.scheduleDate) receipt.scheduleDate = input.scheduleDate;
  if (input.lines) {
    receipt.lines = input.lines.map((line) => ({ id: crypto.randomUUID(), ...line }));
  }
  return { ok: true, body: receiptDetail(db, receipt) };
}

export function mockConfirmReceipt(id: string): MockResult<ReceiptDetail> {
  const receipt = store.receipts.find((candidate) => candidate.id === id);
  if (!receipt) return fail(404, 'NOT_FOUND', 'Receipt not found');
  if (receipt.status !== 'DRAFT') return fail(409, 'CONFLICT', 'Only Draft receipts can be confirmed');
  receipt.status = 'READY';
  return { ok: true, body: receiptDetail(inventoryDb(), receipt) };
}

export function mockValidateReceipt(id: string): MockResult<ReceiptDetail> {
  const receipt = store.receipts.find((candidate) => candidate.id === id);
  if (!receipt) return fail(404, 'NOT_FOUND', 'Receipt not found');
  if (receipt.status !== 'READY') return fail(409, 'CONFLICT', 'Only Ready receipts can be validated');

  for (const line of receipt.lines) {
    increaseStock(line.productId, receipt.toLocationId, line.quantity);
    pushMockLedger({
      reference: receipt.reference,
      type: 'RECEIPT',
      direction: 'IN',
      productId: line.productId,
      warehouseId: receipt.warehouseId,
      fromLocationId: null,
      toLocationId: receipt.toLocationId,
      contactId: receipt.fromContactId,
      quantity: line.quantity,
    });
  }
  receipt.status = 'DONE';
  receipt.validatedAt = new Date().toISOString();
  recheckWaitingDeliveries(
    receipt.toLocationId,
    receipt.lines.map((line) => line.productId),
  );
  return { ok: true, body: receiptDetail(inventoryDb(), receipt) };
}

export function mockCancelReceipt(id: string): MockResult<ReceiptDetail> {
  const receipt = store.receipts.find((candidate) => candidate.id === id);
  if (!receipt) return fail(404, 'NOT_FOUND', 'Receipt not found');
  if (receipt.status !== 'DRAFT' && receipt.status !== 'READY') {
    return fail(409, 'CONFLICT', 'Only Draft or Ready receipts can be canceled');
  }
  receipt.status = 'CANCELED';
  return { ok: true, body: receiptDetail(inventoryDb(), receipt) };
}

export function mockReceiptPrint(id: string): MockResult<PrintPayload> {
  const receipt = store.receipts.find((candidate) => candidate.id === id);
  if (!receipt) return fail(404, 'NOT_FOUND', 'Receipt not found');
  if (receipt.status !== 'DONE') {
    return fail(409, 'CONFLICT', 'Print is available once the receipt is Done');
  }
  const db = inventoryDb();
  const contact = store.contacts.find((candidate) => candidate.id === receipt.fromContactId);
  const location = db.locations.find((candidate) => candidate.id === receipt.toLocationId);
  return {
    ok: true,
    body: {
      type: 'RECEIPT',
      reference: receipt.reference,
      status: receipt.status,
      date: receipt.scheduleDate,
      contactName: contact?.name ?? null,
      locationName: location?.name ?? '',
      lines: receipt.lines.map((line) => {
        const product = db.products.find((candidate) => candidate.id === line.productId);
        return {
          productName: product?.name ?? 'Unknown product',
          sku: product?.sku ?? '',
          uom: product?.uom ?? '',
          quantity: line.quantity,
        };
      }),
    },
  };
}

// -------------------------------------------------------------- deliveries

export function mockListDeliveries(query: {
  search?: string;
  status?: string;
  warehouseId?: string;
  page: number;
  pageSize: number;
}): Paginated<DeliverySummary> {
  const db = inventoryDb();
  const search = (query.search ?? '').toLowerCase();
  const filtered = store.deliveries
    .filter((delivery) => {
      if (query.status && delivery.status !== query.status) return false;
      if (query.warehouseId && delivery.warehouseId !== query.warehouseId) return false;
      if (!search) return true;
      const contact = store.contacts.find((candidate) => candidate.id === delivery.toContactId);
      return (
        delivery.reference.toLowerCase().includes(search) ||
        (contact?.name ?? '').toLowerCase().includes(search)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    data: filtered
      .slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
      .map((delivery) => deliverySummary(db, delivery)),
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export function mockGetDelivery(id: string): MockResult<DeliveryDetail> {
  const delivery = store.deliveries.find((candidate) => candidate.id === id);
  return delivery
    ? { ok: true, body: deliveryDetail(inventoryDb(), delivery) }
    : fail(404, 'NOT_FOUND', 'Delivery not found');
}

export function mockCreateDelivery(input: {
  fromLocationId: string;
  toContactId: string;
  scheduleDate: string;
  operationType: string;
  responsibleUserId?: string;
  lines: Array<{ productId: string; quantity: number }>;
}): MockResult<DeliveryDetail> {
  const db = inventoryDb();
  const invalid = validateReferences(db, input, 'delivery');
  if (invalid) return invalid;

  const location = db.locations.find((candidate) => candidate.id === input.fromLocationId)!;
  const fits = tryReserveAll(input.fromLocationId, input.lines);
  const delivery: MockDelivery = {
    id: crypto.randomUUID(),
    reference: nextMockReference(location.warehouseId, 'OUT'),
    status: fits ? 'DRAFT' : 'WAITING',
    scheduleDate: input.scheduleDate,
    warehouseId: location.warehouseId,
    fromLocationId: input.fromLocationId,
    toContactId: input.toContactId,
    operationType: input.operationType,
    responsibleUserId: input.responsibleUserId ?? RESPONSIBLE_USER,
    validatedAt: null,
    note: null,
    createdAt: new Date().toISOString(),
    lines: input.lines.map((line) => ({ id: crypto.randomUUID(), ...line })),
  };
  store.deliveries.push(delivery);
  return { ok: true, status: 201, body: deliveryDetail(db, delivery) };
}

export function mockUpdateDelivery(
  id: string,
  input: Partial<{
    fromLocationId: string;
    toContactId: string;
    scheduleDate: string;
    operationType: string;
    responsibleUserId: string;
    lines: Array<{ productId: string; quantity: number }>;
  }>,
): MockResult<DeliveryDetail> {
  const delivery = store.deliveries.find((candidate) => candidate.id === id);
  if (!delivery) return fail(404, 'NOT_FOUND', 'Delivery not found');
  if (delivery.status === 'DONE' || delivery.status === 'CANCELED') {
    return fail(409, 'CONFLICT', 'Done or canceled deliveries cannot be edited');
  }
  const db = inventoryDb();
  const invalid = validateReferences(db, input, 'delivery');
  if (invalid) return invalid;

  const holdsReservation = delivery.status !== 'WAITING';
  if (holdsReservation) releaseAll(delivery.fromLocationId, delivery.lines);

  const nextLocationId = input.fromLocationId ?? delivery.fromLocationId;
  const nextLines = input.lines ?? delivery.lines;
  const fits = tryReserveAll(nextLocationId, nextLines);

  if (input.fromLocationId) delivery.fromLocationId = input.fromLocationId;
  if (input.toContactId) delivery.toContactId = input.toContactId;
  if (input.scheduleDate) delivery.scheduleDate = input.scheduleDate;
  if (input.operationType) delivery.operationType = input.operationType;
  if (input.lines) delivery.lines = input.lines.map((line) => ({ id: crypto.randomUUID(), ...line }));
  delivery.status = fits ? (delivery.status === 'DRAFT' ? 'DRAFT' : 'READY') : 'WAITING';

  return { ok: true, body: deliveryDetail(db, delivery) };
}

export function mockValidateDelivery(id: string): MockResult<DeliveryDetail> {
  const delivery = store.deliveries.find((candidate) => candidate.id === id);
  if (!delivery) return fail(404, 'NOT_FOUND', 'Delivery not found');

  if (delivery.status === 'DRAFT') {
    delivery.status = 'READY';
    return { ok: true, body: deliveryDetail(inventoryDb(), delivery) };
  }
  if (delivery.status === 'WAITING') {
    return fail(409, 'CONFLICT', 'Delivery is waiting for stock to become available');
  }
  if (delivery.status !== 'READY') {
    return fail(409, 'CONFLICT', 'Only Draft or Ready deliveries can be validated');
  }

  for (const line of delivery.lines) {
    decreaseStock(line.productId, delivery.fromLocationId, line.quantity);
    pushMockLedger({
      reference: delivery.reference,
      type: 'DELIVERY',
      direction: 'OUT',
      productId: line.productId,
      warehouseId: delivery.warehouseId,
      fromLocationId: delivery.fromLocationId,
      toLocationId: null,
      contactId: delivery.toContactId,
      quantity: line.quantity,
    });
  }
  for (const [productId, quantity] of aggregate(delivery.lines)) {
    releaseStock(productId, delivery.fromLocationId, quantity);
  }
  delivery.status = 'DONE';
  delivery.validatedAt = new Date().toISOString();
  return { ok: true, body: deliveryDetail(inventoryDb(), delivery) };
}

export function mockCancelDelivery(id: string): MockResult<DeliveryDetail> {
  const delivery = store.deliveries.find((candidate) => candidate.id === id);
  if (!delivery) return fail(404, 'NOT_FOUND', 'Delivery not found');
  if (delivery.status === 'DONE' || delivery.status === 'CANCELED') {
    return fail(409, 'CONFLICT', 'Only Draft, Waiting or Ready deliveries can be canceled');
  }
  if (delivery.status !== 'WAITING') releaseAll(delivery.fromLocationId, delivery.lines);
  delivery.status = 'CANCELED';
  return { ok: true, body: deliveryDetail(inventoryDb(), delivery) };
}

export function mockDeliveryPrint(id: string): MockResult<PrintPayload> {
  const delivery = store.deliveries.find((candidate) => candidate.id === id);
  if (!delivery) return fail(404, 'NOT_FOUND', 'Delivery not found');
  if (delivery.status !== 'DONE') {
    return fail(409, 'CONFLICT', 'Print is available once the delivery is Done');
  }
  const db = inventoryDb();
  const contact = store.contacts.find((candidate) => candidate.id === delivery.toContactId);
  const location = db.locations.find((candidate) => candidate.id === delivery.fromLocationId);
  return {
    ok: true,
    body: {
      type: 'DELIVERY',
      reference: delivery.reference,
      status: delivery.status,
      date: delivery.scheduleDate,
      contactName: contact?.name ?? null,
      locationName: location?.name ?? '',
      lines: delivery.lines.map((line) => {
        const product = db.products.find((candidate) => candidate.id === line.productId);
        return {
          productName: product?.name ?? 'Unknown product',
          sku: product?.sku ?? '',
          uom: product?.uom ?? '',
          quantity: line.quantity,
        };
      }),
    },
  };
}

// ---------------------------------------------------------------- contacts

export function mockListContacts(type?: string, search?: string): ContactSummary[] {
  const term = (search ?? '').toLowerCase();
  return store.contacts
    .filter((contact) => {
      if (type && contact.type !== type) return false;
      if (!term) return true;
      return contact.name.toLowerCase().includes(term) || (contact.email ?? '').toLowerCase().includes(term);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function mockCreateContact(input: {
  name: string;
  type: 'VENDOR' | 'CUSTOMER';
  email: string | null;
  phone: string | null;
}): ContactSummary {
  const contact: MockContact = { id: crypto.randomUUID(), ...input };
  store.contacts.push(contact);
  return contact;
}

// ---------------------------------------------------------------- transfers

function transferSummary(db: MockDb, transfer: MockTransfer): TransferSummary {
  return {
    id: transfer.id,
    reference: transfer.reference,
    status: transfer.status,
    scheduleDate: transfer.scheduleDate,
    warehouseId: transfer.warehouseId,
    fromLocationId: transfer.fromLocationId,
    fromLocationName: db.locations.find((location) => location.id === transfer.fromLocationId)?.name ?? '',
    toLocationId: transfer.toLocationId,
    toLocationName: db.locations.find((location) => location.id === transfer.toLocationId)?.name ?? '',
    responsibleUserId: transfer.responsibleUserId,
  };
}

function transferDetail(db: MockDb, transfer: MockTransfer): TransferDetail {
  return {
    ...transferSummary(db, transfer),
    responsibleUserName: 'Demo User',
    validatedAt: transfer.validatedAt,
    createdAt: transfer.createdAt,
    note: transfer.note,
    lines: transfer.lines.map((line) => {
      const product = db.products.find((candidate) => candidate.id === line.productId);
      return {
        id: line.id,
        productId: line.productId,
        productName: product?.name ?? 'Unknown product',
        sku: product?.sku ?? '',
        uom: product?.uom ?? '',
        quantity: line.quantity,
      };
    }),
  };
}

function validateTransferInput(
  db: MockDb,
  input: { fromLocationId?: string; toLocationId?: string; lines?: Array<{ productId: string }> },
): MockResult<never> | null {
  if (input.fromLocationId && !db.locations.some((location) => location.id === input.fromLocationId)) {
    return fail(400, 'VALIDATION_ERROR', 'Source location not found', {
      fromLocationId: 'Source location not found',
    });
  }
  if (input.toLocationId && !db.locations.some((location) => location.id === input.toLocationId)) {
    return fail(400, 'VALIDATION_ERROR', 'Destination location not found', {
      toLocationId: 'Destination location not found',
    });
  }
  if (input.lines && input.lines.length > 0) {
    const known = new Set(db.products.map((product) => product.id));
    if (input.lines.some((line) => !known.has(line.productId))) {
      return fail(400, 'VALIDATION_ERROR', 'Unknown product in lines', { lines: 'Unknown product in lines' });
    }
  }
  return null;
}

export function mockListTransfers(query: {
  search?: string;
  status?: string;
  warehouseId?: string;
  page: number;
  pageSize: number;
}): Paginated<TransferSummary> {
  const db = inventoryDb();
  const search = (query.search ?? '').toLowerCase();
  const filtered = store.transfers
    .filter((transfer) => {
      if (query.status && transfer.status !== query.status) return false;
      if (query.warehouseId && transfer.warehouseId !== query.warehouseId) return false;
      if (!search) return true;
      const from = db.locations.find((location) => location.id === transfer.fromLocationId)?.name ?? '';
      const to = db.locations.find((location) => location.id === transfer.toLocationId)?.name ?? '';
      return (
        transfer.reference.toLowerCase().includes(search) ||
        from.toLowerCase().includes(search) ||
        to.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    data: filtered
      .slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
      .map((transfer) => transferSummary(db, transfer)),
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export function mockGetTransfer(id: string): MockResult<TransferDetail> {
  const transfer = store.transfers.find((candidate) => candidate.id === id);
  return transfer
    ? { ok: true, body: transferDetail(inventoryDb(), transfer) }
    : fail(404, 'NOT_FOUND', 'Transfer not found');
}

export function mockCreateTransfer(input: {
  fromLocationId: string;
  toLocationId: string;
  scheduleDate: string;
  responsibleUserId?: string;
  lines: Array<{ productId: string; quantity: number }>;
}): MockResult<TransferDetail> {
  const db = inventoryDb();
  const invalid = validateTransferInput(db, input);
  if (invalid) return invalid;
  if (input.fromLocationId === input.toLocationId) {
    return fail(400, 'VALIDATION_ERROR', 'Source and destination locations must differ', {
      toLocationId: 'Source and destination locations must differ',
    });
  }

  const fromLocation = db.locations.find((location) => location.id === input.fromLocationId)!;
  const transfer: MockTransfer = {
    id: crypto.randomUUID(),
    reference: nextMockReference(fromLocation.warehouseId, 'INT'),
    status: 'DRAFT',
    scheduleDate: input.scheduleDate,
    warehouseId: fromLocation.warehouseId,
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    responsibleUserId: input.responsibleUserId ?? RESPONSIBLE_USER,
    validatedAt: null,
    note: null,
    createdAt: new Date().toISOString(),
    lines: input.lines.map((line) => ({ id: crypto.randomUUID(), ...line })),
  };
  store.transfers.push(transfer);
  return { ok: true, status: 201, body: transferDetail(db, transfer) };
}

export function mockUpdateTransfer(
  id: string,
  input: Partial<{
    fromLocationId: string;
    toLocationId: string;
    scheduleDate: string;
    responsibleUserId: string;
    lines: Array<{ productId: string; quantity: number }>;
  }>,
): MockResult<TransferDetail> {
  const transfer = store.transfers.find((candidate) => candidate.id === id);
  if (!transfer) return fail(404, 'NOT_FOUND', 'Transfer not found');
  if (transfer.status !== 'DRAFT' && transfer.status !== 'READY') {
    return fail(409, 'CONFLICT', 'Only Draft or Ready transfers can be edited');
  }
  const db = inventoryDb();
  const invalid = validateTransferInput(db, input);
  if (invalid) return invalid;

  const nextFrom = input.fromLocationId ?? transfer.fromLocationId;
  const nextTo = input.toLocationId ?? transfer.toLocationId;
  if (nextFrom === nextTo) {
    return fail(400, 'VALIDATION_ERROR', 'Source and destination locations must differ', {
      toLocationId: 'Source and destination locations must differ',
    });
  }

  if (transfer.status === 'READY') {
    releaseAll(transfer.fromLocationId, transfer.lines);
    const fits = tryReserveAll(nextFrom, input.lines ?? transfer.lines);
    if (!fits) {
      // restore the previous reservation so the READY document stays consistent
      tryReserveAll(transfer.fromLocationId, transfer.lines);
      return fail(409, 'CONFLICT', 'Insufficient free-to-use stock for the updated transfer lines');
    }
  }

  if (input.fromLocationId) transfer.fromLocationId = input.fromLocationId;
  if (input.toLocationId) transfer.toLocationId = input.toLocationId;
  if (input.scheduleDate) transfer.scheduleDate = input.scheduleDate;
  if (input.lines) transfer.lines = input.lines.map((line) => ({ id: crypto.randomUUID(), ...line }));

  return { ok: true, body: transferDetail(db, transfer) };
}

export function mockConfirmTransfer(id: string): MockResult<TransferDetail> {
  const transfer = store.transfers.find((candidate) => candidate.id === id);
  if (!transfer) return fail(404, 'NOT_FOUND', 'Transfer not found');
  if (transfer.status !== 'DRAFT') return fail(409, 'CONFLICT', 'Only Draft transfers can be confirmed');

  const fits = tryReserveAll(transfer.fromLocationId, transfer.lines);
  if (!fits) return fail(409, 'CONFLICT', 'Insufficient free-to-use stock to confirm this transfer');

  transfer.status = 'READY';
  return { ok: true, body: transferDetail(inventoryDb(), transfer) };
}

export function mockValidateTransfer(id: string): MockResult<TransferDetail> {
  const transfer = store.transfers.find((candidate) => candidate.id === id);
  if (!transfer) return fail(404, 'NOT_FOUND', 'Transfer not found');
  if (transfer.status !== 'READY') return fail(409, 'CONFLICT', 'Only Ready transfers can be validated');

  releaseAll(transfer.fromLocationId, transfer.lines);
  for (const line of transfer.lines) {
    decreaseStock(line.productId, transfer.fromLocationId, line.quantity);
    increaseStock(line.productId, transfer.toLocationId, line.quantity);
    const base = {
      reference: transfer.reference,
      type: 'TRANSFER' as const,
      productId: line.productId,
      warehouseId: transfer.warehouseId,
      fromLocationId: transfer.fromLocationId,
      toLocationId: transfer.toLocationId,
      contactId: null,
      quantity: line.quantity,
    };
    pushMockLedger({ ...base, direction: 'OUT' });
    pushMockLedger({ ...base, direction: 'IN' });
  }
  transfer.status = 'DONE';
  transfer.validatedAt = new Date().toISOString();
  return { ok: true, body: transferDetail(inventoryDb(), transfer) };
}

export function mockCancelTransfer(id: string): MockResult<TransferDetail> {
  const transfer = store.transfers.find((candidate) => candidate.id === id);
  if (!transfer) return fail(404, 'NOT_FOUND', 'Transfer not found');
  if (transfer.status !== 'DRAFT' && transfer.status !== 'READY') {
    return fail(409, 'CONFLICT', 'Only Draft or Ready transfers can be canceled');
  }
  if (transfer.status === 'READY') releaseAll(transfer.fromLocationId, transfer.lines);
  transfer.status = 'CANCELED';
  return { ok: true, body: transferDetail(inventoryDb(), transfer) };
}

// --------------------------------------------------------------- adjustments

function adjustmentSummary(db: MockDb, adjustment: MockAdjustment): AdjustmentSummary {
  const product = db.products.find((candidate) => candidate.id === adjustment.productId);
  const location = db.locations.find((candidate) => candidate.id === adjustment.locationId);
  return {
    id: adjustment.id,
    reference: adjustment.reference,
    status: 'DONE',
    scheduleDate: adjustment.movedAt.slice(0, 10),
    movedAt: adjustment.movedAt,
    productId: adjustment.productId,
    productName: product?.name ?? 'Unknown product',
    sku: product?.sku ?? null,
    locationId: adjustment.locationId,
    locationName: location?.name ?? '',
    recordedQuantity: adjustment.recordedQuantity,
    countedQuantity: adjustment.countedQuantity,
    delta: adjustment.delta,
    note: adjustment.note,
  };
}

export function mockListAdjustments(query: {
  search?: string;
  status?: string;
  warehouseId?: string;
  productId?: string;
  locationId?: string;
  page: number;
  pageSize: number;
}): Paginated<AdjustmentSummary> {
  const db = inventoryDb();
  const search = (query.search ?? '').toLowerCase();
  const filtered = store.adjustments
    .filter((adjustment) => {
      if (query.status && query.status !== 'DONE') return false;
      if (query.warehouseId && adjustment.warehouseId !== query.warehouseId) return false;
      if (query.productId && adjustment.productId !== query.productId) return false;
      if (query.locationId && adjustment.locationId !== query.locationId) return false;
      if (!search) return true;
      const product = db.products.find((candidate) => candidate.id === adjustment.productId);
      return (
        adjustment.reference.toLowerCase().includes(search) ||
        (product?.name ?? '').toLowerCase().includes(search) ||
        (product?.sku ?? '').toLowerCase().includes(search)
      );
    })
    .sort((a, b) => b.movedAt.localeCompare(a.movedAt));

  return {
    data: filtered
      .slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
      .map((adjustment) => adjustmentSummary(db, adjustment)),
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export function mockGetAdjustment(id: string): MockResult<AdjustmentSummary> {
  const adjustment = store.adjustments.find((candidate) => candidate.id === id);
  return adjustment
    ? { ok: true, body: adjustmentSummary(inventoryDb(), adjustment) }
    : fail(404, 'NOT_FOUND', 'Adjustment not found');
}

export function mockCreateAdjustment(input: {
  productId: string;
  locationId: string;
  countedQuantity: number;
  note?: string;
}): MockResult<AdjustmentSummary> {
  const db = inventoryDb();
  const product = db.products.find((candidate) => candidate.id === input.productId);
  if (!product) return fail(400, 'VALIDATION_ERROR', 'Product not found', { productId: 'Product not found' });
  const location = db.locations.find((candidate) => candidate.id === input.locationId);
  if (!location) return fail(400, 'VALIDATION_ERROR', 'Location not found', { locationId: 'Location not found' });

  let row = stockRow(input.productId, input.locationId);
  const recorded = row?.onHand ?? 0;
  const reserved = row?.reserved ?? 0;

  if (input.countedQuantity < reserved) {
    return fail(
      409,
      'CONFLICT',
      `Cannot set on-hand below the reserved quantity (${reserved}) for open deliveries`,
    );
  }

  if (!row) {
    row = { productId: input.productId, locationId: input.locationId, onHand: 0, reserved: 0 };
    db.stock.push(row);
  }
  row.onHand = input.countedQuantity;

  const delta = Math.round((input.countedQuantity - recorded) * 1000) / 1000;
  const reference = nextMockReference(location.warehouseId, 'ADJ');
  if (delta !== 0) {
    pushMockLedger({
      reference,
      type: 'ADJUSTMENT',
      direction: delta > 0 ? 'IN' : 'OUT',
      productId: input.productId,
      warehouseId: location.warehouseId,
      fromLocationId: delta < 0 ? input.locationId : null,
      toLocationId: delta > 0 ? input.locationId : null,
      contactId: null,
      quantity: Math.abs(delta),
    });
  }

  const adjustment: MockAdjustment = {
    id: crypto.randomUUID(),
    reference,
    status: 'DONE',
    movedAt: new Date().toISOString(),
    warehouseId: location.warehouseId,
    productId: input.productId,
    locationId: input.locationId,
    recordedQuantity: recorded,
    countedQuantity: input.countedQuantity,
    delta,
    note: input.note ?? null,
  };
  store.adjustments.push(adjustment);
  recheckWaitingDeliveries(input.locationId, [input.productId]);

  return { ok: true, status: 201, body: adjustmentSummary(db, adjustment) };
}

// -------------------------------------------------------------- move history

export function mockMoveHistory(query: {
  search?: string;
  type?: string;
  direction?: string;
  status?: string;
  productId?: string;
  warehouseId?: string;
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}): Paginated<MoveHistoryRow> {
  const db = inventoryDb();
  const search = (query.search ?? '').toLowerCase();

  const filtered = db.ledger
    .filter((row) => {
      if (query.type && row.type !== query.type) return false;
      if (query.direction && row.direction !== query.direction) return false;
      if (query.status && query.status !== 'DONE') return false;
      if (query.productId && row.productId !== query.productId) return false;
      if (query.warehouseId && row.warehouseId !== query.warehouseId) return false;
      if (query.locationId && row.fromLocationId !== query.locationId && row.toLocationId !== query.locationId) {
        return false;
      }
      const date = row.movedAt.slice(0, 10);
      if (query.dateFrom && date < query.dateFrom) return false;
      if (query.dateTo && date > query.dateTo) return false;
      if (!search) return true;
      const product = db.products.find((candidate) => candidate.id === row.productId);
      const contact = store.contacts.find((candidate) => candidate.id === row.contactId);
      return (
        row.reference.toLowerCase().includes(search) ||
        (product?.name ?? '').toLowerCase().includes(search) ||
        (product?.sku ?? '').toLowerCase().includes(search) ||
        (contact?.name ?? '').toLowerCase().includes(search)
      );
    })
    .sort((a, b) => b.movedAt.localeCompare(a.movedAt));

  const data = filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map((row) => {
    const product = db.products.find((candidate) => candidate.id === row.productId);
    const contact = store.contacts.find((candidate) => candidate.id === row.contactId);
    const fromLocation = db.locations.find((candidate) => candidate.id === row.fromLocationId);
    const toLocation = db.locations.find((candidate) => candidate.id === row.toLocationId);

    let from = '—';
    let to = '—';
    if (row.type === 'RECEIPT') {
      from = contact?.name ?? 'Vendor';
      to = toLocation?.name ?? '—';
    } else if (row.type === 'DELIVERY') {
      from = fromLocation?.name ?? '—';
      to = contact?.name ?? 'Customer';
    } else if (row.type === 'TRANSFER') {
      from = fromLocation?.name ?? '—';
      to = toLocation?.name ?? '—';
    } else {
      const location = fromLocation?.name ?? toLocation?.name ?? '—';
      from = row.direction === 'IN' ? 'Inventory adjustment' : location;
      to = row.direction === 'IN' ? location : 'Inventory adjustment';
    }

    return {
      id: row.id,
      reference: row.reference,
      date: row.movedAt.slice(0, 10),
      movedAt: row.movedAt,
      contactName: contact?.name ?? null,
      from,
      to,
      productId: row.productId,
      productName: product?.name ?? 'Unknown product',
      sku: product?.sku ?? '',
      quantity: row.quantity,
      direction: row.direction,
      status: 'DONE' as const,
      type: row.type,
    };
  });

  return { data, total: filtered.length, page: query.page, pageSize: query.pageSize };
}
