# Phase 4 — Decisions (Transfers, Adjustments, Move History, Settings/Profile)

> Final-phase kickoff decisions. Resolves the open items carried from Phase 3
> (`PHASE3_DECISIONS.md` §1 transfer reservations) and records every contract/schema
> amendment made while implementing §8/§9/§10.

**Owners:** Person 1 (backend), Person 3 (domain), Person 4 (integration/QA).

## 1. Transfer reservation lifecycle (final decision — no new schema required)

`04_DATABASE_SCHEMA.md` defines `reserved_qty` as "allocated to open Delivery/Transfer lines"
and `07_STATUS_WORKFLOWS.md` states that transfers have **no WAITING state**: when a line
exceeds `free_to_use`, the MVP behavior is to **block with `CONFLICT`** instead of introducing
a waiting state. Phase 4 implements exactly that with the existing reserve/release primitives:

| Moment | Behavior |
|---|---|
| Create (`POST /transfers`) | document is `DRAFT`; **no reservation** — a Draft is a plan and may reference stock that is not available yet |
| `POST /transfers` on insufficient stock | still `201 DRAFT`; the block happens at confirm/validate exactly as 07 documents |
| Confirm (`DRAFT → READY`) | atomically reserve the full line quantities at `from_location_id`; if any line exceeds `free_to_use`, return `CONFLICT` and stay `DRAFT` (the documented 07 blocking point) |
| Validate (`READY → DONE`) | release the document's reservation, then move every line with the stock-engine's two-leg `transfer()` in ONE transaction (source OUT + destination IN ledger rows per line, BR14/BR16) |
| Edit (`PATCH`) while `DRAFT` | lines/fields replaced freely (no reservation held yet) |
| Edit (`PATCH`) while `READY` | release the old reservation and reserve the new lines in the same transaction; if the new lines do not fit, `CONFLICT` and the old document/reservation survive (READY always holds a full reservation) |
| Cancel (`DRAFT`/`READY`) | release the reservation if READY holds one; `CANCELED`; **no ledger rows** (BR25/BR26) |

Consequences: `READY` always means "stock is reserved and the transfer can be validated";
`DRAFT` may be unreserved; no `WAITING` status is introduced (07 open decision honored);
the total-system-stock invariant (BR14) holds because validate uses the engine's atomic
two-leg move. Transfers never promote Delivery WAITING states (they consume, not create,
stock); the Phase 3 recheck hooks are unchanged.

## 2. Adjustment behavior (final decision)

- `POST /adjustments` is single-step (`adjust-1`): counted quantity replaces the recorded
  quantity immediately, the document is `DONE`, and the Phase 2/3 `applyStockAdjustment`
  orchestration (stock-engine, BR15) is reused — no second stock write path.
- **Zero delta:** the explicit adjustment form still creates a `DONE` `ADJUSTMENT` document
  (reference + note) for the audit trail, but **no `stock_move_line` and no `stock_ledger`
  row** — BR15 says only that no ledger row is written, and `stock_move_lines.quantity > 0`
  makes a zero line impossible. The Phase 2 `PATCH /stock` delta-0 no-op behavior is
  unchanged (documented in `PHASE2_DECISIONS.md` §6); this difference is intentional: the
  form records "I counted this and it matched".
- The reservation guard from `PHASE3_DECISIONS.md` §7 still applies (counted quantity may not
  be set below the location's `reserved_qty` → `CONFLICT`), and every adjustment triggers the
  WAITING-delivery recheck.
- No cancel/patch endpoints: `CANCELED` is not applicable to adjustments (07).

## 3. Move History semantics (final decision)

- One row per `stock_ledger` row (R9.3); nothing is stored separately.
- Response item = §10 fields (`reference`, `date`, `contactName`, `from`, `to`, `productName`,
  `quantity`, `direction`, `status`) plus additive `id`, `type`, `productId`, `sku`, `movedAt`
  (documented in 05 §10) so the UI can render type badges/keys.
- `from`/`to` labels per document type: Receipt = supplier name / destination location;
  Delivery = source location / customer name; Transfer = source location / destination
  location; Adjustment = location on the stock side and `"Inventory adjustment"` on the
  missing side. Missing labels fall back to `"Vendor"`/`"Customer"`.
- Filters (§10 amendment): `search` (reference, product name/SKU, contact name), `type`,
  `direction` (IN/OUT), `status` (parent move status — ledger rows are always produced by DONE
  moves per BR16), `productId`, `warehouseId`, `locationId` (either leg), `dateFrom`/`dateTo`
  (ledger `moved_at` date, inclusive), plus `page`/`pageSize`.
- Kanban groups by **direction** (`IN`/`OUT`), resolving the Phase 1 open decision; IN rows
  render green and OUT rows red (R9.4/R9.5).

## 4. Database — one additive Phase 4 migration

Every Phase 4 document is a `stock_moves` row and every movement is a `stock_ledger` row, so no
new tables were required. One additive migration **`phase4_adjustment_counts`** adds nullable
`recorded_quantity` / `counted_quantity` (`numeric(14,3)`) to `stock_moves`: the adjustment
list/detail must report both quantities truthfully after the fact, and they cannot be
reconstructed from the line quantity alone. Both are set by `applyStockAdjustment` (initial
stock, `PATCH /stock`, and §9 adjustments); they stay `NULL` for other document types.
Existing indexes `stock_ledger(product_id, moved_at)` / `stock_ledger(reference)` continue to
serve the Move History filters; no new index was needed.

## 5. Settings & Profile backend — already complete

Warehouse/Location CRUD (§4) shipped in Phase 2 and Profile endpoints (`GET/PATCH /auth/me`)
shipped in Phase 1. Phase 4 adds **no backend endpoints** for these areas; it only builds the
Profile screen and reuses the Settings screens. Low-stock alerting (BR22) is already exposed
through the Dashboard `lowStockCount` KPI; the optional `GET /products?lowStock=true` filter is
deliberately omitted (explicitly optional in 08_PHASE_PLAN Phase 4 §3).

## 6. §8/§9/§10 contract amendments (additive only)

- §8: list adds `warehouseId`/`page`/`pageSize`; detail adds `warehouseId`, location names,
  `responsibleUserName`, `validatedAt`, `createdAt`, `note`; create returns the full detail;
  `fromLocationId ≠ toLocationId` validated (`VALIDATION_ERROR`).
- §9: list/get return the §9 fields plus `productName`, `sku`, `locationName`, `scheduleDate`/
  `movedAt`, `note`; `reference` is `null` only for `PATCH /stock` delta-0 no-ops (the explicit
  form always has a reference). Filters: `search`, `warehouseId`, optional `status`.
- §10: filters and additive fields as in §3 above.
