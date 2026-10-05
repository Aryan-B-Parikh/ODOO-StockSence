// API contract, auth, permission, negative and boundary regression tests.
// Requires the dev server:  npm run dev   (default http://localhost:3000)
//
// Deliberately asserts STABLE invariants (shapes, status codes, self-consistency,
// engine rules) rather than absolute seeded counts, which drift as the DB is used
// (see QA-008).
//
// Run: npm run test:e2e

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

const B = process.env.BASE_URL || 'http://localhost:3000';
const DEMO = { email: 'manager@stocksense.app', password: 'Manager123!' };
const STAFF = { email: 'staff@stocksense.app', password: 'Staff123!' };

async function call(method, path, { cookie, body, raw } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${B}${path}`, {
    method,
    headers,
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, ok: res.ok, json, text, setCookie: res.headers.get('set-cookie') || '' };
}

async function login(creds) {
  const r = await call('POST', '/api/auth/login', { body: creds });
  const m = (r.setCookie || '').match(/sns_session=([^;]+)/);
  return { status: r.status, json: r.json, cookie: m ? `sns_session=${m[1]}` : '' };
}

let M = '';
let S = '';

before(async () => {
  const health = await call('GET', '/api/health').catch(() => null);
  if (!health || health.status !== 200) {
    throw new Error(`dev server not reachable at ${B} — start it with \`npm run dev\` before \`npm run test:e2e\``);
  }
  M = (await login(DEMO)).cookie;
  S = (await login(STAFF)).cookie;
  assert.ok(M, 'manager session');
  assert.ok(S, 'staff session');
});

describe('authentication', () => {
  test('health returns {ok:true}', async () => {
    const r = await call('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
  });

  test('invalid password → 401 with {error}', async () => {
    const r = await call('POST', '/api/auth/login', { body: { email: DEMO.email, password: 'wrong' } });
    assert.equal(r.status, 401);
    assert.equal(typeof r.json.error, 'string');
  });

  test('unknown account → same 401 body as bad password (no enumeration)', async () => {
    const a = await call('POST', '/api/auth/login', { body: { email: DEMO.email, password: 'wrong' } });
    const b = await call('POST', '/api/auth/login', { body: { email: 'nobody@stocksense.app', password: 'x' } });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.text, b.text);
  });

  test('anon /api/auth/me → 200 {user:null}', async () => {
    const r = await call('GET', '/api/auth/me');
    assert.equal(r.status, 200);
    assert.equal(r.json.user, null);
  });

  for (const p of ['/api/products', '/api/ledger', '/api/dashboard', '/api/meta']) {
    test(`anon GET ${p} → 401 {error}`, async () => {
      const r = await call('GET', p);
      assert.equal(r.status, 401);
      assert.equal(typeof r.json.error, 'string');
    });
  }

  test('logout → 200 {ok:true} and destroys the session', async () => {
    const { cookie } = await login(DEMO);
    const out = await call('POST', '/api/auth/logout', { cookie });
    assert.equal(out.status, 200);
    assert.equal(out.json.ok, true);
    const me = await call('GET', '/api/auth/me', { cookie });
    assert.equal(me.json.user, null, 'session must be destroyed');
    const stale = await call('GET', '/api/products', { cookie });
    assert.equal(stale.status, 401, 'stale cookie must be rejected');
  });

  test('repeat logout without a session is 401-safe', async () => {
    const r = await call('POST', '/api/auth/logout');
    assert.equal(r.status, 200);
  });
});

