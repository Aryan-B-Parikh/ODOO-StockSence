# Phase 2 — Stock/Document Business-Rule Test Matrix (Person 3)

> `08_PHASE_PLAN.md` Phase 2 §5: "Design the `stock_moves`/`stock_move_lines` business-rule test
> matrix (BR12–BR18) ready to implement against Person 1's stock-engine as soon as it's
> published." Phase 2 implements the engine + this matrix's Phase 2-executable cases (marked ✅);
> the Phase 3 rows define the tests that will be added with receipts/deliveries.

| # | Rule | Scenario | Expected | Phase | Status |
|---|---|---|---|---|---|
| T1 | BR7/BR8 | Reference format + per-(warehouse,op) sequence, parallel requests | `WH/IN/0001`, unique under concurrency, other op type restarts at 1 | 2 | ✅ integration (`reference generator` test) |
| T2 | BR11 | `freeToUse` with and without reservations | `freeToUse = onHand − reserved`, never persisted | 2 | ✅ integration (engine invariants) |
| T3 | BR12 | Receipt validation increases stock + writes 1 IN ledger row | stock += qty; ledger direction IN, to=location | 3 | ✅ Phase 3 (`phase3` receipt lifecycle test) |
| T4 | BR13 | Delivery validation below zero | `CONFLICT`, no stock/ledger change, caller keeps WAITING | 3 | ✅ Phase 3 (WAITING validate 409 + atomicity test) |
| T5 | BR14 | Transfer A→B | A −qty, B +qty, system total unchanged | 3/4 | engine ✅ (`transfer` test) |
| T6 | BR14/16 | Transfer ledger legs | exactly 2 rows per line: OUT (from A to B) + IN (from A to B) | 4 | engine ✅ (legs assertion) |
| T7 | BR15 | Adjustment delta > 0 / < 0 / = 0 | sets counted qty; ledger IN / OUT / none; direction = sign | 2 | ✅ integration (stock edit + delta-0 test) |
| T8 | BR16 | Ledger append-only | no API can update/delete `stock_ledger` | 2–4 | ✅ by construction (no endpoints) |
| T9 | BR17 | Delivery WAITING when any line qty > freeToUse | status WAITING on create/edit/stock change | 3 | ✅ Phase 3 (create/PATCH re-evaluation + receipt recheck tests) |
| T10 | BR18 | Out-of-stock line flagged | `outOfStock: true` per delivery line | 3 | ✅ Phase 3 (detail flag test, own-reservation offset) |
| T11 | BR25 | Cancel only from DRAFT/WAITING/READY | `DONE` documents cannot be canceled (`CONFLICT`) | 3/4 | receipts/deliveries ✅ Phase 3; transfers Phase 4 |
| T12 | BR27 | Line quantity must be > 0 | `VALIDATION_ERROR` with `fields.lines` | 3/4 | ✅ Phase 3 (`moveLinesSchema` + DB `CHECK (quantity > 0)`) |

## Phase 2 executable evidence

`backend/tests/integration/phase2.integration.test.ts`:
- product initial stock → stock row + `WH*/ADJ/0001` reference + IN ledger + DONE move (T1/T3/T7)
- manual stock edit → OUT ledger delta, delta-0 no-op, negative rejected (T7)
- engine increase/decrease/CONFLICT/transfer/reserve/release (T2/T4/T5/T6)
- reference concurrency (T1)

## Phase 3 additions — completed

Implemented in `backend/tests/integration/phase3.integration.test.ts` (Person 4 harness) and
`frontend/src/pages/operations/{ReceiptsPage,DeliveriesPage}.test.tsx`:

1. ✅ Receipt validate atomicity: mid-transaction failure rolls back every line's stock + ledger
   and leaves the document Ready (BR12, R5.3).
2. ✅ Delivery WAITING re-evaluation on edits and on stock-changing events (receipt validation,
   manual adjustments) with FIFO promotion (BR17, R6.12).
3. ✅ Out-of-stock red-line payload with own-reservation offset (BR18, R6.11).
4. ✅ Cancel guards for receipts/deliveries; reservation release on cancel (BR25/BR26).
5. ✅ Line-quantity validation per document create/patch + DB CHECK constraint (BR27).
6. ✅ Delivery multi-line validate atomicity (decrease + reservation release in one transaction).
7. ✅ Reservation lifecycle: reserve on DRAFT/READY, release on validate/cancel, WAITING holds
   none (`PHASE3_DECISIONS.md` §1).
