# 05 — API Contracts

Base URL: `/api/v1`. All requests/responses are JSON. All routes except `/auth/*` require
`Authorization: Bearer <jwt>`.

These contracts are **frozen at the start of each phase** (see `08_PHASE_PLAN.md`) so Person 2
and Person 3 can build against mocks without waiting for Person 1/3's real implementation.

## §0. Common conventions
**Error shape (all endpoints):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR | NOT_FOUND | UNAUTHORIZED | CONFLICT | INTERNAL",
    "message": "Human readable message",
    "fields": { "email": "Email already in use" }
  }
}
```
**List response shape:**
```json
{ "data": [ /* items */ ], "total": 42, "page": 1, "pageSize": 20 }
```
**IDs** are UUID strings. **Dates** are ISO-8601 (`YYYY-MM-DD` for `schedule_date`,
full timestamp for `created_at` etc.).

---

## §1. Auth (Owner: Person 1) — Phase 1
### `POST /auth/signup`
Req: `{ "loginId": "string(6-12)", "email": "string", "password": "string", "confirmPassword": "string" }`
Res 201: `{ "id": "uuid", "loginId": "...", "email": "..." }`
Errors: `VALIDATION_ERROR` (fields: loginId, email, password) per R1.2–R1.5.

### `POST /auth/login`
Req: `{ "loginId": "string", "password": "string" }`
Res 200: `{ "token": "jwt", "user": { "id", "loginId", "email", "displayName" } }`
Errors: `UNAUTHORIZED` → `{ "message": "Invalid Login Id or Password" }` (R1.7).

### `POST /auth/otp/request`
Req: `{ "loginIdOrEmail": "string" }` → Res 200: `{ "message": "OTP sent" }`
(MVP: OTP also returned in response body behind a `debugOtp` field when `NODE_ENV!=production` —
see `03_ARCHITECTURE.md` OPEN DECISION on OTP delivery.)

### `POST /auth/otp/verify-reset`
Req: `{ "loginIdOrEmail": "string", "otp": "string", "newPassword": "string", "confirmPassword": "string" }`
Res 200: `{ "message": "Password reset successful" }`

### `GET /auth/me`
Res 200: `{ "id", "loginId", "email", "displayName", "role" }`

### `PATCH /auth/me`
Req: `{ "displayName"?, "oldPassword"?, "newPassword"?, "confirmPassword"? }` → Res 200: updated user.

---

## §2. Catalog — Products & Categories (Owner: Person 1) — Phase 2
### `GET /products?search=&categoryId=&page=&pageSize=`
Res 200: list of `{ id, name, sku, categoryId, categoryName, uom, costPerUnit, reorderMin, reorderMax }`

### `POST /products`
Req: `{ name, sku, categoryId?, uom, costPerUnit?, reorderMin?, reorderMax?, initialStock?: { locationId, quantity } }`
Res 201: product object. Errors: `VALIDATION_ERROR` (sku uniqueness).

### `PATCH /products/:id` — partial update, same fields as POST minus `initialStock`.

### `GET /categories` / `POST /categories` — `{ id, name }`.

---

## §3. Stock (Owner: Person 1) — Phase 2
### `GET /stock?search=&locationId=&warehouseId=&page=&pageSize=`
Res 200: `{ data, total, page, pageSize }` (§0 envelope) where each item is
`{ productId, productName, sku, costPerUnit, locationId, onHand, reserved, freeToUse, reorderMin,
lowStock, outOfStock }` (`freeToUse = onHand - reserved`, IMG:13).

> **Phase 2 amendment (see `docs/reviews/PHASE2_DECISIONS.md` §4):** `reorderMin`, `lowStock`
> and `outOfStock` are additive fields added so the Stock tab can render low/out-of-stock badges
> (R2.3/R11.1). `lowStock`/`outOfStock` use the BR22 product-level rule (summed across locations):
> `lowStock = reorderMin != null && totalOnHand <= reorderMin`, `outOfStock = totalOnHand <= 0`.

### `PATCH /stock/:productId/:locationId`
Manual stock edit from the Stock tab (R4.7). Internally creates a `stock_ledger` entry of type
`ADJUSTMENT` — **never** writes `stock.on_hand_qty` directly from any other module (see
`03_ARCHITECTURE.md` "stock-engine" rule).
Req: `{ "onHand": number, "note"?: string }` → Res 200: updated stock row.

---

## §4. Warehouses & Locations (Owner: Person 1) — Phase 2
### `GET /warehouses` / `POST /warehouses` / `PATCH /warehouses/:id`
`{ id, name, shortCode, address }`

### `GET /locations?warehouseId=` / `POST /locations` / `PATCH /locations/:id`
`{ id, warehouseId, name, shortCode }`

### §4b. Contacts (Phase 3 addition — see `docs/reviews/PHASE3_DECISIONS.md` §4)

> §6/§7 require `fromContactId`/`toContactId` but the frozen contract had no way to list or
> create contacts. Phase 3 adds:

### `GET /contacts?type=VENDOR|CUSTOMER&search=`
Res 200: array of `{ id, name, type, email, phone }` (ordered by name).

### `POST /contacts`
Req: `{ name, type, email?, phone? }` → Res 201: `{ id, name, type, email, phone }`.
Errors: `VALIDATION_ERROR` (fields: name, type, email).

---

## §5. Dashboard (Owner: Person 4, consumes Person 1 + Person 3 data) — Phase 2/3
### `GET /dashboard/kpis?warehouseId=&locationId=&categoryId=&type=&status=`

> **Phase 2 amendment (see `docs/reviews/PHASE2_DECISIONS.md` §3):** `type`
> (`RECEIPT|DELIVERY|TRANSFER|ADJUSTMENT`) and `status`
> (`DRAFT|WAITING|READY|DONE|CANCELED`) are optional filters implementing the R2.7/R2.8 dynamic
> filters. Every count is computed over the moves matching all supplied filters; an explicit
> `status` replaces the default open predicate (`NOT IN (DONE, CANCELED)`).

Res 200:
```json
{
  "totalProductsInStock": 120,
  "lowStockCount": 4,
  "pendingReceipts": 4,
  "pendingDeliveries": 4,
  "internalTransfersScheduled": 2,
  "receiptSummary": { "toReceive": 4, "late": 1, "operations": 6 },
  "deliverySummary": { "toDeliver": 4, "late": 1, "waiting": 2, "operations": 6 }
}
```
Definitions of `late`/`operations`/`waiting` per R2.13–R2.15.

---

## §6. Receipts (Owner: Person 3) — Phase 3
### `GET /receipts?search=&status=&warehouseId=&page=&pageSize=`
Res 200: `{ data, total, page, pageSize }` (§0 envelope). Item:
`{ id, reference, fromContactId, fromContactName, fromContactEmail, toLocationId, toLocationName,
scheduleDate, status, warehouseId, responsibleUserId }`

> **Phase 3 amendment (`PHASE3_DECISIONS.md` §8):** optional `warehouseId` scope filter; list
> items add `fromContactEmail`/`warehouseId` (additive). `search` matches reference or supplier
> name (R5.5).

### `POST /receipts`
Req: `{ fromContactId, toLocationId, scheduleDate, responsibleUserId?, lines: [{ productId, quantity }] }`
Res 201: full receipt incl. generated `reference` (Draft status).

### `GET /receipts/:id` — full detail. Lines:
`[{ id, productId, productName, sku, uom, quantity }]`; detail adds `responsibleUserName`,
`validatedAt`, `createdAt`, `note` (additive, `PHASE3_DECISIONS.md` §8).

### `PATCH /receipts/:id` — edit fields/lines while status is `DRAFT` or `READY`.

### `POST /receipts/:id/confirm` — Draft → Ready (R5.11).

### `POST /receipts/:id/validate` — Ready → Done; **increments stock** at `toLocationId` for each
line via the stock-engine, writes `stock_ledger` rows (R5.3, R5.11).

### `POST /receipts/:id/cancel` — → Canceled (from Draft/Ready only).

### `GET /receipts/:id/print` — once status = Done (R5.12) returns
`{ type: "RECEIPT", reference, status, date, contactName, locationName, lines: [{ productName,
sku, uom, quantity }] }`; `CONFLICT` before Done. (Same shape for deliveries with
`type: "DELIVERY"`.)

---

## §7. Deliveries (Owner: Person 3) — Phase 3
### `GET /deliveries?search=&status=&warehouseId=&page=&pageSize=`
Res 200: `{ data, total, page, pageSize }` (§0 envelope). Item:
`{ id, reference, fromLocationId, fromLocationName, toContactId, toContactName, toContactEmail,
scheduleDate, status, operationType, warehouseId, responsibleUserId }`

> **Phase 3 amendment (`PHASE3_DECISIONS.md` §8):** optional `warehouseId` scope filter; list
> items add `toContactEmail`/`warehouseId` (additive). `search` matches reference or customer
> name (R6.5).

### `POST /deliveries`
Req: `{ fromLocationId, toContactId, scheduleDate, operationType, responsibleUserId?,
lines: [{ productId, quantity }] }`
Res 201: full delivery (status auto-computed: `DRAFT`, or `WAITING` if any line exceeds
`freeToUse` at `fromLocationId` — R6.12).

### `GET /deliveries/:id` — full detail; lines
`[{ id, productId, productName, sku, uom, quantity, outOfStock }]` for red-row rendering (R6.11).
`outOfStock` compares the line against availability **excluding the document's own reservation**
(`PHASE3_DECISIONS.md` §2). Detail adds `responsibleUserName`, `validatedAt`, `createdAt`,
`note` (additive).

### `PATCH /deliveries/:id` — edit while not Done/Canceled; re-evaluates Waiting status.

### `POST /deliveries/:id/validate` — → Ready first-time confirm, or Ready → Done depending on
current state (see `07_STATUS_WORKFLOWS.md` for exact transition table); on Done,
**decrements stock** at `fromLocationId` (R6.3).

### `POST /deliveries/:id/cancel`

### `GET /deliveries/:id/print`

---

## §8. Internal Transfers (Owner: Person 3) — Phase 4
### `GET /transfers?search=&status=&warehouseId=&page=&pageSize=`
Res 200: `{ data, total, page, pageSize }` (§0 envelope). Item:
`{ id, reference, fromLocationId, fromLocationName, toLocationId, toLocationName, scheduleDate,
status, warehouseId, responsibleUserId }`

> **Phase 4 amendment (`PHASE4_DECISIONS.md` §6):** optional `warehouseId` scope filter and
> pagination; item adds location names/`warehouseId` (additive). `search` matches the reference
> or either location name.

### `POST /transfers`
Req: `{ fromLocationId, toLocationId, scheduleDate, responsibleUserId?, lines: [{ productId,
quantity }] }` → Res 201 full transfer, status `DRAFT` (no reservation — a Draft is a plan).
Errors: `VALIDATION_ERROR` when the locations are equal/unknown or a line is invalid (BR27).

### `GET /transfers/:id` — full detail (`lines` with `sku`/`uom`, `responsibleUserName`,
`validatedAt`, `createdAt`, `note`, additive per `PHASE4_DECISIONS.md` §6).

### `PATCH /transfers/:id` — editable while `DRAFT`/`READY`; a READY transfer always keeps a
full reservation: the old one is released and the new lines reserved in one transaction, or
`CONFLICT` when they do not fit.

### `POST /transfers/:id/confirm` — Draft → Ready; **reserves** the line quantities at
`fromLocationId`; `CONFLICT` when any line exceeds `free_to_use` (07 transfer-1, no Waiting
state).

### `POST /transfers/:id/validate` — Ready → Done; releases the reservation, then decrements
stock at `fromLocationId` and increments stock at `toLocationId` in the same transaction (R7.2);
writes two `stock_ledger` rows per line (one OUT, one IN) so Move History can display both legs
(R9.4/R9.5). Total company stock is unchanged (BR14).

### `POST /transfers/:id/cancel` — Draft/Ready only; releases any reservation; no ledger rows
(BR25/BR26). No print endpoint (no mockup for transfer documents).

---

## §9. Stock Adjustments (Owner: Person 3) — Phase 4
### `GET /adjustments?search=&status=&warehouseId=&productId=&locationId=&page=&pageSize=`
Res 200: `{ data, total, page, pageSize }` (§0 envelope). Item:
`{ id, reference, status: "DONE", scheduleDate, movedAt, productId, productName, sku, locationId,
locationName, recordedQuantity, countedQuantity, delta, note }`
(`productName`/`sku`/`locationName`/dates/`note` additive per `PHASE4_DECISIONS.md` §6.)

### `POST /adjustments`
Req: `{ productId, locationId, countedQuantity, note? }`
Res 201: same item shape — applied immediately per R8.3 (no separate validate step, see R8 open
decision); writes one `stock_ledger` row with `direction` derived from the sign of `delta`.
`countedQuantity >= 0`; fails with `CONFLICT` when it is below the location's `reserved_qty`
(open deliveries, `PHASE3_DECISIONS.md` §7). A zero delta is recorded as a `DONE` document with
**no line and no ledger row** (BR15) — see `PHASE4_DECISIONS.md` §2.

### `GET /adjustments/:id`

---

## §10. Move History (Owner: Person 4, read-only over `stock_ledger`) — Phase 4
### `GET /move-history?search=&status=&type=&direction=&productId=&warehouseId=&locationId=&dateFrom=&dateTo=&page=&pageSize=`

> **Phase 4 amendment (`PHASE4_DECISIONS.md` §3):** filters for document `type`, ledger
> `direction` (IN/OUT), `productId`, `warehouseId`, `locationId` (either leg), inclusive
> `dateFrom`/`dateTo` on the ledger date; `search` matches reference, product name/SKU or contact
> name. Response is the §0 paginated envelope. Item adds `id`, `type`, `productId`, `sku`,
> `movedAt` (additive). `from`/`to` are display labels per document type (missing receipt side =
> vendor name, missing delivery side = customer name, adjustment side = "Inventory adjustment").

Res 200 item (one row per ledger entry, R9.3):
```json
{
  "reference": "WH/IN/0001",
  "date": "2026-09-20",
  "contactName": "Azure Interior",
  "from": "vendor",
  "to": "WH/Stock1",
  "productName": "Desk",
  "quantity": 6,
  "direction": "IN",
  "status": "DONE"
}
```

---

## §11. Contract-first mock policy
Every endpoint above must have a **static JSON mock fixture** committed to
`frontend/src/mocks/` before Phase implementation begins (Phase kickoff deliverable — see
`08_PHASE_PLAN.md` and `10_DEPENDENCY_MATRIX.md`). Person 2 wires the UI to these mocks via MSW;
switching from mock to live endpoint is a one-line config change (base URL / MSW toggle), never a
UI rewrite.
