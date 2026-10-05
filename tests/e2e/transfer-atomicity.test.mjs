// Closes the named gap: "transfer mutation paths under concurrency" (report §26).
//
// The delivery path was already covered; transfers are a SECOND atomicity path through
// the same engine (createTransfer checks availability at inventory.ts:391 then decrements
// source onHand at :412). cancelTransfer restores source onHand and destination inTransit
// exactly, so these tests leave the database unchanged.
//
// Requires the dev server:  npm run dev
// Run: npm run test:e2e

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

const B = process.env.BASE_URL || 'http://localhost:3000';
const N = 8;

async function call(method, path, { cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${B}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, ok: res.ok, json, text, setCookie: res.headers.get('set-cookie') || '' };
}

let cookie = '';
let ctx = null; // { productId, fromId, toId, available, onHand, inTransit }
const created = [];

async function stockOf(productId, locationId) {
  const d = await call('GET', `/api/products/${productId}`, { cookie });
  return d.json.product.stockByLocation.find((s) => s.locationId === locationId) || null;
}

before(async () => {
  const health = await call('GET', '/api/health').catch(() => null);
  if (!health || health.status !== 200) {
    throw new Error(`dev server not reachable at ${B} — start it with \`npm run dev\` before \`npm run test:e2e\``);
  }
  const login = await call('POST', '/api/auth/login', {
    body: { email: 'manager@stocksense.app', password: 'Manager123!' },
  });
  const sid = (login.setCookie || '').match(/sns_session=([^;]+)/)?.[1];
  cookie = sid ? `sns_session=${sid}` : '';
  assert.ok(cookie, 'manager session');

  const products = await call('GET', '/api/products', { cookie });
  const candidates = products.json.products;

  for (const p of candidates) {
    const d = await call('GET', `/api/products/${p.id}`, { cookie });
    const rows = d.json.product.stockByLocation.filter((s) => s.onHand - s.reserved >= 4);
    if (rows.length < 2) continue;
    const from = rows[0];
    const to = rows[1];
    ctx = {
      productId: p.id,
      sku: p.sku,
      fromId: from.locationId,
      toId: to.locationId,
      available: from.onHand - from.reserved,
      onHand: from.onHand,
      inTransit: to.inTransit,
    };
    break;
  }
  assert.ok(ctx, 'need a product stocked in at least 2 locations with >=4 available');
});

after(async () => {
  for (const id of created.splice(0)) {
    await call('POST', `/api/transfers/${id}/cancel`, { cookie });
  }
});

function payload(qty) {
  return {
    fromLocationId: ctx.fromId,
    toLocationId: ctx.toId,
    note: 'QA transfer atomicity probe',
    lines: [{ productId: ctx.productId, qty }],
  };
}

describe('transfer atomicity', () => {
  test('parallel satisfiable transfers cannot oversell the source location', async () => {
    const qty = Math.max(1, Math.floor(ctx.available / 2) + 1);
    const maxPossible = Math.floor(ctx.available / qty);

    const responses = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        call('POST', '/api/transfers', { cookie, body: { ...payload(qty), note: `QA probe ${i}` } })
      )
    );

    const winners = responses.filter((r) => r.status < 300);
    const ids = winners.map((r) => r.json?.transfer?.id).filter(Boolean);
    created.push(...ids);

    assert.ok(
      winners.length <= maxPossible,
      `oversell: ${winners.length} transfers succeeded but source only allows ${maxPossible} ` +
        `(qty=${qty}, available=${ctx.available}); statuses=${JSON.stringify(responses.map((r) => r.status))}`
    );
    assert.ok(winners.length >= 1, `at least one should succeed — statuses=${JSON.stringify(responses.map((r) => r.status))}`);

    // Source onHand must have dropped by EXACTLY winners*qty — no lost or duplicated update.
    const afterFrom = await stockOf(ctx.productId, ctx.fromId);
    assert.equal(
      afterFrom.onHand,
      ctx.onHand - winners.length * qty,
      `source onHand expected ${ctx.onHand - winners.length * qty}, got ${afterFrom.onHand}`
    );

    // Destination carries the in-transit portion.
    const afterTo = await stockOf(ctx.productId, ctx.toId);
    assert.equal(
      afterTo.inTransit,
      ctx.inTransit + winners.length * qty,
      `destination inTransit expected ${ctx.inTransit + winners.length * qty}, got ${afterTo.inTransit}`
    );

    // A loser must have been told WHY — the check is the engine's, not a schema failure.
    const loser = responses.find((r) => r.status === 400);
    if (loser) {
      assert.match(loser.json.error, /available|insufficient/i, `unexpected loser message: ${loser.json.error}`);
      assert.doesNotMatch(loser.json.error, /is required|Invalid number/, 'must not be a validation error');
    }

    // Restore.
    for (const id of ids) await call('POST', `/api/transfers/${id}/cancel`, { cookie });
    created.splice(0);
    const restoredFrom = await stockOf(ctx.productId, ctx.fromId);
    const restoredTo = await stockOf(ctx.productId, ctx.toId);
    assert.equal(restoredFrom.onHand, ctx.onHand, 'source onHand restored exactly');
    assert.equal(restoredTo.inTransit, ctx.inTransit, 'destination inTransit restored exactly');
  });

  test('a transfer can be cancelled only once (no double-restock)', async () => {
    const before = await stockOf(ctx.productId, ctx.fromId);
    const createdRes = await call('POST', '/api/transfers', { cookie, body: payload(1) });
    assert.equal(createdRes.status, 200, createdRes.text.slice(0, 200));
    const id = createdRes.json.transfer.id;
    created.push(id);

    const first = await call('POST', `/api/transfers/${id}/cancel`, { cookie });
    assert.equal(first.status, 200, first.text.slice(0, 200));

    const midway = await stockOf(ctx.productId, ctx.fromId);
    assert.equal(midway.onHand, before.onHand, 'cancel restores the source');

    // The critical assertion: a second cancel must be REJECTED, or stock would be
    // credited twice (a real inflation bug, not a cosmetic one).
    const second = await call('POST', `/api/transfers/${id}/cancel`, { cookie });
    assert.equal(second.status, 400, `second cancel must be rejected, got ${second.status}: ${second.text.slice(0, 160)}`);
    assert.match(second.json.error, /IN_TRANSIT|cancel/i);

    const after = await stockOf(ctx.productId, ctx.fromId);
    assert.equal(after.onHand, before.onHand, 'a rejected cancel must not move stock');

    created.splice(created.indexOf(id), 1); // already cancelled; nothing to clean up
  });

  test('transferring more than available at source is rejected by the ENGINE', async () => {
    const before = await stockOf(ctx.productId, ctx.fromId);
    const r = await call('POST', '/api/transfers', { cookie, body: payload(ctx.available + 1000) });
    assert.equal(r.status, 400, `expected 400, got ${r.status}`);
    assert.match(r.json.error, /available/i, 'error must come from the availability check');
    assert.doesNotMatch(r.json.error, /is required|Invalid number/, 'must not be schema validation');

    const after = await stockOf(ctx.productId, ctx.fromId);
    assert.equal(after.onHand, before.onHand, 'rejected transfer must not move stock');
  });

  test('source and destination must differ', async () => {
    const r = await call('POST', '/api/transfers', {
      cookie,
      body: { ...payload(1), toLocationId: ctx.fromId },
    });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /differ/i);
  });
});
