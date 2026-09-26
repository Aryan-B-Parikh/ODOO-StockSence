# Phase 3 — Decisions & Amendments (Receipts + Deliveries)

> Phase 3 kickoff deliverable. Resolves the open items carried from Phase 2
> (`PHASE2_CONTRACTS_REVIEW.md` §4, `PHASE2_STOCK_TEST_MATRIX.md`) and records every
> contract/schema amendment made while implementing §6/§7.

**Owners:** Person 1 (backend/db), Person 3 (domain), Person 4 (integration/QA).

## 1. Reservation lifecycle (final decision)

`04_DATABASE_SCHEMA.md` defines `stock.reserved_qty` as "allocated to open Delivery/Transfer
lines" and `06_BUSINESS_RULES.md` BR11 defines `free_to_use = on_hand_qty - reserved_qty`.
Phase 3 implements exactly that for **Deliveries**, using the existing stock-engine
`reserve`/`releaseReservation` primitives (no new table, no new booking system):

| Moment | Behavior |
|---|---|
| Create delivery, all lines fit in `free_to_use` | reserve `sum(lines per product)` at `from_location_id` → status `DRAFT` |
| Create delivery, any line exceeds `free_to_use` | take **no** reservation → status `WAITING` (BR17/R6.12) |
| Edit (PATCH) not DONE/CANCELED | release the document's old reservation if held → re-evaluate new lines: fit → re-reserve and keep `DRAFT` (was DRAFT) or become `READY` (was WAITING/READY); not fit → release → `WAITING` |
| Validate `DRAFT` | `DRAFT → READY` (first confirm press per 05 §7), reservation already held, **no stock change** |
| Validate `READY` | `READY → DONE`: in ONE transaction, `decreaseOnHand` per line (writes the OUT ledger rows, BR13/BR16) and `releaseReservation` per product. Net effect: `on_hand −= qty`, `reserved −= qty`; `free_to_use` is unchanged by validation |
| Validate `WAITING` | `CONFLICT` — "waiting for stock to become available" (07/BR17); no state change |
| Cancel | release the held reservation (if any); **no ledger rows** (BR25/BR26) |
| Stock becomes available | after any receipt validation or manual adjustment at a location, all `WAITING` deliveries for that location (and product) are re-evaluated **FIFO by creation time**; those that now fit reserve and become `READY` (the 07 "re-evaluation" hook, implemented synchronously in the same transaction) |

`Transfer` reservations were deferred to Phase 4 and are now implemented there:
`docs/reviews/PHASE4_DECISIONS.md` §1 defines them (READY holds the full reservation, taken at
confirm; DRAFT holds none; validate releases then performs the two-leg move; cancel releases).
The cap "reserved ≤ on hand" is enforced by the engine and a DB CHECK constraint (decision 6).

## 2. Own-reservation offset in availability checks

A document's own reservation must never make its lines look short. Availability for a line is
`on_hand − (reserved − ownReservedForProduct)`, where `ownReserved` is the line quantity for
`DRAFT`/`READY` deliveries and 0 for `WAITING`. This formula is used for the `outOfStock`
flag (BR18/R6.11), the WAITING re-check and edit re-evaluation (where the old reservation is
released first, so the offset is naturally 0).

## 3. Delivery "pick → pack → validate" (R6.2, PDF)

The PDF describes the physical process "pick items → pack items → validate"; `07` fixes the
document states to `DRAFT → WAITING → READY → DONE`. To honor both without inventing statuses
or undocumented endpoints:

- the `DRAFT → READY` transition (05 §7 validate first press) is surfaced in the UI as
  **"Pick & Pack"** — completing picking/packing moves the document to `Ready`;
- the `READY → DONE` transition keeps the **"Validate"** label and applies the stock decrease.

No `PICKED`/`PACKED` statuses or extra endpoints are introduced.

## 4. New §4b Contacts endpoints (amendment, required by the workflow)

§6/§7 require `fromContactId`/`toContactId` but the frozen contract had no endpoint to list or
create contacts, so a supplier/customer could not be selected. Phase 3 adds:

- `GET /contacts?type=VENDOR|CUSTOMER&search=` → array of `{ id, name, type, email, phone }`
- `POST /contacts` `{ name, type, email?, phone? }` → 201

Contact validation on documents: Receipt `fromContactId` must exist and be `VENDOR`; Delivery
`toContactId` must exist and be `CUSTOMER` (`VALIDATION_ERROR` with the field otherwise).

## 5. UI deviations (documented)

1. **Responsible user** (IMG:4/5 "auto-filled with the current logged-in user, editable"):
   defaulted to the logged-in user and displayed read-only. The contract exposes no user
   directory to pick another user from; `responsibleUserId` is still accepted by the API for
   future use.
2. **Delivery Address** (IMG:5): the frozen contract models the recipient as `toContactId`, and
   neither `stock_moves` nor `contacts` has an address column. The field is rendered as the
   **customer contact picker** (name + email/phone) instead of free-text address.
3. **Operation type** (IMG:5 "dropdown"): rendered as a text input defaulting to
   "Delivery order" because no option list is documented.

## 6. Document-line schema finalization (BR27)

- Application-level: shared `moveLineInputSchema` requires `quantity > 0` and rejects duplicate
  products in one document; at least one line is required.
- Database-level: migration `phase3_document_constraints` adds
  `CHECK (quantity > 0)` on `stock_move_lines` and the stock invariants
  `on_hand_qty >= 0`, `0 <= reserved_qty <= on_hand_qty` on `stock`. No new tables or columns
  were needed — Phase 2 already shipped the documented `stock_moves`/`stock_move_lines` shape.

## 7. Stock-engine adjustment guard (BR15 refinement)

`setOnHandFromCount` now refuses (`CONFLICT`) to set `on_hand_qty` below the location's current
`reserved_qty`, so a manual adjustment cannot strand open delivery reservations. Manual
adjustments that change stock at a location also trigger the WAITING re-check (decision 1).

## 8. List/filter additions (§6/§7 amendments)

`GET /receipts` and `GET /deliveries` keep the documented `search`/`status`/`page`/`pageSize`
and add optional `warehouseId` (documents belong to a warehouse) so the list screens can scope
by warehouse as required by the Phase 3 UI brief. List/detail DTOs are additive only
(contact email, line `sku`/`uom`, `warehouseId`, `validatedAt`, `responsibleUserName`).

## 9. PATCH semantics

- Receipt: editable while `DRAFT`/`READY` (05 §6), partial body; lines replaced when provided.
- Delivery: editable while not `DONE`/`CANCELED` (05 §7), partial body; lines replaced and
  reservations re-synced when provided.
- Changing the location on PATCH updates the document's from/to location, but the document's
  `warehouse_id` and reference stay as assigned at creation (BR9 immutability).
