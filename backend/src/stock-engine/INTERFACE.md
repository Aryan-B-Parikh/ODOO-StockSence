# Stock-engine interface (Phase 1 draft)

**Status:** drafted by Person 3, Phase 1 — signatures only, no implementation.
**Implementation owner:** Person 1, Phase 2 (`backend/src/stock-engine/`).
**Consumers:** Person 3's receipts/deliveries/transfers/adjustments modules (Phase 3/4),
Person 4's dashboard/move-history reads (Phase 4).

Types live in `interface.ts`. This document is the review artifact required by
`08_PHASE_PLAN.md` Phase 1 §5 ("Draft the shared stock-engine interface … that Person 1
will build in Phase 2").

## Function contracts

| Function | Business rule | Transaction semantics |
|---|---|---|
| `getStock(productId, locationId)` | BR11 (`freeToUse = onHand - reserved`, computed) | read-only |
| `increaseOnHand({ productId, locationId, quantity, move })` | BR12 (receipt validation) | increments `stock.on_hand_qty`; writes 1 IN `stock_ledger` row; same transaction as the move's status transition |
| `decreaseOnHand({ productId, locationId, quantity, move })` | BR13 (delivery validation) | decrements `stock.on_hand_qty`; writes 1 OUT ledger row; throws `CONFLICT` if on-hand would go below 0 |
| `transfer({ productId, fromLocationId, toLocationId, quantity, move })` | BR14 + BR16 | decrement + increment in **one** DB transaction; writes 2 ledger rows per line (OUT + IN legs); total stock unchanged |
| `setOnHandFromCount({ productId, locationId, countedQuantity, move })` | BR15 | sets `on_hand_qty = countedQuantity`; 1 ledger row when `delta ≠ 0`, none when `delta = 0` |
| `reserve(...)` / `releaseReservation(...)` | BR11/BR17 support | open question, see below |

## Reference generator (`sequence` module)

`ReferenceGenerator.next(warehouseId, operationType)` implements BR7–BR9:
`<WarehouseShortCode>/<OP>/<0001>`, `OP ∈ {IN, OUT, INT, ADJ}`, atomic increment of
`sequence_counters.last_number` in the same transaction as document creation, immutable and
never reused (including after Cancel).

## Open questions for Person 1 / Phase 3 kickoff

1. **`reserved_qty` lifecycle is unspecified.** `04_DATABASE_SCHEMA.md` defines `reserved_qty`
   as "allocated to open Delivery/Transfer lines" and BR11 defines the `freeToUse` formula,
   but no BR states exactly when a reservation is created, when it is released, or whether
   Delivery `WAITING` uses `on_hand` or `freeToUse` (BR17 says `freeToUse`). Phase 1 decision:
   `reserved_qty` stays 0 until Person 1/Person 3 agree on the lifecycle at Phase 3 kickoff.
   Flagged, not silently chosen.
2. **Delivery validate on insufficient stock (BR13) vs WAITING (BR17).** Interface returns a
   `CONFLICT` error; Phase 3 must confirm the caller keeps the move in `WAITING` rather than
   rolling it back to a broken state.
3. **Adjustment ledger `moved_at`.** Adjustments have no `validated_at` transition, so the
   caller passes `movedAt` explicitly.

## Sign-off

- [ ] Person 1 (implementation owner) confirms signatures before Phase 2 stock-engine work
- [ ] Person 3 (domain owner) confirms BR mapping before Phase 3 receipts/deliveries work
