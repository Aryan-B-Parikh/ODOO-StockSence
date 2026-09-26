# Phase 2 — Contracts Freeze & Stock-Engine Sign-off (Person 3)

> `08_PHASE_PLAN.md` Phase 2 §5: finalize §6–§9 contracts so Person 2 can build Phase 3 mocks;
> design the BR12–BR18 test matrix against Person 1's published stock-engine.

**Reviewer:** Person 3 (Inventory Domain)
**Reviewed:** `05_API_CONTRACTS.md` §2–§9, `06_BUSINESS_RULES.md` BR7–BR18, `07_STATUS_WORKFLOWS.md`,
`backend/src/stock-engine/interface.ts` + `INTERFACE.md`, Phase 2 migration.

## 1. §6–§9 contracts — frozen, no changes requested

The Receipt/Delivery/Transfer/Adjustment request/response shapes in `05_API_CONTRACTS.md`
§6–§9 are confirmed as-is for Phase 3/4 implementation. Status transitions remain exactly as
`07_STATUS_WORKFLOWS.md` documents (Receipt/Transfer `DRAFT→READY→DONE`, Delivery
`DRAFT→WAITING→READY→DONE`, Adjustment create→`DONE`).

## 2. Mock fixtures delivered (Phase 3 preparation)

- `frontend/src/mocks/fixtures/operations.ts` — typed fixtures matching §6–§9 shapes for
  receipts/deliveries/transfers/adjustments, including `outOfStock` flags and DONE/DRAFT/READY/
  WAITING examples.
- `frontend/src/mocks/operationsHandlers.ts` — read-only list/detail/print handlers, auth-guarded
  like the live API. Status-transition handlers (`confirm`/`validate`/`cancel`) land with the
  Phase 3 implementation, endpoint by endpoint (08_PHASE_PLAN Phase 3 §9).

## 3. Stock-engine sign-off

- Phase 1 signatures implemented in `backend/src/stock-engine/stock-engine.ts` with one documented
  extension: every method accepts an optional `db` (Prisma client / open transaction) so Phase 3
  validate flows can run the DONE transition + all line movements + ledger writes atomically.
- Atomicity: increments use atomic upserts, decrements/reservations use conditional SQL, so
  concurrent validations cannot drive `on_hand_qty`/`reserved_qty` negative.
- `applyStockAdjustment()` is the shared write path for initial stock and manual stock edits
  (decision 6 in `PHASE2_DECISIONS.md`).
- Engine behavior is covered by the Phase 2 integration test (increase/decrease/CONFLICT/
  transfer two legs/reserve/release) and reference-generation concurrency test.

## 4. Open item carried to Phase 3

`reserved_qty` policy (when open Delivery/Transfer lines take/release reservations) is still
undefined in the docs. Phase 2 keeps `reserved_qty = 0` (so `freeToUse == onHand`); Phase 3
kickoff must decide the reservation lifecycle before Delivery WAITING logic is finalized. This
does not block any Phase 2 behavior.

## Sign-off

- [x] Person 3: §6–§9 frozen; fixtures delivered; engine BR mapping verified.
- [ ] Phase 3 kickoff: reservation lifecycle decision (BR11/BR17).
