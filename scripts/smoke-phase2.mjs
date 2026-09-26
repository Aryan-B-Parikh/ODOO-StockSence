#!/usr/bin/env node
/**
 * Phase 2 smoke test (Person 4) — Products + Stock + Warehouse + Locations + Dashboard.
 *
 * Exercises the live API chain end-to-end:
 *   signup/login → category → warehouse → location → product with initial stock
 *   → product search → stock list (flags) → manual stock edit → dashboard KPIs + filters.
 *
 * Creates a small amount of demo data (no DELETE endpoints exist by contract).
 *
 * Usage:
 *   node scripts/smoke-phase2.mjs
 *   SMOKE_BASE_URL=http://localhost:4000/api/v1 node scripts/smoke-phase2.mjs
 */
const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000/api/v1';

const suffix = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
const loginId = `s2${suffix}`;
const email = `${loginId}@example.com`;
const password = 'Abcdefg1!';

let failures = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  PASS  ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${message}`);
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  return { status: response.status, body: payload };
}

async function main() {
  console.log(`Phase 2 smoke test against ${BASE_URL}`);

  await request('/auth/signup', {
    method: 'POST',
    body: { loginId, email, password, confirmPassword: password },
  });
  const login = await request('/auth/login', { method: 'POST', body: { loginId, password } });
  check(login.status === 200 && login.body?.token, 'login');
  const token = login.body.token;

  const category = await request('/categories', {
    method: 'POST',
    token,
    body: { name: `Smoke Category ${suffix}` },
  });
  check(category.status === 201 && category.body?.id, 'create category');

  const warehouse = await request('/warehouses', {
    method: 'POST',
    token,
    body: { name: `Smoke Warehouse ${suffix}`, shortCode: `S${suffix}`, address: 'Smoke St 1' },
  });
  check(warehouse.status === 201 && warehouse.body?.shortCode === `S${suffix}`, 'create warehouse');

  const location = await request('/locations', {
    method: 'POST',
    token,
    body: { warehouseId: warehouse.body.id, name: 'Smoke Stock', shortCode: 'STOCK' },
  });
  check(location.status === 201 && location.body?.warehouseId === warehouse.body.id, 'create location');

  const sku = `SMK-${suffix}`;
  const product = await request('/products', {
    method: 'POST',
    token,
    body: {
      name: 'Smoke Product',
      sku,
      categoryId: category.body.id,
      uom: 'pcs',
      costPerUnit: 3.5,
      reorderMin: 5,
      reorderMax: 50,
      initialStock: { locationId: location.body.id, quantity: 20 },
    },
  });
  check(product.status === 201 && product.body?.sku === sku, 'create product with initial stock');

  const search = await request(`/products?search=${sku}`, { token });
  check(search.status === 200 && search.body?.total === 1, 'product search by SKU');

  let stock = await request(`/stock?warehouseId=${warehouse.body.id}`, { token });
  check(
    stock.status === 200 &&
      stock.body?.data?.length === 1 &&
      stock.body.data[0].onHand === 20 &&
      stock.body.data[0].freeToUse === 20 &&
      stock.body.data[0].lowStock === false &&
      stock.body.data[0].outOfStock === false,
    'stock list shows initial stock with flags',
  );

  const edited = await request(`/stock/${product.body.id}/${location.body.id}`, {
    method: 'PATCH',
    token,
    body: { onHand: 3, note: 'Smoke stocktake' },
  });
  check(
    edited.status === 200 && edited.body?.onHand === 3 && edited.body?.lowStock === true,
    'manual stock edit applies and flags low stock',
  );

  const negative = await request(`/stock/${product.body.id}/${location.body.id}`, {
    method: 'PATCH',
    token,
    body: { onHand: -1 },
  });
  check(negative.status === 400, 'negative on-hand rejected');

  const kpis = await request(`/dashboard/kpis?warehouseId=${warehouse.body.id}`, { token });
  check(
    kpis.status === 200 &&
      kpis.body?.totalProductsInStock === 1 &&
      kpis.body?.lowStockCount === 1 &&
      kpis.body?.pendingReceipts === 0 &&
      kpis.body?.pendingDeliveries === 0,
    'dashboard KPIs reflect warehouse scope',
  );

  const typeFiltered = await request(`/dashboard/kpis?warehouseId=${warehouse.body.id}&type=RECEIPT`, {
    token,
  });
  check(
    typeFiltered.status === 200 &&
      typeFiltered.body?.pendingReceipts === 0 &&
      typeFiltered.body?.pendingDeliveries === 0,
    'dashboard type filter applies',
  );

  const unauthorized = await request(`/stock?warehouseId=${warehouse.body.id}`);
  check(unauthorized.status === 401, 'inventory endpoints require a JWT');

  if (failures > 0) {
    console.error(`\nPhase 2 smoke test FAILED with ${failures} failure(s).`);
    process.exit(1);
  }
  console.log('\nPhase 2 smoke test passed.');
}

main().catch((error) => {
  console.error('\nPhase 2 smoke test crashed:', error);
  process.exit(1);
});
