// INV-2 / INV-3 regression: atomic check-then-update and no overselling.
// Fires N parallel deliveries that are EACH individually satisfiable but cumulatively
// impossible; a non-atomic engine would let more than one through.
//
// Requires the dev server:  npm run dev
// Creates one order if the engine behaves, then cancels it (exact restore).
//
// Run: npm run test:e2e

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

const B = process.env.BASE_URL || 'http://localhost:3000';
const N = 8;
const SKU = 'RM-STL-ROD10';

async function call(method, path, { cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${B}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, ok: res.ok, json, text, setCookie: res.headers.get('set-cookie') || '' };
}

let cookie = '';
let target = null;
let created = [];

before(async () => {
  const health = await call('GET', '/api/health').catch(() => null);
  if (!health || health.status !== 200) {
    throw new Error(`dev server not reachable at ${B} — start it with \`npm run dev\` before \`npm run test:e2e\``);
  }
  const login = await call('POST', '/api/auth/login', {
    body: { email: 'manager@stocksense.app', password: 'Manager123!' },
  });
  cookie = (login.setCookie || '').match(/sns_session=([^;]+)/)?.[1];
  cookie = cookie ? `sns_session=${cookie}` : '';
  assert.ok(cookie, 'manager session');

  const products = await call('GET', '/api/products', { cookie });
  const product = products.json.products.find((p) => p.sku === SKU) || products.json.products[0];
  const detail = await call('GET', `/api/products/${product.id}`, { cookie });
  const slot = detail.json.product.stockByLocation.find((s) => s.onHand - s.reserved > 1);
  assert.ok(slot, 'need a location with available stock');
  target = {
    productId: product.id,
    sku: product.sku,
    locationId: slot.locationId,
    productOnHand: detail.json.product.onHand,
    productReserved: detail.json.product.reserved,
    // Availability is checked PER LOCATION (the engine reports per-location available),
    // so the probe must be sized from the stock row or the race is never entered.
    locationAvailable: slot.onHand - slot.reserved,
  };
});

after(async () => {
  for (const id of created) await call('POST', `/api/deliveries/${id}/cancel`, { cookie });
  created = [];
});

describe('atomic check-then-update under concurrency', () => {
  test('parallel satisfiable requests cannot oversell', async () => {
    const qty = Math.max(1, Math.floor(target.locationAvailable / 2) + 1);
    const ledgerBefore = (await call('GET', '/api/ledger', { cookie })).json.total;

    const responses = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        call('POST', '/api/deliveries', {
          cookie,
          body: { customer: `QA atomicity probe ${i}`, lines: [{ productId: target.productId, locationId: target.locationId, qty }] },
        })
      )
    );

    const statuses = responses.map((r) => r.status);
    created = responses.filter((r) => r.status < 300).map((r) => r.json?.delivery?.id).filter(Boolean);
    const successes = created.length;
    const maxPossible = Math.floor(target.locationAvailable / qty);

    assert.ok(
      successes <= maxPossible,
      `oversell: ${successes} succeeded but stock only allows ${maxPossible} (qty=${qty}, available=${target.locationAvailable}); statuses=${JSON.stringify(statuses)}`
    );

    // Exactly one should win when qty is roughly half the available stock.
    assert.ok(successes >= 1, `at least one request should have succeeded — statuses=${JSON.stringify(statuses)}`);

    const after = await call('GET', `/api/products/${target.productId}`, { cookie });
    const p = after.json.product;
    assert.ok(p.onHand - p.reserved >= 0, 'aggregate available must never go negative');
    assert.equal(p.onHand, target.productOnHand, 'onHand must not change on reservation');
    assert.equal(
      p.reserved,
      target.productReserved + successes * qty,
      'reserved must grow by exactly successes*qty (no lost or duplicated update)'
    );

    // Losers must have observed the POST-commit state, proving serialized reads.
    const loser = responses.find((r) => r.status === 400);
    if (loser) assert.match(loser.json.error, /available/i);

    // cleanup restores stock exactly
    const createdCount = created.length;
    for (const id of created) await call('POST', `/api/deliveries/${id}/cancel`, { cookie });
    created = [];
    const restored = await call('GET', `/api/products/${target.productId}`, { cookie });
    assert.equal(restored.json.product.onHand, target.productOnHand, 'onHand restored');
    assert.equal(restored.json.product.reserved, target.productReserved, 'reserved restored');

    const ledgerAfter = (await call('GET', '/api/ledger', { cookie })).json.total;
    // cancel is audited: exactly 2 entries per created order (create + cancel)
    assert.ok(ledgerAfter >= ledgerBefore, 'ledger must not shrink');
    assert.equal(
      ledgerAfter - ledgerBefore,
      createdCount * 2,
      `expected exactly 2 ledger entries (create+cancel) per created order; got ${ledgerBefore} -> ${ledgerAfter}`
    );
  });
});
