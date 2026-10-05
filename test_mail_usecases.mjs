// Automated end-to-end verification of all 5 email use cases in the StockSense Next.js stack.
//
// QA-001 (fixed): this script previously had NO assertions, swallowed every error via
// `main().catch(console.error)`, and always exited 0 — it even reported "PASSED" for an
// HTTP 404 on a route that does not exist (/login; the app is a hash-view SPA). It now
// asserts every expectation, exits non-zero on any failure, and prints SKIP explicitly
// instead of silently doing nothing.
//
// Run: node test_mail_usecases.mjs   (requires the dev server on :3000)

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const DEMO = { email: 'manager@stocksense.app', password: 'Manager123!' };

let failures = 0;
let passes = 0;
let skips = 0;

function pass(label, detail = '') {
  passes++;
  console.log(`  PASS  ${label}${detail ? `  :: ${detail}` : ''}`);
}
function fail(label, detail = '') {
  failures++;
  console.log(`  FAIL  ${label}${detail ? `  :: ${detail}` : ''}`);
}
function skip(label, detail = '') {
  skips++;
  console.log(`  SKIP  ${label}${detail ? `  :: ${detail}` : ''}`);
}
function check(cond, label, detail = '') {
  if (cond) pass(label, detail);
  else fail(label, detail);
  return !!cond;
}

async function call(method, path, { cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: res.status, ok: res.ok, json, text, setCookie: res.headers.get('set-cookie') || '' };
}

function sessionCookie(res) {
  const m = (res.setCookie || '').match(/sns_session=([^;]+)/);
  return m ? `sns_session=${m[1]}` : '';
}

