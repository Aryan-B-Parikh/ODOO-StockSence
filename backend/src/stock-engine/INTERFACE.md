# Stock-engine interface

**Status:** Phase 2 — implemented (`stock-engine.ts`, `reference.ts`, `adjustment.ts`).
**Implemented by:** Person 1. **Domain contract drafted by:** Person 3 (Phase 1).
**Consumers:** catalog/stock modules (Phase 2), receipts/deliveries/transfers/adjustments
(Phase 3/4), dashboard/move-history reads (Person 4).

Types live in `interface.ts`. Every method accepts an optional `db` handle
(`PrismaClient` or an open `$transaction` client) so multi-line document validation can run the
status transition, all stock changes and all ledger rows in ONE transaction.

## Function contracts

| Function | Business rule | Transaction semantics |
|---|---|---|
| `getStock(productId, locationId, db?)` | BR11 (`freeToUse = onHand - reserved`, computed) | read-only |
| `increaseOnHand({ productId, locationId, quantity, move }, db?)` | BR12 (receipt validation) | atomic upsert + increment; writes 1 IN `stock_ledger` row |
| `decreaseOnHand({ productId, locationId, quantity, move }, db?)` | BR13 (delivery validation) | atomic conditional decrement; writes 1 OUT ledger row; `CONFLICT` if on-hand would go below 0 |
| `transfer({ productId, fromLocationId, toLocationId, quantity, move }, db?)` | BR14 + BR16 | atomic source decrement + destination increment; 2 ledger rows (OUT + IN legs); `CONFLICT` when free-to-use is short |
| `setOnHandFromCount({ productId, locationId, countedQuantity, move? }, db?)` | BR15 | sets `on_hand_qty = countedQuantity`; 1 ledger row when `delta ≠ 0` (none when `delta = 0`) |
| `reserve(...)` / `releaseReservation(...)` | BR11/BR17 primitives | atomic conditional `reserved_qty` update; no ledger rows (reservations do not move stock) |
| `ReferenceGenerator.next(warehouseId, op, db?)` | BR7–BR9 | single-statement atomic upsert of `sequence_counters`, formatted as `<WH>/<OP>/0001` |

## Phase 2 decisions

1. **`reserved_qty` stays 0 in Phase 2.** No Phase 2 endpoint creates reservations, so
   `freeToUse == onHand` throughout the Phase 2 UI. The reserve/release primitives exist and are
   tested; the *policy* for when open Delivery/Transfer lines reserve stock remains an open
   question for Phase 3 kickoff (BR11 defines the formula, BR17 defines the waiting check, but
   no rule states when a reservation is taken/released).
2. **Initial stock and manual stock edits are `ADJUSTMENT` stock_moves** (status `DONE`) created
   by `applyStockAdjustment()`, so every `stock_ledger.stock_move_id` points at a real document
   (BR16) and the reference pattern `<WH>/ADJ/<seq>` applies (BR7). `PATCH /stock` documents this
   in 05 §3; product `initialStock` reuses the same mechanism (05 §2).
3. **Delta 0 is a no-op for the ledger** (BR15) — the stock row is still ensured so the
   product/location pair stays visible in the Stock tab.

## Sign-off

- [x] Person 1 implementation matches the Phase 1 signatures + documented `db` extension.
- [x] Person 3 BR mapping verified by the Phase 2 integration tests
  (`backend/tests/integration/phase2.integration.test.ts`, engine invariants test).