describe('contracts and invariants', () => {
  test('GET /api/products → {products,categories,summary} with valid DTOs', async () => {
    const r = await call('GET', '/api/products', { cookie: M });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.products));
    assert.ok(Array.isArray(r.json.categories));
    assert.equal(typeof r.json.summary, 'object');
    assert.ok(r.json.products.length > 0);
    for (const p of r.json.products) {
      assert.equal(p.available, p.onHand - p.reserved, `${p.sku}: available must equal onHand - reserved`);
      assert.ok(p.onHand >= 0 && p.reserved >= 0 && p.available >= 0, `${p.sku}: no negative quantities`);
    }
  });

  test('GET /api/attention → summary is self-consistent with its own lists', async () => {
    const r = await call('GET', '/api/attention', { cookie: M });
    assert.equal(r.status, 200);
    const { summary, items, flags, below, stockouts } = r.json;
    assert.ok(summary && Array.isArray(items) && Array.isArray(flags) && Array.isArray(below) && Array.isArray(stockouts));
    assert.equal(summary.belowReorder, below.length, 'belowReorder must equal below[] length');
    assert.equal(summary.stockouts, stockouts.length, 'stockouts must equal stockouts[] length');
    assert.equal(summary.openFlags, flags.filter((f) => f.status === 'OPEN').length);
  });

  test('dashboard.attention.summary === /api/attention summary (single source)', async () => {
    const d = await call('GET', '/api/dashboard', { cookie: M });
    const a = await call('GET', '/api/attention', { cookie: M });
    assert.deepEqual(d.json.attention.summary, a.json.summary);
  });

  test('GET /api/ledger → {entries,total,docTypes} with valid diffs', async () => {
    const r = await call('GET', '/api/ledger', { cookie: M });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.entries));
    assert.equal(typeof r.json.total, 'number');
    assert.ok(Array.isArray(r.json.docTypes));
    for (const e of r.json.entries.slice(0, 50)) {
      assert.ok(Math.abs(e.diff - (e.newQty - e.prevQty)) < 1e-9, `${e.code}: diff must equal newQty - prevQty`);
    }
  });

  test('GET /api/meta → {warehouses,locations,suppliers,products}', async () => {
    const r = await call('GET', '/api/meta', { cookie: M });
    assert.equal(r.status, 200);
    for (const k of ['warehouses', 'locations', 'suppliers', 'products']) {
      assert.ok(Array.isArray(r.json[k]), `${k} must be an array`);
    }
  });

  test('GET /api/dashboard → {kpis,attention,flows,activity}', async () => {
    const r = await call('GET', '/api/dashboard', { cookie: M });
    assert.equal(r.status, 200);
    assert.ok(r.json.kpis && r.json.attention);
    assert.ok(Array.isArray(r.json.flows) && Array.isArray(r.json.activity));
  });

  test('search with empty q → 200 {results:[]} (not 500)', async () => {
    const r = await call('GET', '/api/search?q=', { cookie: M });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.results));
  });
});

describe('permissions', () => {
  test('staff lacks approve-adjustment → 403', async () => {
    const list = await call('GET', '/api/adjustments', { cookie: M });
    const adj = list.json.adjustments?.[0];
    assert.ok(adj, 'need an adjustment to test against');
    const r = await call('POST', `/api/adjustments/${adj.id}/approve`, { cookie: S });
    assert.equal(r.status, 403);
    assert.match(r.json.error, /not permitted/i);
  });

  test('a 403 does not mutate the resource', async () => {
    const before = await call('GET', '/api/adjustments', { cookie: M });
    const adj = before.json.adjustments?.[0];
    await call('POST', `/api/adjustments/${adj.id}/approve`, { cookie: S });
    const after = await call('GET', '/api/adjustments', { cookie: M });
    const now = after.json.adjustments.find((a) => a.id === adj.id);
    assert.equal(now.status, adj.status);
  });

  test('permission gate runs BEFORE resource lookup (no object-id oracle)', async () => {
    const staff = await call('POST', '/api/reorder/999999/accept', { cookie: S, body: {} });
    assert.equal(staff.status, 403, 'unprivileged caller must get 403 even for an unknown id');
    const mgr = await call('POST', '/api/reorder/999999/accept', { cookie: M, body: {} });
    assert.equal(mgr.status, 404, 'privileged caller on an unknown id gets 404');
  });

  test('staff is forbidden from configuring products → 403', async () => {
    const r = await call('POST', '/api/products', {
      cookie: S,
      body: { sku: 'QA-SHOULD-NOT-EXIST', name: 'x', category: 'y', unit: 'pcs', unitCost: 1, reorderPoint: 1, dailyUsage: 1, safetyStock: 0, valueClass: 'LOW' },
    });
    assert.equal(r.status, 403);
  });

  test('staff retains read access → 200', async () => {
    const r = await call('GET', '/api/products', { cookie: S });
    assert.equal(r.status, 200);
  });
});