async function main() {
  console.log(`[TEST] Verifying StockSense Next.js on ${baseUrl}...`);

  // 1. App shell is up and serving the emerald theme.
  console.log('\n--- App shell ---');
  let home;
  try {
    home = await call('GET', '/');
  } catch (err) {
    fail('GET / reachable', String(err));
    throw new Error(`server not reachable at ${baseUrl} — start it with \`npm run dev\``);
  }
  check(home.status === 200, 'GET / returns 200', `status=${home.status}`);
  check(/StockSense/i.test(home.text), 'home page contains StockSense branding', `status=${home.status}`);
  if (home.status !== 200) {
    // Without a session there is nothing else worth asserting.
    return;
  }

  // 2. Authenticate as manager to obtain a session.
  console.log('\n--- Authentication ---');
  const login = await call('POST', '/api/auth/login', { body: DEMO });
  check(login.status === 200, 'POST /api/auth/login → 200', `status=${login.status} ${login.text.slice(0, 120)}`);
  check(login.json?.user?.email === DEMO.email, 'login returns SessionUser for demo manager',
    JSON.stringify(login.json?.user?.email));
  const cookie = sessionCookie(login);
  check(cookie.length > 0, 'session cookie issued', `len=${cookie.length}`);
  if (!cookie) return;

  // Resolve a real product/location instead of hardcoding ids (they shift on reseed).
  const products = await call('GET', '/api/products', { cookie });
  const product = products.json?.products?.[0];
  check(!!product && typeof product.id === 'number', 'GET /api/products returns data',
    `n=${products.json?.products?.length}`);

  // 3. UC-1: Low-stock & reorder alert.
  console.log('\n--- UC-1: Low-Stock & Reorder Point Alert ---');
  const uc1 = await call('POST', '/api/mail/low-stock', { cookie });
  check(uc1.status === 200, 'POST /api/mail/low-stock → 200', `status=${uc1.status}`);
  check(uc1.json?.success === true, 'low-stock evaluation reports success', JSON.stringify(uc1.json).slice(0, 160));
  check(Number.isInteger(uc1.json?.lowStockCount) && uc1.json.lowStockCount >= 0,
    'lowStockCount is a non-negative integer', String(uc1.json?.lowStockCount));

  // 4. UC-2: Real email OTP for password recovery.
  console.log('\n--- UC-2: Real Email OTP for Password Recovery ---');
  const uc2 = await call('POST', '/api/auth/otp', { body: { email: DEMO.email } });
  check(uc2.status === 200, 'POST /api/auth/otp → 200', `status=${uc2.status}`);
  check(uc2.json?.success === true, 'OTP dispatch reports success', JSON.stringify(uc2.json).slice(0, 160));
  // Anti-enumeration: an unknown account must return the same success/message payload
  // (QA-006). Compare the required fields only — debugOtp is an explicit dev-only
  // affordance and legitimately absent when no code was generated.
  const unknown = await call('POST', '/api/auth/otp', { body: { email: `qa-nope-${Date.now()}@stocksense.app` } });
  check(unknown.status === 200, 'unknown account also → 200 (no enumeration)', `status=${unknown.status}`);
  const core = (o) => JSON.stringify({ success: o?.success, message: o?.message });
  check(core(unknown.json) === core(uc2.json),
    'unknown-account success+message identical to known-account',
    `unknown=${core(unknown.json)} known=${core(uc2.json)}`);
  // When debug is off (production-like), the entire body must match key-for-key.
  const hasDebug = typeof uc2.json?.debugOtp === 'string';
  if (!hasDebug) {
    const shape = (o) => Object.keys(o || {}).sort().join(',');
    check(shape(unknown.json) === shape(uc2.json), 'full response shape identical when debug off',
      `unknown=[${shape(unknown.json)}] known=[${shape(uc2.json)}]`);
  } else {
    skip('full-shape equality', 'OTP_DEBUG on — debugOtp intentionally discloses the code locally');
    check(/^\d{6}$/.test(uc2.json.debugOtp), 'debugOtp is a 6-digit code', uc2.json.debugOtp);
  }

  // 5. UC-3: Customer delivery dispatch & packing slip.
  console.log('\n--- UC-3: Customer Delivery Dispatch & Packing Slip ---');
  let deliveryId = null;
  const deliveries = await call('GET', '/api/deliveries', { cookie });
  const packed = (deliveries.json?.deliveries || []).find((d) => d.status === 'PACKED');
  if (packed) {
    deliveryId = packed.id;
    pass('found existing PACKED order', packed.code);
  } else {
    const detail = product ? await call('GET', `/api/products/${product.id}`, { cookie }) : null;
    const slot = detail?.json?.product?.stockByLocation?.find((s) => (s.onHand ?? 0) - (s.reserved ?? 0) > 0);
    if (!product || !slot) {
      skip('create delivery', 'no product/location with available stock');
    } else {
      const created = await call('POST', '/api/deliveries', {
        cookie,
        body: {
          customer: 'Acme Aerospace Ltd',
          note: 'High priority customer dispatch',
          lines: [{ productId: product.id, locationId: slot.locationId, qty: 1 }],
        },
      });
      if (check(created.status === 200 || created.status === 201,
        'POST /api/deliveries → 2xx', `status=${created.status} ${created.text.slice(0, 140)}`)) {
        deliveryId = created.json.delivery.id;
        pass('delivery created', created.json.delivery.code);
      }
    }
  }

  if (deliveryId) {
    const pick = await call('POST', `/api/deliveries/${deliveryId}/pick`, { cookie });
    check(pick.ok, 'POST /pick → 2xx', `status=${pick.status} ${pick.text.slice(0, 120)}`);
    const pack = await call('POST', `/api/deliveries/${deliveryId}/pack`, { cookie });
    check(pack.ok, 'POST /pack → 2xx', `status=${pack.status} ${pack.text.slice(0, 120)}`);
    const deliver = await call('POST', `/api/deliveries/${deliveryId}/deliver`, { cookie });
    check(deliver.ok, 'POST /deliver → 2xx', `status=${deliver.status} ${deliver.text.slice(0, 120)}`);
    check(deliver.json?.delivery?.status === 'DELIVERED', 'order reached DELIVERED',
      String(deliver.json?.delivery?.status));
  }

  // 6. UC-4: Goods Receipt Note (GRN) to vendors.
  console.log('\n--- UC-4: Goods Receipt Note (GRN) to Vendors ---');
  const receipts = await call('GET', '/api/receipts', { cookie });
  const expected = (receipts.json?.receipts || []).find((r) => r.status === 'EXPECTED');
  if (!expected) {
    skip('receive an EXPECTED receipt', 'no receipt currently in EXPECTED state');
  } else {
    const receive = await call('POST', `/api/receipts/${expected.id}/receive`, {
      cookie,
      body: {
        lines: (expected.lines || []).map((l) => ({ lineId: l.id, receivedQty: l.expectedQty })),
        note: 'Inspected and verified at Receiving Dock 1',
      },
    });
    check(receive.ok, 'POST /receipts/:id/receive → 2xx', `status=${receive.status} ${receive.text.slice(0, 140)}`);
    check(receive.json?.receipt?.status === 'RECEIVED', 'receipt reached RECEIVED',
      String(receive.json?.receipt?.status));
  }

  // 7. UC-5: Daily warehouse shift digest.
  console.log('\n--- UC-5: Daily Warehouse Shift Digest ---');
  const uc5 = await call('POST', '/api/mail/digest', { cookie });
  check(uc5.status === 200, 'POST /api/mail/digest → 200', `status=${uc5.status}`);
  check(uc5.json?.success === true, 'digest dispatched successfully', JSON.stringify(uc5.json).slice(0, 160));

  // 8. In-memory mail inbox.
  console.log('\n--- Mail inbox ---');
  await new Promise((r) => setTimeout(r, 1000)); // fire-and-forget dispatch
  const inbox = await call('GET', '/api/mail/inbox');
  check(inbox.status === 200, 'GET /api/mail/inbox → 200', `status=${inbox.status}`);
  const count = inbox.json?.count;
  check(typeof count === 'number' && count >= 1, 'inbox contains dispatched emails', `count=${count}`);
  (inbox.json?.emails || []).slice(0, 5).forEach((e, i) => {
    console.log(`    [${i + 1}] To: ${e.to} | Subject: ${e.subject}`);
  });
}

main()
  .catch((err) => {
    failures++;
    console.error('\nUNCAUGHT ERROR:', err);
  })
  .finally(() => {
    console.log(`\n==== ${passes} passed, ${failures} failed, ${skips} skipped ====`);
    if (failures > 0) {
      console.log('RESULT: FAILED');
      process.exitCode = 1;
    } else {
      console.log('RESULT: PASSED');
    }
  });
