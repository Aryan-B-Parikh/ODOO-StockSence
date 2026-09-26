# Phase 2 — Decisions & Contract Amendments (resolution of Phase 1 review items)

> These decisions resolve the ambiguities flagged in
> `docs/reviews/PHASE1_SCHEMA_CONTRACT_REVIEW.md` and
> `docs/reviews/PHASE1_DASHBOARD_KPI_CONTRACT.md`, plus new Phase 2 additions. They are
> recorded here and in `14_CHANGELOG.md` rather than silently chosen.

**Owners:** Person 1 (backend/db), Person 3 (domain rules), Person 4 (KPI/QA).

## 1. Dashboard `toReceive` / `toDeliver` boundary (resolves KPI open question 1)

Decision: **`toReceive = open documents with schedule_date <= today`** (same for `toDeliver`).
Combined with BR19 (`late = schedule_date < today`) and BR20 (`operations = schedule_date > today`)
this makes the three counts a disjoint partition of the open document set, matching the mockup's
side-by-side presentation (IMG:12). To be revisited only if the team prefers "all open".

## 2. `totalProductsInStock` semantics (resolves KPI open question 2)

Decision: **count of distinct products whose summed `on_hand_qty` across the filtered scope is
> 0** ("products in stock"). A product with only zero rows (e.g. Wood Screw in the seed) is not
counted. `lowStockCount` follows BR22 exactly: products with `reorder_min` set whose summed
on-hand `<= reorder_min` (includes out-of-stock products when the threshold is set).

## 3. Dashboard dynamic filters `type` / `status` (R2.7/R2.8; 05 §5 amendment)

Decision: `GET /dashboard/kpis` accepts optional `type` (RECEIPT|DELIVERY|TRANSFER|ADJUSTMENT) and
`status` (DRAFT|WAITING|READY|DONE|CANCELED) in addition to the documented
`warehouseId`/`locationId`/`categoryId`. Semantics: **every returned count is computed over the
moves matching all supplied filters**. When `status` is supplied it replaces the default
"open = NOT IN (DONE, CANCELED)" predicate, so the filter genuinely changes the numbers shown.
Stock-based KPIs (`totalProductsInStock`, `lowStockCount`) are not status/type-scoped because
stock is not a document.

## 4. Stock list additive fields (R4.6/R2.3/R11.1; 05 §3 amendment)

Decision: each `GET /stock` row additionally returns `reorderMin`, `lowStock` and `outOfStock`.
`lowStock`/`outOfStock` use the product-level BR22 rule (summed across locations), so the Stock
tab badges always agree with the Dashboard KPI. `reserved`/`freeToUse` remain per location.

## 5. Location display in the Stock tab

Decision: `GET /stock` keeps the documented `locationId`-only shape (05 §3). The Stock tab joins
`GET /locations` client-side to render location names/filters, avoiding another contract field.

## 6. Initial stock + manual stock edits as `ADJUSTMENT` documents

Decision: both product `initialStock` (05 §2) and `PATCH /stock/:productId/:locationId` (05 §3)
create a DONE `ADJUSTMENT` `stock_move` via the stock-engine before applying the count. This keeps
`stock_ledger.stock_move_id` non-null (04 schema) and every ledger row traceable to a document
(BR16, R11.4). A delta of 0 writes no ledger row and no move (BR15).

## 7. `stock_moves.note` column (04 schema addition)

Decision: `PATCH /stock` accepts a `note` (05 §3) and the Phase 4 Adjustment form has an optional
reason (02 UI spec), but the Phase 1 schema had nowhere to store it. Added nullable `note text` to
`stock_moves`; documented in `04_DATABASE_SCHEMA.md`. Auth data is untouched by the migration.

## 8. `created_at` consistency (resolves review item 4)

Decision: `categories`, `stock` and `sequence_counters` get `created_at` (the schema preamble says
all tables have it) and `stock`/`locations` etc. get `updated_at` where rows are updated. No
behavioral impact; aligns the migration with the preamble.

## 9. List response shapes (05 §0 application)

Decision: paginated lists (`/products`, `/stock`) use the `{ data, total, page, pageSize }`
envelope from 05 §0. Configuration lists without pagination in the contract (`/warehouses`,
`/locations`, `/categories`) return plain arrays. The MSW fixtures mirror both.

## 10. Low-stock / out-of-stock definitions used by the UI

- **Low**: `reorder_min` set and product total on-hand `<= reorder_min` (BR22).
- **Out of stock**: product total on-hand `<= 0` (displayed independently of the threshold).
Both are exposed per stock row and counted together by the `lowStockCount` KPI (R2.3).

## 11. Ops-submenu screens remain Phase 3/4 placeholders

The Dashboard links/quick actions (R2.16/R2.17) point at the existing routes; those screens keep
their "Ships in Phase N" placeholders in Phase 2 (08_PHASE_PLAN.md Phase 2, Person 2 task).
