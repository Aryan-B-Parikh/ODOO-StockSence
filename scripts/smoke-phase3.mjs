#!/usr/bin/env node
/**
 * Phase 3 smoke test (Person 4) — Receipts + Deliveries end-to-end.
 *
 * Verifies against a live API:
 *   contacts → warehouse/location → products → receipt Draft→Ready→Done (stock up, ledger)
 *   → delivery Draft (reservation) → Ready → Done (stock down) → WAITING → receipt promotes
 *   WAITING to Ready → cancel releases.
 *
 * Usage:
 *   node scripts/smoke-phase3.mjs
 *   SMOKE_BASE_URL=http://localhost:4000/api/v1 node scripts/smoke-phase3.mjs
 */
const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000/api/v1';

const suffix = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
const loginId = `s3${suffix}`;
const password = 'Abcdefg1!';
const shortCode = `S3${suffix}`.slice(0, 10);

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
  console.log(`Phase 3 smoke test against ${BASE_URL}`);

  await request('/auth/signup', {
    method: 'POST',
    body: { loginId, email: `${loginId}@example.com`, password, confirmPassword: password },
  });
  const login = await request('/auth/login', { method: 'POST', body: { loginId, password } });
  check(login.status === 200 && login.body?.token, 'login');
  const token = login.body.token;
  const auth = { token };

  const vendor = await request('/contacts', {
    method: 'POST',
    ...auth,
    body: { name: `Smoke Vendor ${suffix}`, type: 'VENDOR', email: `vendor${suffix}@example.com` },
  });
  check(vendor.status === 201 && vendor.body?.type === 'VENDOR', 'create vendor contact (§4b)');

  const customer = await request('/contacts', {
    method: 'POST',
    ...auth,
    body: { name: `Smoke Customer ${suffix}`, type: 'CUSTOMER' },
  });
  check(customer.status === 201, 'create customer contact');

  const warehouse = await request('/warehouses', {
    method: 'POST',
    ...auth,
    body: { name: `Smoke Warehouse ${suffix}`, shortCode, address: null },
  });
  check(warehouse.status === 201, 'create warehouse');

  const location = await request('/locations', {
    method: 'POST',
    ...auth,
    body: { warehouseId: warehouse.body.id, name: 'Stock', shortCode: 'STOCK' },
  });
  check(location.status === 201, 'create location');

  const makeProduct = async (name, quantity) =>
    request('/products', {
      method: 'POST',
      ...auth,
      body: {
        name,
        sku: `SMK3-${name.toUpperCase()}-${suffix}`,
        uom: 'pcs',
        reorderMin: 1,
        ...(quantity !== undefined ? { initialStock: { locationId: location.body.id, quantity } } : {}),
      },
    });

  const productA = await makeProduct('Alpha', 10);
  const productB = await makeProduct('Beta', 3);
  const productC = await makeProduct('Gamma'); // no stock yet
  check(
    productA.status === 201 && productB.status === 201 && productC.status === 201,
    'create products (with and without initial stock)',
  );

  const stockFor = async (productId) => {
    const res = await request(`/stock?locationId=${location.body.id}`, auth);
    const row = res.body?.data?.find((candidate) => candidate.productId === productId);
    return row ? { onHand: row.onHand, reserved: row.reserved, freeToUse: row.freeToUse } : null;
  };

  // ------------------------------------------------------------- receipt flow
  const receipt = await request('/receipts', {
    method: 'POST',
    ...auth,
    body: {
      fromContactId: vendor.body.id,
      toLocationId: location.body.id,
      scheduleDate: dayOffset(1),
      lines: [
        { productId: productA.body.id, quantity: 5 },
        { productId: productB.body.id, quantity: 2 },
      ],
    },
  });
  check(
    receipt.status === 201 && receipt.body?.status === 'DRAFT' && /\/IN\/\d{4}$/.test(receipt.body.reference),
    'create receipt → Draft with generated reference (BR7)',
  );

  const beforeValidateA = await stockFor(productA.body.id);
  const beforeValidateB = await stockFor(productB.body.id);
  const prematureValidate = await request(`/receipts/${receipt.body.id}/validate`, { method: 'POST', ...auth });
  check(prematureValidate.status === 409, 'validate before confirm is rejected');
  check(
    (await stockFor(productA.body.id)).onHand === beforeValidateA.onHand &&
      (await stockFor(productB.body.id)).onHand === beforeValidateB.onHand,
    'no stock change before validation',
  );

  await request(`/receipts/${receipt.body.id}/confirm`, { method: 'POST', ...auth });
  const receiptDone = await request(`/receipts/${receipt.body.id}/validate`, { method: 'POST', ...auth });
  check(receiptDone.status === 200 && receiptDone.body?.status === 'DONE', 'confirm → validate → Done');
  check(
    (await stockFor(productA.body.id)).onHand === beforeValidateA.onHand + 5 &&
      (await stockFor(productB.body.id)).onHand === beforeValidateB.onHand + 2,
    'receipt validation increased stock (BR12)',
  );

  const receiptPrint = await request(`/receipts/${receipt.body.id}/print`, auth);
  check(receiptPrint.status === 200 && receiptPrint.body?.type === 'RECEIPT', 'print payload once Done (R5.12)');
  const finalValidate = await request(`/receipts/${receipt.body.id}/validate`, { method: 'POST', ...auth });
  check(finalValidate.status === 409, 'Done receipts cannot be validated again');

  // ----------------------------------------------------------- delivery flow
  const delivery = await request('/deliveries', {
    method: 'POST',
    ...auth,
    body: {
      fromLocationId: location.body.id,
      toContactId: customer.body.id,
      scheduleDate: dayOffset(1),
      operationType: 'Delivery order',
      lines: [{ productId: productA.body.id, quantity: 4 }],
    },
  });
  check(
    delivery.status === 201 && delivery.body?.status === 'DRAFT',
    'create delivery with sufficient stock → Draft (R6.12)',
  );
  const reserved = await stockFor(productA.body.id);
  check(reserved.reserved === 4 && reserved.freeToUse === reserved.onHand - 4, 'delivery reserves stock (BR11)');

  const deliveryReady = await request(`/deliveries/${delivery.body.id}/validate`, { method: 'POST', ...auth });
  check(deliveryReady.status === 200 && deliveryReady.body?.status === 'READY', 'pick & pack → Ready (R6.2)');
  const deliveryDone = await request(`/deliveries/${delivery.body.id}/validate`, { method: 'POST', ...auth });
  check(deliveryDone.status === 200 && deliveryDone.body?.status === 'DONE', 'validate → Done');
  const afterDelivery = await stockFor(productA.body.id);
  check(
    afterDelivery.onHand === reserved.onHand - 4 && afterDelivery.reserved === 0,
    'delivery validation decreased stock and released the reservation (BR13)',
  );

  const shortDelivery = await request('/deliveries', {
    method: 'POST',
    ...auth,
    body: {
      fromLocationId: location.body.id,
      toContactId: customer.body.id,
      scheduleDate: dayOffset(1),
      operationType: 'Delivery order',
      lines: [{ productId: productB.body.id, quantity: 500 }],
    },
  });
  check(shortDelivery.status === 201 && shortDelivery.body?.status === 'WAITING', 'short delivery → Waiting (BR17)');
  check(shortDelivery.body?.lines?.[0]?.outOfStock === true, 'out-of-stock line flagged (BR18)');
  const waitValidate = await request(`/deliveries/${shortDelivery.body.id}/validate`, { method: 'POST', ...auth });
  check(waitValidate.status === 409, 'Waiting deliveries cannot be validated');

  // ----------------------------------- recheck: receipt promotes a waiting delivery
  const waitingForC = await request('/deliveries', {
    method: 'POST',
    ...auth,
    body: {
      fromLocationId: location.body.id,
      toContactId: customer.body.id,
      scheduleDate: dayOffset(1),
      operationType: 'Delivery order',
      lines: [{ productId: productC.body.id, quantity: 7 }],
    },
  });
  check(waitingForC.body?.status === 'WAITING', 'delivery for new product → Waiting');

  const receiptC = await request('/receipts', {
    method: 'POST',
    ...auth,
    body: {
      fromContactId: vendor.body.id,
      toLocationId: location.body.id,
      scheduleDate: dayOffset(0),
      lines: [{ productId: productC.body.id, quantity: 7 }],
    },
  });
  await request(`/receipts/${receiptC.body.id}/confirm`, { method: 'POST', ...auth });
  await request(`/receipts/${receiptC.body.id}/validate`, { method: 'POST', ...auth });
  const promoted = await request(`/deliveries/${waitingForC.body.id}`, auth);
  check(
    promoted.status === 200 && promoted.body?.status === 'READY',
    'receipt validation promotes Waiting → Ready (07 re-evaluation)',
  );

  const cancelWaiting = await request(`/deliveries/${waitingForC.body.id}/cancel`, { method: 'POST', ...auth });
  check(cancelWaiting.status === 200 && cancelWaiting.body?.status === 'CANCELED', 'cancel releases reservation');
  check((await stockFor(productC.body.id)).reserved === 0, 'reservation released after cancel');

  // ------------------------------------------------------------- security/dashboard
  const unauthorized = await request('/receipts');
  check(unauthorized.status === 401, 'receipts require a JWT');

  const kpis = await request(`/dashboard/kpis?warehouseId=${warehouse.body.id}`, auth);
  check(kpis.status === 200 && typeof kpis.body?.pendingReceipts === 'number', 'dashboard KPIs respond');

  if (failures > 0) {
    console.error(`\nPhase 3 smoke test FAILED with ${failures} failure(s).`);
    process.exit(1);
  }
  console.log('\nPhase 3 smoke test passed.');
}

main().catch((error) => {
  console.error('\nPhase 3 smoke test crashed:', error);
  process.exit(1);
});
