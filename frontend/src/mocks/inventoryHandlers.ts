import { http, HttpResponse } from 'msw';
import {
  categoryCreateSchema,
  collectFieldErrors,
  dashboardQuerySchema,
  locationCreateSchema,
  locationUpdateSchema,
  productCreateSchema,
  productUpdateSchema,
  stockUpdateSchema,
  summarizeDashboard,
  warehouseCreateSchema,
  warehouseUpdateSchema,
  type ProductSummary,
  type StockRow,
} from '@stocksense/shared';
import { notFound, requireMockAuth, validationError } from './http';
import {
  inventoryDb,
  nextMockReference,
  type MockDb,
  type MockProduct,
  type MockStock,
} from './fixtures/inventory';

const API = '*/api/v1';

function toProductSummary(db: MockDb, product: MockProduct): ProductSummary {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    categoryId: product.categoryId,
    categoryName: db.categories.find((category) => category.id === product.categoryId)?.name ?? null,
    uom: product.uom,
    costPerUnit: product.costPerUnit,
    reorderMin: product.reorderMin,
    reorderMax: product.reorderMax,
  };
}

function productTotalOnHand(db: MockDb, productId: string): number {
  return db.stock
    .filter((row) => row.productId === productId)
    .reduce((sum, row) => sum + row.onHand, 0);
}

function toStockRow(db: MockDb, row: MockStock): StockRow {
  const product = db.products.find((candidate) => candidate.id === row.productId);
  const total = productTotalOnHand(db, row.productId);
  const reorderMin = product?.reorderMin ?? null;
  return {
    productId: row.productId,
    productName: product?.name ?? 'Unknown product',
    sku: product?.sku ?? '',
    costPerUnit: product?.costPerUnit ?? null,
    locationId: row.locationId,
    onHand: row.onHand,
    reserved: row.reserved,
    freeToUse: row.onHand - row.reserved,
    reorderMin,
    lowStock: reorderMin != null && total <= reorderMin,
    outOfStock: total <= 0,
  };
}

function pageParams(url: URL): { page: number; pageSize: number } {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.max(1, Number(url.searchParams.get('pageSize') ?? '20') || 20);
  return { page, pageSize };
}