describe('negative and boundary paths', () => {
  let target;

  before(async () => {
    const products = await call('GET', '/api/products', { cookie: M });
    const product = products.json.products.find((p) => p.sku === 'RM-STL-ROD10') || products.json.products[0];
    const detail = await call('GET', `/api/products/${product.id}`, { cookie: M });
    const slot = detail.json.product.stockByLocation.find((s) => s.onHand > 0);
    target = { productId: product.id, sku: product.sku, locationId: slot.locationId, onHand: slot.onHand, reserved: slot.reserved };
  });

  test('CRITICAL below-zero adjustment → 422 (INV-4)', async () => {
    const r = await call('POST', '/api/adjustments', {
      cookie: M,
      body: { reason: 'QA negative probe', lines: [{ productId: target.productId, locationId: target.locationId, countedQty: -5 }] },
    });
    assert.equal(r.status, 422);
    assert.match(r.json.error, /below zero/i);
  });

  test('delivery exceeding available → 400 from the ENGINE, not schema validation', async () => {
    const r = await call('POST', '/api/deliveries', {
      cookie: M,
      body: { customer: 'QA oversell probe', lines: [{ productId: target.productId, locationId: target.locationId, qty: 999999 }] },
    });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /available/i, 'error must come from the availability check');
    assert.doesNotMatch(r.json.error, /Invalid number for|is required/, 'must not be a schema validation error');
  });

  test('blocked operations leave stock and ledger untouched', async () => {
    const before = await call('GET', '/api/ledger', { cookie: M });
    await call('POST', '/api/adjustments', {
      cookie: M,
      body: { reason: 'QA negative probe', lines: [{ productId: target.productId, locationId: target.locationId, countedQty: -5 }] },
    });
    await call('POST', '/api/deliveries', {
      cookie: M,
      body: { customer: 'QA oversell probe', lines: [{ productId: target.productId, locationId: target.locationId, qty: 999999 }] },
    });
    const after = await call('GET', '/api/ledger', { cookie: M });
    assert.equal(after.json.total, before.json.total, 'ledger must not grow on a blocked operation');
    const detail = await call('GET', `/api/products/${target.productId}`, { cookie: M });
    const slot = detail.json.product.stockByLocation.find((s) => s.locationId === target.locationId);
    assert.equal(slot.onHand, target.onHand);
    assert.equal(slot.reserved, target.reserved);
  });

  test('unknown product → 404 {error}', async () => {
    const r = await call('GET', '/api/products/999999', { cookie: M });
    assert.equal(r.status, 404);
    assert.equal(typeof r.json.error, 'string');
  });

  test('duplicate SKU → 400', async () => {
    const r = await call('POST', '/api/products', {
      cookie: M,
      body: { sku: target.sku, name: 'Dup', category: 'Raw Materials', unit: 'kg', unitCost: 1, reorderPoint: 1, dailyUsage: 1, safetyStock: 0, valueClass: 'LOW' },
    });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /already exists/i);
  });

  test('negative unitCost → 400', async () => {
    const r = await call('POST', '/api/products', {
      cookie: M,
      body: { sku: 'QA-NEG-001', name: 'x', category: 'y', unit: 'kg', unitCost: -1, reorderPoint: 1, dailyUsage: 1, safetyStock: 0, valueClass: 'LOW' },
    });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /non-negative/i);
  });

  test('missing required fields → 400', async () => {
    const r = await call('POST', '/api/products', { cookie: M, body: { sku: 'QA-MISS-001' } });
    assert.equal(r.status, 400);
  });

  test('invalid valueClass → 400', async () => {
    const r = await call('POST', '/api/products', {
      cookie: M,
      body: { sku: 'QA-VC-001', name: 'x', category: 'y', unit: 'pcs', unitCost: 1, reorderPoint: 1, dailyUsage: 1, safetyStock: 0, valueClass: 'HUGE' },
    });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /HIGH, MEDIUM or LOW/);
  });

  test('malformed JSON → 400, not an unhandled 500', async () => {
    const r = await call('POST', '/api/auth/login', { raw: '{not json' });
    assert.ok(r.status >= 400 && r.status < 500, `got ${r.status}`);
  });

  test('empty credentials → 400', async () => {
    const r = await call('POST', '/api/auth/login', { body: {} });
    assert.ok(r.status >= 400 && r.status < 500, `got ${r.status}`);
  });

  test('no stack traces or internal paths leak in error responses', async () => {
    const probes = [
      await call('GET', '/api/products/999999', { cookie: M }),
      await call('POST', '/api/auth/login', { raw: '{not json' }),
      await call('POST', '/api/products', { cookie: M, body: { sku: 'QA-LEAK-001' } }),
    ];
    for (const p of probes) {
      assert.doesNotMatch(p.text, /node_modules|at Object\.|\.ts:\d+|prisma/i, `leak in: ${p.text.slice(0, 200)}`);
    }
  });
});
