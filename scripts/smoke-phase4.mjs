#!/usr/bin/env node
/**
 * Phase 4 smoke test (Person 4) — full inventory lifecycle:
 *   receipt → transfer (total-stock invariant) → delivery → adjustment → move history → dashboard.
 * Also covers transfer reservation blocking and history filters.
 *
 * Usage:
 *   node scripts/smoke-phase4.mjs
 *   SMOKE_BASE_URL=http://localhost:4000/api/v1 node scripts/smoke-phase4.mjs
 */
const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000/api/v1';

const suffix = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
const loginId = `s4${suffix}`;
const password = 'Abcdefg1!';
const shortCode = `S4${suffix}`.slice(0, 10);

let failures = 0;

function check(condition, message) {
  if (condition) console.log(`  PASS  ${message}`);
  else {
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

const dayOffset = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

async function main() {
  console.log(`Phase 4 smoke test against ${BASE_URL}`);

  await request('/auth/signup', {
    method: 'POST',
    body: { loginId, email: `${loginId}@example.com`, password, confirmPassword: password },
  });
  const login = await request('/auth/login', { method: 'POST', body: { loginId, password } });
  check(login.status === 200 && login.body?.token, 'login');
  const auth = { token: login.body.token };

  const vendor = await request('/contacts', {
    method: 'POST',
    ...auth,
    body: { name: `P4 Vendor ${suffix}`, type: 'VENDOR' },
  });
  const customer = await request('/contacts', {
    method: 'POST',
    ...auth,
    body: { name: `P4 Customer ${suffix}`, type: 'CUSTOMER' },
  });
  check(vendor.status === 201 && customer.status === 201, 'create vendor + customer contacts');

  const warehouse = await request('/warehouses', {
    method: 'POST',
    ...auth,
    body: { name: `P4 Warehouse ${suffix}`, shortCode, address: null },
  });
  check(warehouse.status === 201, 'create warehouse');

  const locationA = await request('/locations', {
    method: 'POST',
    ...auth,
    body: { warehouseId: warehouse.body.id, name: 'Stock', shortCode: 'STOCK' },
  });
  const locationB = await request('/locations', {
    method: 'POST',
    ...auth,
    body: { warehouseId: warehouse.body.id, name: 'Production Floor', shortCode: 'PROD' },
  });
  check(locationA.status === 201 && locationB.status === 201, 'create source + destination locations');

  const product = await request('/products', {
    method: 'POST',
    ...auth,
    body: {
      name: 'Lifecycle Steel',
      sku: `SMK4-LC-${suffix}`,
      uom: 'kg',
      reorderMin: 1,
      initialStock: { locationId: locationA.body.id, quantity: 100 },
    },
  });
  check(product.status === 201, 'create product with 100kg initial stock');

  const stockAt = async (locationId) => {
    const res = await request(`/stock?locationId=${locationId}&pageSize=100`, auth);
    const row = res.body?.data?.find((candidate) => candidate.productId === product.body.id);
    return row ? { onHand: row.onHand, reserved: row.reserved } : { onHand: 0, reserved: 0 };
  };

  // --- 1. Receipt +10 ---------------------------------------------------------
  const receipt = await request('/receipts', {
    method: 'POST',
    ...auth,
    body: {
      fromContactId: vendor.body.id,
      toLocationId: locationA.body.id,
      scheduleDate: dayOffset(0),
      lines: [{ productId: product.body.id, quantity: 10 }],
    },
  });
  await request(`/receipts/${receipt.body.id}/confirm`, { method: 'POST', ...auth });
  const receiptDone = await request(`/receipts/${receipt.body.id}/validate`, { method: 'POST', ...auth });
  check(
    receiptDone.status === 200 && (await stockAt(locationA.body.id)).onHand === 110,
    'receipt validation increased stock to 110 (BR12)',
  );

  // --- 2. Transfer 30 A → B ---------------------------------------------------
  const transfer = await request('/transfers', {
    method: 'POST',
    ...auth,
    body: {
      fromLocationId: locationA.body.id,
      toLocationId: locationB.body.id,
      scheduleDate: dayOffset(1),
      lines: [{ productId: product.body.id, quantity: 30 }],
    },
  });
  check(
    transfer.status === 201 && transfer.body?.status === 'DRAFT' && /\/INT\/\d{4}$/.test(transfer.body.reference),
    'create transfer → Draft with reference (BR7)',
  );

  // Draft holds no reservation, and the draft can be confirmed after reserving
  check((await stockAt(locationA.body.id)).reserved === 0, 'Draft transfer holds no reservation');

  // insufficient confirmation is blocked with CONFLICT (07 transfer-1)
  const badTransfer = await request('/transfers', {
    method: 'POST',
    ...auth,
    body: {
      fromLocationId: locationA.body.id,
      toLocationId: locationB.body.id,
      scheduleDate: dayOffset(1),
      lines: [{ productId: product.body.id, quantity: 100000 }],
    },
  });
  const badConfirm = await request(`/transfers/${badTransfer.body.id}/confirm`, { method: 'POST', ...auth });
  check(
    badConfirm.status === 409 && badConfirm.body?.error?.message?.includes('Insufficient free-to-use stock'),
    'confirm blocks on insufficient free-to-use stock (409)',
  );
  const badCancel = await request(`/transfers/${badTransfer.body.id}/cancel`, { method: 'POST', ...auth });
  check(badCancel.status === 200 && badCancel.body?.status === 'CANCELED', 'cancel the unconfirmable transfer');

  const confirmed = await request(`/transfers/${transfer.body.id}/confirm`, { method: 'POST', ...auth });
  check(confirmed.status === 200 && confirmed.body?.status === 'READY', 'confirm → Ready (reserves 30)');
  check((await stockAt(locationA.body.id)).reserved === 30, 'Ready transfer reserved 30 at the source');

  const transferred = await request(`/transfers/${transfer.body.id}/validate`, { method: 'POST', ...auth });
  const sourceAfterTransfer = await stockAt(locationA.body.id);
  const destinationAfterTransfer = await stockAt(locationB.body.id);
  check(transferred.status === 200 && transferred.body?.status === 'DONE', 'validate → Done');
  check(
    sourceAfterTransfer.onHand === 80 &&
      sourceAfterTransfer.reserved === 0 &&
      destinationAfterTransfer.onHand === 30,
    'source decreased to 80, destination increased to 30 (R7.2)',
  );
  check(
    sourceAfterTransfer.onHand + destinationAfterTransfer.onHand === 110,
    'total company stock unchanged at 110 (BR14 invariant)',
  );

  // --- 3. Delivery 20 from A --------------------------------------------------
  const delivery = await request('/deliveries', {
    method: 'POST',
    ...auth,
    body: {
      fromLocationId: locationA.body.id,
      toContactId: customer.body.id,
      scheduleDate: dayOffset(1),
      operationType: 'Delivery order',
      lines: [{ productId: product.body.id, quantity: 20 }],
    },
  });
  await request(`/deliveries/${delivery.body.id}/validate`, { method: 'POST', ...auth });
  const deliveryDone = await request(`/deliveries/${delivery.body.id}/validate`, { method: 'POST', ...auth });
  check(
    deliveryDone.status === 200 && (await stockAt(locationA.body.id)).onHand === 60,
    'delivery validation decreased stock to 60 (BR13)',
  );

  // --- 4. Adjustment -2 -------------------------------------------------------
  const adjustment = await request('/adjustments', {
    method: 'POST',
    ...auth,
    body: {
      productId: product.body.id,
      locationId: locationA.body.id,
      countedQuantity: 58,
      note: '2 units damaged',
    },
  });
  check(
    adjustment.status === 201 && adjustment.body?.delta === -2 && adjustment.body?.recordedQuantity === 60,
    'adjustment: recorded 60 → counted 58 → delta -2 (BR15)',
  );
  check((await stockAt(locationA.body.id)).onHand === 58, 'stock reconciles to the counted quantity');

  // reservation guard
  const guardProduct = await request('/products', {
    method: 'POST',
    ...auth,
    body: { name: 'Guard Product', sku: `SMK4-GD-${suffix}`, uom: 'pcs', initialStock: { locationId: locationA.body.id, quantity: 10 } },
  });
  const guardDelivery = await request('/deliveries', {
    method: 'POST',
    ...auth,
    body: {
      fromLocationId: locationA.body.id,
      toContactId: customer.body.id,
      scheduleDate: dayOffset(1),
      operationType: 'Delivery order',
      lines: [{ productId: guardProduct.body.id, quantity: 6 }],
    },
  });
  const blockedAdjustment = await request('/adjustments', {
    method: 'POST',
    ...auth,
    body: { productId: guardProduct.body.id, locationId: locationA.body.id, countedQuantity: 2 },
  });
  check(blockedAdjustment.status === 409, 'adjustment below an open reservation is blocked (409)');
  await request(`/deliveries/${guardDelivery.body.id}/cancel`, { method: 'POST', ...auth });

  // --- 5. Move History --------------------------------------------------------
  // scoped to the lifecycle product: initial 100, receipt 10, transfer OUT+IN,
  // delivery 20, adjustment 2
  const history = await request(
    `/move-history?warehouseId=${warehouse.body.id}&productId=${product.body.id}&pageSize=100`,
    auth,
  );
  check(history.status === 200 && history.body?.total === 6, 'move history shows 6 ledger rows');
  const references = new Set(history.body.data.map((row) => row.reference));
  check(
    references.has(receipt.body.reference) &&
      references.has(transfer.body.reference) &&
      references.has(delivery.body.reference) &&
      references.has(adjustment.body.reference),
    'receipt, transfer, delivery and adjustment movements are all present',
  );
  const transferLegs = history.body.data.filter((row) => row.reference === transfer.body.reference);
  check(
    transferLegs.length === 2 &&
      transferLegs.some((row) => row.direction === 'OUT') &&
      transferLegs.some((row) => row.direction === 'IN'),
    'transfer appears with both OUT and IN ledger legs (R9.3/R9.4/R9.5)',
  );
  const adjustmentRow = history.body.data.find((row) => row.reference === adjustment.body.reference);
  check(
    adjustmentRow?.direction === 'OUT' && adjustmentRow?.to === 'Inventory adjustment',
    'adjustment ledger row labelled correctly',
  );

  const transfersOnly = await request(
    `/move-history?warehouseId=${warehouse.body.id}&type=TRANSFER&pageSize=100`,
    auth,
  );
  check(transfersOnly.body?.total === 2, 'move history type filter (TRANSFER → 2 legs)');

  const outsOnly = await request(
    `/move-history?warehouseId=${warehouse.body.id}&direction=OUT&pageSize=100`,
    auth,
  );
  check(
    outsOnly.body?.total === 3 && outsOnly.body.data.every((row) => row.direction === 'OUT'),
    'move history direction filter (OUT → 3 rows)',
  );

  const byReference = await request(
    `/move-history?search=${encodeURIComponent(adjustment.body.reference)}`,
    auth,
  );
  check(byReference.body?.total === 1, 'move history reference search');

  // --- 6. Dashboard regression ------------------------------------------------
  const kpis = await request(`/dashboard/kpis?warehouseId=${warehouse.body.id}`, auth);
  check(
    kpis.status === 200 &&
      kpis.body?.pendingReceipts === 0 &&
      kpis.body?.pendingDeliveries === 0 &&
      kpis.body?.internalTransfersScheduled === 0 &&
      kpis.body?.totalProductsInStock === 2,
    'dashboard KPIs reflect the completed lifecycle',
  );

  const unauthorized = await request('/transfers');
  check(unauthorized.status === 401, 'Phase 4 endpoints require a JWT');

  if (failures > 0) {
    console.error(`\nPhase 4 smoke test FAILED with ${failures} failure(s).`);
    process.exit(1);
  }
  console.log('\nPhase 4 smoke test passed.');
}

main().catch((error) => {
  console.error('\nPhase 4 smoke test crashed:', error);
  process.exit(1);
});
