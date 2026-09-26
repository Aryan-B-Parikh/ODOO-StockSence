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
### `GET /stock?search=&locationId=&warehouseId=`
Res 200: list of `{ productId, productName, sku, costPerUnit, locationId, onHand, reserved,
freeToUse }` (`freeToUse = onHand - reserved`, IMG:13).

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

---

## §5. Dashboard (Owner: Person 4, consumes Person 1 + Person 3 data) — Phase 2/3
### `GET /dashboard/kpis?warehouseId=&locationId=&categoryId=`
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
### `GET /receipts?search=&status=&page=&pageSize=`
Res 200 item: `{ id, reference, fromContactId, fromContactName, toLocationId, toLocationName,
scheduleDate, status, responsibleUserId }`

### `POST /receipts`
Req: `{ fromContactId, toLocationId, scheduleDate, responsibleUserId?, lines: [{ productId, quantity }] }`
Res 201: full receipt incl. generated `reference` (Draft status).

### `GET /receipts/:id` — full detail incl. `lines: [{ id, productId, productName, quantity }]`.

### `PATCH /receipts/:id` — edit fields/lines while status is `DRAFT` or `READY`.

### `POST /receipts/:id/confirm` — Draft → Ready (R5.11).

### `POST /receipts/:id/validate` — Ready → Done; **increments stock** at `toLocationId` for each
line via the stock-engine, writes `stock_ledger` rows (R5.3, R5.11).

### `POST /receipts/:id/cancel` — → Canceled (from Draft/Ready only).

### `GET /receipts/:id/print` — returns a print-ready payload/PDF once status = Done (R5.12).

---

## §7. Deliveries (Owner: Person 3) — Phase 3
### `GET /deliveries?search=&status=`
Res 200 item: `{ id, reference, fromLocationId, fromLocationName, toContactId, toContactName,
scheduleDate, status, operationType }`

### `POST /deliveries`
Req: `{ fromLocationId, toContactId, scheduleDate, operationType, responsibleUserId?,
lines: [{ productId, quantity }] }`
Res 201: full delivery (status auto-computed: `DRAFT`, or `WAITING` if any line exceeds
`freeToUse` at `fromLocationId` — R6.12).

### `GET /deliveries/:id` — full detail incl. lines, each line flagged `{ ..., outOfStock: bool }`
for red-row rendering (R6.11).

### `PATCH /deliveries/:id` — edit while not Done/Canceled; re-evaluates Waiting status.

### `POST /deliveries/:id/validate` — → Ready first-time confirm, or Ready → Done depending on
current state (see `07_STATUS_WORKFLOWS.md` for exact transition table); on Done,
**decrements stock** at `fromLocationId` (R6.3).

### `POST /deliveries/:id/cancel`

### `GET /deliveries/:id/print`

---

## §8. Internal Transfers (Owner: Person 3) — Phase 4
### `GET /transfers?search=&status=`
Res 200 item: `{ id, reference, fromLocationId, toLocationId, scheduleDate, status }`

### `POST /transfers`
Req: `{ fromLocationId, toLocationId, scheduleDate, responsibleUserId?,
lines: [{ productId, quantity }] }`

### `GET /transfers/:id`, `PATCH /transfers/:id`

### `POST /transfers/:id/confirm` — Draft → Ready

### `POST /transfers/:id/validate` — Ready → Done; decrements stock at `fromLocationId` and
increments stock at `toLocationId` in the same transaction (R7.2); writes two `stock_ledger`
rows per line (one OUT, one IN) so Move History can display both legs (R9.4/R9.5).

### `POST /transfers/:id/cancel`

---

## §9. Stock Adjustments (Owner: Person 3) — Phase 4
### `GET /adjustments?search=&status=`
### `POST /adjustments`
Req: `{ productId, locationId, countedQuantity, note? }`
Res 201: `{ id, reference, productId, locationId, recordedQuantity, countedQuantity, delta,
status: "DONE" }` — applied immediately per R8.3 (no separate validate step, see R8 open
decision); writes one `stock_ledger` row with `direction` derived from the sign of `delta`.

### `GET /adjustments/:id`

---

## §10. Move History (Owner: Person 4, read-only over `stock_ledger`) — Phase 4
### `GET /move-history?search=&status=&type=&page=&pageSize=`
Res 200 item (one row per product line, R9.3):
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
