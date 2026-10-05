// Ledger reconciliation + engine invariants (REQ-INV-1, INV-4, INV-5; worklog.md:12,20).
// Read-only against db/custom.db — never writes.
//
// Run: npm test   (no server required)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function openDb() {
  const envPath = resolve(ROOT, '.env');
  let rel = 'file:./db/custom.db';
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, 'utf8').match(/DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/);
    if (m) rel = m[1];
  }
  const file = rel.replace(/^file:/, '').replace(/^\.\/?/, `${ROOT}/`);
  if (!existsSync(file)) return null;
  return new DatabaseSync(file, { readOnly: true });
}

const db = openDb();
const available = !!db;
const q = (sql) => (db ? db.prepare(sql).all() : []);
const one = (sql) => (db ? db.prepare(sql).get() : undefined);

const FIELD_COLUMN = {
  ON_HAND: 'onHand',
  RESERVED: 'reserved',
  INCOMING: 'incoming',
  IN_TRANSIT: 'inTransit',
  DAMAGED: 'damaged',
};

describe('ledger reconciliation', { skip: available ? false : 'db/custom.db not present' }, () => {
  test('LED-01 ledger has entries', () => {
    assert.ok(one('SELECT COUNT(*) c FROM LedgerEntry').c > 0);
  });

  test('LED-02 every entry satisfies diff === newQty - prevQty', () => {
    const bad = q('SELECT code, prevQty, newQty, diff FROM LedgerEntry')
      .filter((e) => Math.abs(e.diff - (e.newQty - e.prevQty)) > 1e-9);
    assert.deepEqual(bad, [], `${bad.length} ledger entries have an inconsistent diff`);
  });

  test('LED-03 ledger codes are unique', () => {
    const rows = q('SELECT code FROM LedgerEntry');
    assert.equal(new Set(rows.map((r) => r.code)).size, rows.length);
  });

  test('LED-04 chain continuity: entry.prevQty === prior entry.newQty', () => {
    const entries = q('SELECT * FROM LedgerEntry ORDER BY id ASC');
    const chains = new Map();
    for (const e of entries) {
      const k = `${e.productId}|${e.locationId}|${e.field}`;
      if (!chains.has(k)) chains.set(k, []);
      chains.get(k).push(e);
    }
    const broken = [];
    for (const [k, list] of chains) {
      for (let i = 1; i < list.length; i++) {
        if (Math.abs(list[i].prevQty - list[i - 1].newQty) > 1e-9) {
          broken.push({ chain: k, code: list[i].code, prevQty: list[i].prevQty, expected: list[i - 1].newQty });
        }
      }
    }
    assert.deepEqual(broken, []);
    assert.ok(chains.size > 0);
  });

  test('LED-05 ledger tail equals current StockLevel value (reconciles)', () => {
    const entries = q('SELECT * FROM LedgerEntry ORDER BY id ASC');
    const stock = q('SELECT * FROM StockLevel');
    const byKey = new Map(stock.map((s) => [`${s.productId}|${s.locationId}`, s]));
    const chains = new Map();
    for (const e of entries) {
      const k = `${e.productId}|${e.locationId}|${e.field}`;
      if (!chains.has(k)) chains.set(k, []);
      chains.get(k).push(e);
    }
    const mismatch = [];
    for (const [k, list] of chains) {
      const [pid, lid, field] = k.split('|');
      const col = FIELD_COLUMN[field];
      const s = byKey.get(`${pid}|${lid}`);
      assert.ok(col, `unknown ledger field ${field}`);
      assert.ok(s, `no StockLevel row for chain ${k}`);
      const last = list[list.length - 1];
      if (Math.abs(last.newQty - s[col]) > 1e-9) {
        mismatch.push({ chain: k, ledgerTail: last.newQty, stock: s[col] });
      }
    }
    assert.deepEqual(mismatch, []);
  });

  test('LED-07 every non-zero StockLevel has an ON_HAND ledger chain', () => {
    const entries = q('SELECT DISTINCT productId, locationId FROM LedgerEntry');
    const seen = new Set(entries.map((e) => `${e.productId}|${e.locationId}`));
    const missing = q('SELECT * FROM StockLevel WHERE onHand <> 0')
      .filter((s) => !seen.has(`${s.productId}|${s.locationId}`));
    assert.deepEqual(missing, []);
  });
});

describe('engine invariants', { skip: available ? false : 'db/custom.db not present' }, () => {
  test('INV-04 no negative stock on any field', () => {
    const neg = q('SELECT * FROM StockLevel WHERE onHand < 0 OR reserved < 0 OR damaged < 0 OR incoming < 0');
    assert.deepEqual(neg, []);
  });

  test('INV-01a per-location available never negative (no overselling)', () => {
    const bad = q('SELECT * FROM StockLevel WHERE onHand - reserved < 0');
    assert.deepEqual(bad, []);
  });

  test('INV-01b aggregate available never negative', () => {
    const bad = q(
      'SELECT productId, SUM(onHand) oh, SUM(reserved) rs FROM StockLevel ' +
        'GROUP BY productId HAVING SUM(onHand) - SUM(reserved) < 0'
    );
    assert.deepEqual(bad, []);
  });
});
