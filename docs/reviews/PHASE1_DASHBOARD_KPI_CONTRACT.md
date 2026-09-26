# Phase 1 — Dashboard KPI Query Contract Draft (Person 4 deliverable)

> `08_PHASE_PLAN.md` Phase 1 §6: "Draft Dashboard KPI query contract (`05_API_CONTRACTS.md` §5)
> for Person 1/Person 3 to build against in Phase 2/3 — contract only, no implementation yet."

**Owner:** Person 4 (Operations / Integration / QA)
**Endpoint:** `GET /api/v1/dashboard/kpis?warehouseId=&locationId=&categoryId=` — full response
shape frozen in `05_API_CONTRACTS.md` §5. This note pins the aggregation semantics so the
Phase 2 implementation and the Phase 2 UI mocks agree.

## Field definitions

| Field | Definition (draft) | Source | Rule |
|---|---|---|---|
| `totalProductsInStock` | count of distinct products with `stock.on_hand_qty > 0` in scope | `stock` | R2.2 |
| `lowStockCount` | distinct products where SUM(`on_hand_qty`) across locations `<= reorder_min`, only products with `reorder_min` set | `products` + `stock` | BR22 |
| `pendingReceipts` | count of `stock_moves` `type=RECEIPT`, `status NOT IN (DONE, CANCELED)` | `stock_moves` | R2.4 |
| `pendingDeliveries` | count of `stock_moves` `type=DELIVERY`, `status NOT IN (DONE, CANCELED)` | `stock_moves` | R2.5 |
| `internalTransfersScheduled` | count of `stock_moves` `type=TRANSFER`, `status NOT IN (DONE, CANCELED)` | `stock_moves` | R2.6 |
| `receiptSummary.toReceive` | count of open receipts with `schedule_date <= today` — **TBD, see open question 1** | `stock_moves` | R2.11 |
| `receiptSummary.late` | `schedule_date < today AND status NOT IN (DONE, CANCELED)` | `stock_moves` | R2.13 / BR19 |
| `receiptSummary.operations` | `schedule_date > today AND status NOT IN (DONE, CANCELED)` | `stock_moves` | R2.14 / BR20 |
| `deliverySummary.toDeliver` | same shape as `toReceive`, `type=DELIVERY` | `stock_moves` | R2.12 |
| `deliverySummary.late` | `schedule_date < today AND status NOT IN (DONE, CANCELED)` | `stock_moves` | R2.13 / BR19 |
| `deliverySummary.waiting` | count of deliveries with `status = WAITING` | `stock_moves` | R2.15 / BR21 |
| `deliverySummary.operations` | `schedule_date > today AND status NOT IN (DONE, CANCELED)` | `stock_moves` | R2.14 / BR20 |

**Filters:** `warehouseId` scopes by `stock_moves.warehouse_id` (receipts/deliveries/transfers)
and by `locations.warehouse_id` for stock-based KPIs; `locationId` scopes stock KPIs by
location and moves by `from_location_id`/`to_location_id`; `categoryId` scopes
`products.category_id`. Combination semantics (AND across filters) to be confirmed at
Phase 2 kickoff.

## Open questions (flag, do not silently choose)

1. **`toReceive` / `toDeliver` boundary.** The mockup (IMG:12) shows "N to receive" next to
   `Late` and `operations`, which split on `schedule_date` vs today. The docs define only
   `Late` and `operations`; "to receive" is unspecified. Draft assumption: **open documents
   due today or earlier** (`schedule_date <= today AND status NOT IN (DONE, CANCELED)`), so
   `late + today = toReceive`. Alternative: all open documents. Decide with Person 1/P3 at
   Phase 2 kickoff and update `05_API_CONTRACTS.md` §5 if needed.
2. **`totalProductsInStock` scope** — products with stock > 0 per the definition above vs.
   count of all products with any stock row (including zero). Mockup language "Total Products
   in Stock" favors the former.
3. **Index support** — `04_DATABASE_SCHEMA.md` already plans
   `stock_moves(status, schedule_date)`; Phase 2 migration must include it before this
   endpoint is implemented.

## Phase ordering note

`stock_moves`/`stock_ledger` are typed in the schema now but stay empty until Phase 3, so the
Phase 2 implementation is built and tested against the canonical seed script
(`11_TESTING_STRATEGY.md`), then regression-checked against real Phase 3 data.