/** §2–§5 mocks — behavior mirrors the live backend services. */
export const inventoryHandlers = [
  // ---------------------------------------------------------------- products
  http.get(`${API}/products`, ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;

    const url = new URL(request.url);
    const db = inventoryDb();
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
    const categoryId = url.searchParams.get('categoryId') ?? '';
    const { page, pageSize } = pageParams(url);

    const filtered = db.products
      .filter(
        (product) =>
          (!categoryId || product.categoryId === categoryId) &&
          (!search ||
            product.name.toLowerCase().includes(search) ||
            product.sku.toLowerCase().includes(search)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    const data = filtered.slice((page - 1) * pageSize, page * pageSize).map((p) => toProductSummary(db, p));
    return HttpResponse.json({ data, total: filtered.length, page, pageSize });
  }),

  http.post(`${API}/products`, async ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const parsed = productCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    const input = parsed.data;

    const db = inventoryDb();
    if (input.categoryId && !db.categories.some((category) => category.id === input.categoryId)) {
      return validationError({ categoryId: 'Category not found' });
    }
    if (db.products.some((product) => product.sku.toLowerCase() === input.sku.toLowerCase())) {
      return validationError({ sku: 'SKU already in use' });
    }

    const product: MockProduct = {
      id: crypto.randomUUID(),
      name: input.name,
      sku: input.sku,
      categoryId: input.categoryId ?? null,
      uom: input.uom,
      costPerUnit: input.costPerUnit ?? null,
      reorderMin: input.reorderMin ?? null,
      reorderMax: input.reorderMax ?? null,
    };
    db.products.push(product);

    if (input.initialStock) {
      const location = db.locations.find((candidate) => candidate.id === input.initialStock!.locationId);
      if (!location) return validationError({ locationId: 'Location not found' });

      const quantity = input.initialStock.quantity;
      const existing = db.stock.find(
        (row) => row.productId === product.id && row.locationId === location.id,
      );
      if (existing) existing.onHand += quantity;
      else db.stock.push({ productId: product.id, locationId: location.id, onHand: quantity, reserved: 0 });

      db.moves.push({
        id: crypto.randomUUID(),
        reference: nextMockReference(location.warehouseId, 'ADJ'),
        type: 'ADJUSTMENT',
        status: 'DONE',
        scheduleDate: new Date().toISOString().slice(0, 10),
        warehouseId: location.warehouseId,
        fromLocationId: null,
        toLocationId: location.id,
        lines: [{ productId: product.id, quantity }],
      });
    }

    return HttpResponse.json(toProductSummary(db, product), { status: 201 });
  }),

  http.patch(`${API}/products/:id`, async ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const parsed = productUpdateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));

    const db = inventoryDb();
    const product = db.products.find((candidate) => candidate.id === params.id);
    if (!product) return notFound('Product not found');

    if (parsed.data.categoryId && !db.categories.some((c) => c.id === parsed.data.categoryId)) {
      return validationError({ categoryId: 'Category not found' });
    }
    if (
      parsed.data.sku &&
      db.products.some(
        (candidate) =>
          candidate.id !== product.id && candidate.sku.toLowerCase() === parsed.data.sku!.toLowerCase(),
      )
    ) {
      return validationError({ sku: 'SKU already in use' });
    }

    Object.assign(product, {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.sku !== undefined ? { sku: parsed.data.sku } : {}),
      ...(parsed.data.categoryId !== undefined ? { categoryId: parsed.data.categoryId ?? null } : {}),
      ...(parsed.data.uom !== undefined ? { uom: parsed.data.uom } : {}),
      ...(parsed.data.costPerUnit !== undefined ? { costPerUnit: parsed.data.costPerUnit ?? null } : {}),
      ...(parsed.data.reorderMin !== undefined ? { reorderMin: parsed.data.reorderMin ?? null } : {}),
      ...(parsed.data.reorderMax !== undefined ? { reorderMax: parsed.data.reorderMax ?? null } : {}),
    });

    return HttpResponse.json(toProductSummary(db, product));
  }),

  // -------------------------------------------------------------- categories
  http.get(`${API}/categories`, ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return HttpResponse.json([...inventoryDb().categories].sort((a, b) => a.name.localeCompare(b.name)));
  }),

  http.post(`${API}/categories`, async ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const parsed = categoryCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));

    const db = inventoryDb();
    if (db.categories.some((category) => category.name === parsed.data.name)) {
      return validationError({ name: 'Category already exists' });
    }
    const category = { id: crypto.randomUUID(), name: parsed.data.name };
    db.categories.push(category);
    return HttpResponse.json(category, { status: 201 });
  }),

  // -------------------------------------------------------------- warehouses
  http.get(`${API}/warehouses`, ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;
    return HttpResponse.json([...inventoryDb().warehouses].sort((a, b) => a.name.localeCompare(b.name)));
  }),

  http.post(`${API}/warehouses`, async ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const parsed = warehouseCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));

    const db = inventoryDb();
    if (db.warehouses.some((warehouse) => warehouse.shortCode === parsed.data.shortCode)) {
      return validationError({ shortCode: 'Short Code already in use' });
    }
    const warehouse = {
      id: crypto.randomUUID(),
      name: parsed.data.name,
      shortCode: parsed.data.shortCode,
      address: parsed.data.address ?? null,
    };
    db.warehouses.push(warehouse);
    return HttpResponse.json(warehouse, { status: 201 });
  }),

  http.patch(`${API}/warehouses/:id`, async ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const parsed = warehouseUpdateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));

    const db = inventoryDb();
    const warehouse = db.warehouses.find((candidate) => candidate.id === params.id);
    if (!warehouse) return notFound('Warehouse not found');

    if (
      parsed.data.shortCode &&
      db.warehouses.some(
        (candidate) =>
          candidate.id !== warehouse.id && candidate.shortCode === parsed.data.shortCode,
      )
    ) {
      return validationError({ shortCode: 'Short Code already in use' });
    }

    Object.assign(warehouse, {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.shortCode !== undefined ? { shortCode: parsed.data.shortCode } : {}),
      ...(parsed.data.address !== undefined ? { address: parsed.data.address ?? null } : {}),
    });
    return HttpResponse.json(warehouse);
  }),

  // --------------------------------------------------------------- locations
  http.get(`${API}/locations`, ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;

    const url = new URL(request.url);
    const warehouseId = url.searchParams.get('warehouseId') ?? '';
    const db = inventoryDb();
    const locations = db.locations
      .filter((location) => !warehouseId || location.warehouseId === warehouseId)
      .sort((a, b) => a.name.localeCompare(b.name));
    return HttpResponse.json(locations);
  }),

  http.post(`${API}/locations`, async ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const parsed = locationCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));

    const db = inventoryDb();
    if (!db.warehouses.some((warehouse) => warehouse.id === parsed.data.warehouseId)) {
      return validationError({ warehouseId: 'Warehouse not found' });
    }
    if (
      db.locations.some(
        (location) =>
          location.warehouseId === parsed.data.warehouseId &&
          location.shortCode === parsed.data.shortCode,
      )
    ) {
      return validationError({ shortCode: 'Short Code already in use in this warehouse' });
    }

    const location = {
      id: crypto.randomUUID(),
      warehouseId: parsed.data.warehouseId,
      name: parsed.data.name,
      shortCode: parsed.data.shortCode,
    };
    db.locations.push(location);
    return HttpResponse.json(location, { status: 201 });
  }),

  http.patch(`${API}/locations/:id`, async ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const parsed = locationUpdateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));

    const db = inventoryDb();
    const location = db.locations.find((candidate) => candidate.id === params.id);
    if (!location) return notFound('Location not found');

    if (
      parsed.data.shortCode &&
      db.locations.some(
        (candidate) =>
          candidate.id !== location.id &&
          candidate.warehouseId === location.warehouseId &&
          candidate.shortCode === parsed.data.shortCode,
      )
    ) {
      return validationError({ shortCode: 'Short Code already in use in this warehouse' });
    }

    Object.assign(location, {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.shortCode !== undefined ? { shortCode: parsed.data.shortCode } : {}),
    });
    return HttpResponse.json(location);
  }),

  // ------------------------------------------------------------------- stock
  http.get(`${API}/stock`, ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;

    const url = new URL(request.url);
    const db = inventoryDb();
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
    const locationId = url.searchParams.get('locationId') ?? '';
    const warehouseId = url.searchParams.get('warehouseId') ?? '';
    const { page, pageSize } = pageParams(url);

    const filtered = db.stock
      .filter((row) => {
        const product = db.products.find((candidate) => candidate.id === row.productId);
        const location = db.locations.find((candidate) => candidate.id === row.locationId);
        if (!product || !location) return false;
        if (locationId && row.locationId !== locationId) return false;
        if (warehouseId && location.warehouseId !== warehouseId) return false;
        if (
          search &&
          !product.name.toLowerCase().includes(search) &&
          !product.sku.toLowerCase().includes(search)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const nameA = db.products.find((p) => p.id === a.productId)?.name ?? '';
        const nameB = db.products.find((p) => p.id === b.productId)?.name ?? '';
        return nameA.localeCompare(nameB);
      });

    const data = filtered.slice((page - 1) * pageSize, page * pageSize).map((row) => toStockRow(db, row));
    return HttpResponse.json({ data, total: filtered.length, page, pageSize });
  }),

  http.patch(`${API}/stock/:productId/:locationId`, async ({ request, params }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const parsed = stockUpdateSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));

    const db = inventoryDb();
    const product = db.products.find((candidate) => candidate.id === params.productId);
    if (!product) return notFound('Product not found');
    const location = db.locations.find((candidate) => candidate.id === params.locationId);
    if (!location) return notFound('Location not found');

    let row = db.stock.find(
      (candidate) => candidate.productId === product.id && candidate.locationId === location.id,
    );
    if (!row) {
      row = { productId: product.id, locationId: location.id, onHand: 0, reserved: 0 };
      db.stock.push(row);
    }

    const delta = parsed.data.onHand - row.onHand;
    if (delta !== 0) {
      db.moves.push({
        id: crypto.randomUUID(),
        reference: nextMockReference(location.warehouseId, 'ADJ'),
        type: 'ADJUSTMENT',
        status: 'DONE',
        scheduleDate: new Date().toISOString().slice(0, 10),
        warehouseId: location.warehouseId,
        fromLocationId: delta < 0 ? location.id : null,
        toLocationId: delta > 0 ? location.id : null,
        lines: [{ productId: product.id, quantity: Math.abs(delta) }],
      });
    }
    row.onHand = parsed.data.onHand;
    return HttpResponse.json(toStockRow(db, row));
  }),

  // --------------------------------------------------------------- dashboard
  http.get(`${API}/dashboard/kpis`, ({ request }) => {
    const denied = requireMockAuth(request);
    if (denied) return denied;

    const url = new URL(request.url);
    const parsed = dashboardQuerySchema.safeParse({
      warehouseId: url.searchParams.get('warehouseId') ?? undefined,
      locationId: url.searchParams.get('locationId') ?? undefined,
      categoryId: url.searchParams.get('categoryId') ?? undefined,
      type: url.searchParams.get('type') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
    });
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));
    const { warehouseId, locationId, categoryId, type, status } = parsed.data;

    const db = inventoryDb();
    const productById = new Map(db.products.map((product) => [product.id, product]));

    const moves = db.moves.filter((move) => {
      if (warehouseId && move.warehouseId !== warehouseId) return false;
      if (locationId && move.fromLocationId !== locationId && move.toLocationId !== locationId) return false;
      if (
        categoryId &&
        !move.lines.some((line) => productById.get(line.productId)?.categoryId === categoryId)
      ) {
        return false;
      }
      return true;
    });

    const stock = db.stock.filter((row) => {
      const location = db.locations.find((candidate) => candidate.id === row.locationId);
      const product = productById.get(row.productId);
      if (!location || !product) return false;
      if (locationId && row.locationId !== locationId) return false;
      if (warehouseId && location.warehouseId !== warehouseId) return false;
      if (categoryId && product.categoryId !== categoryId) return false;
      return true;
    });

    return HttpResponse.json(
      summarizeDashboard({
        moves: moves.map((move) => ({
          type: move.type,
          status: move.status,
          scheduleDate: move.scheduleDate,
        })),
        stock: stock.map((row) => ({
          productId: row.productId,
          onHand: row.onHand,
          reorderMin: productById.get(row.productId)?.reorderMin ?? null,
        })),
        today: new Date().toISOString().slice(0, 10),
        type,
        status,
      }),
    );
  }),
];
