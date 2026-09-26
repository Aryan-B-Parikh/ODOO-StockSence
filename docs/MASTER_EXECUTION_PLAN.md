# MASTER EXECUTION PLAN — StockSense IMS

**Purpose of this file:** a single, self-contained execution plan a coding agent (e.g. OpenCode
Go) can follow end-to-end to implement StockSense without needing to open the other 14 documents
individually. It restates the essential contracts, schema, rules, and phase sequence. The other
documents (`00`–`14`) remain the detailed reference/source-of-truth if this summary is
ambiguous.

**Do not write application code from this file alone as a first action** — follow the phase
order below; each phase specifies what to build and in what sequence, and explicitly separates
contract artifacts (build first) from implementation (build after, in parallel across owners).

---

## 0. Ground Rules
1. This is an MVP hackathon build — do not over-engineer. No microservices, no multi-tenant, no
   RBAC enforcement (role is stored but not checked).
2. Single stock-engine module owns all writes to `stock` and `stock_ledger` tables. No other
   module writes to them directly.
3. All operation documents (Receipt, Delivery, Transfer, Adjustment) share one status enum:
   `DRAFT | WAITING | READY | DONE | CANCELED` (not all types use all values — see §4).
4. Reference numbers: `<WarehouseShortCode>/<OP>/<4-digit seq>`, OP ∈ `{IN, OUT, INT, ADJ}`,
   e.g. `WH/IN/0001`.
5. Contract-first: freeze the request/response shape for a group of endpoints before
   implementing them; the frontend builds against a matching mock fixture in parallel.

---

## 1. Tech Stack
- Backend: Node.js + Express (or Fastify) + Prisma (or equivalent ORM) + PostgreSQL.
- Frontend: React + Vite + React Router + React Query + MSW (for mocks).
- Auth: JWT bearer tokens.
- All primary keys UUID v4, except business reference numbers (strings, not PKs).

---

## 2. Database Schema (build migrations in this order)
1. `users(id, login_id[unique,6-12chars], email[unique], password_hash, display_name, role, created_at, updated_at)`
2. `otp_requests(id, user_id→users, otp_code, expires_at, consumed, created_at)`
3. `warehouses(id, name, short_code[unique], address, created_at, updated_at)`
4. `locations(id, warehouse_id→warehouses, name, short_code, created_at, updated_at)`
5. `categories(id, name[unique])`
6. `products(id, name, sku[unique], category_id→categories?, uom, cost_per_unit?, reorder_min?, reorder_max?, created_at, updated_at)`
7. `contacts(id, name, type[VENDOR|CUSTOMER], email?, phone?, created_at, updated_at)`
8. `stock(id, product_id→products, location_id→locations, on_hand_qty, reserved_qty, updated_at)` — UNIQUE(product_id, location_id)
9. `sequence_counters(id, warehouse_id→warehouses, operation_type[IN|OUT|INT|ADJ], last_number)` — UNIQUE(warehouse_id, operation_type)
10. `stock_moves(id, reference[unique], type[RECEIPT|DELIVERY|TRANSFER|ADJUSTMENT], warehouse_id→warehouses, from_location_id→locations?, to_location_id→locations?, contact_id→contacts?, operation_type?, schedule_date, responsible_user_id→users, status, validated_at?, created_at, updated_at)`
11. `stock_move_lines(id, stock_move_id→stock_moves, product_id→products, quantity, created_at)`
12. `stock_ledger(id, stock_move_id→stock_moves, reference, product_id→products, from_location_id→locations?, to_location_id→locations?, contact_id→contacts?, quantity, direction[IN|OUT], moved_at)` — append-only, never updated/deleted.

Full column-level detail: `04_DATABASE_SCHEMA.md`.

---

## 3. API Contract Summary (freeze before implementing; full detail in `05_API_CONTRACTS.md`)
Base: `/api/v1`, JSON, `Authorization: Bearer <jwt>` on all but `/auth/*`.
Error shape: `{ "error": { "code", "message", "fields"? } }`. List shape:
`{ "data": [...], "total", "page", "pageSize" }`.

- **Auth:** `POST /auth/signup`, `POST /auth/login`, `POST /auth/otp/request`,
  `POST /auth/otp/verify-reset`, `GET /auth/me`, `PATCH /auth/me`
- **Catalog:** `GET|POST /products`, `PATCH /products/:id`, `GET|POST /categories`
- **Stock:** `GET /stock`, `PATCH /stock/:productId/:locationId`
- **Locations:** `GET|POST /warehouses`, `PATCH /warehouses/:id`, `GET|POST /locations`,
  `PATCH /locations/:id`
- **Dashboard:** `GET /dashboard/kpis`
- **Receipts:** `GET|POST /receipts`, `GET /receipts/:id`, `PATCH /receipts/:id`,
  `POST /receipts/:id/confirm|validate|cancel`, `GET /receipts/:id/print`
- **Deliveries:** `GET|POST /deliveries`, `GET /deliveries/:id`, `PATCH /deliveries/:id`,
  `POST /deliveries/:id/validate|cancel`, `GET /deliveries/:id/print`
- **Transfers:** `GET|POST /transfers`, `GET /transfers/:id`, `PATCH /transfers/:id`,
  `POST /transfers/:id/confirm|validate|cancel`
- **Adjustments:** `GET|POST /adjustments`, `GET /adjustments/:id`
- **Move History:** `GET /move-history`

---

## 4. Status Workflows
- **Receipt:** `DRAFT →(confirm) READY →(validate) DONE`; cancel from DRAFT/READY.
  Validate increases stock at `to_location_id`.
- **Delivery:** `DRAFT ⇄(auto) WAITING → READY →(validate) DONE`; cancel from
  DRAFT/WAITING/READY. WAITING is auto-computed whenever any line qty > `free_to_use` at
  `from_location_id`. Validate decreases stock at `from_location_id`.
- **Transfer:** `DRAFT →(confirm) READY →(validate) DONE`; cancel from DRAFT/READY. Validate
  decreases stock at `from_location_id` and increases at `to_location_id` (same transaction,
  writes one OUT + one IN ledger row per line).
- **Adjustment:** created → immediately `DONE`. Sets `on_hand_qty` to counted value; ledger
  direction = sign of delta; no ledger row if delta = 0.

`free_to_use = on_hand_qty - reserved_qty` (computed, never stored).

---

## 5. Core Business Rules (full list: `06_BUSINESS_RULES.md`)
- Login Id 6–12 chars, unique. Email unique. Password: lower+upper+special+len>8.
- Login failure → generic `"Invalid Login Id or Password"`.
- OTP expires in 10 min, single-use.
- Reference numbers auto-increment per (warehouse, operation_type), zero-padded to 4 digits,
  immutable, never reused.
- Only the stock-engine writes `stock`/`stock_ledger`.
- Delivery validate blocked (`CONFLICT`) if insufficient stock at validate time.
- Dashboard `late = schedule_date < today AND status NOT IN (DONE, CANCELED)`;
  `operations = schedule_date > today AND status NOT IN (DONE, CANCELED)`;
  `waiting` = count of Deliveries with status WAITING;
  `lowStockCount` = products where summed on_hand ≤ reorder_min.
- Move History: one row per (reference, product); IN = green, OUT = red.
- Cancel only allowed from DRAFT/READY/WAITING, never from DONE.

---

## 6. Screens (full detail: `02_UI_FUNCTIONALITY.md`)
Nav: `Dashboard | Operations (▾ Receipts / Delivery Orders / Internal Transfers / Inventory
Adjustment) | Products (tabs: Catalog / Stock) | Move History | Settings (Warehouse / Location)`
+ profile menu (My Profile / Logout).

1. Login, Signup, Forgot Password (OTP) — IMG:1
2. Dashboard — KPI cards + Receipt/Delivery summary cards + dynamic filters — IMG:12
3. Products (Catalog tab: CRUD; Stock tab: on-hand/free-to-use, inline editable) — IMG:13
4. Receipts List (search, list/kanban toggle) — IMG:3; Receipt Detail (Validate/Print/Cancel,
   stepper Draft>Ready>Done) — IMG:4
5. Deliveries List — IMG:2/6; Delivery Detail (stepper Draft>Waiting>Ready>Done, red-row alert
   for out-of-stock lines) — IMG:5
6. Internal Transfers List/Detail — modeled on Receipts (no direct mockup)
7. Stock Adjustments — single-step form (no direct mockup)
8. Move History (color-coded IN/OUT rows, one row per product line) — IMG:7/9
9. Warehouse settings (Name, Short Code, Address) — IMG:11
10. Location settings (Name, Short Code, Warehouse) — IMG:8/10
11. My Profile (display name, password change)

---

## 7. Phase Sequence (detailed task breakdown: `08_PHASE_PLAN.md`; task table: `10_DEPENDENCY_MATRIX.md`)

### Phase 1 — Foundation + Authentication
- P1: backend scaffold, `users`/`otp_requests` migrations, `/auth/*` endpoints, JWT middleware.
- P2: frontend scaffold, nav shell, Login/Signup/Forgot-Password screens against mocked §1.
- P3: review schema/contracts, draft stock-engine interface.
- P4: docker-compose, repo/branch setup, draft Dashboard KPI contract.
- Gate: signup → login → dashboard-redirect works end-to-end in docker-compose.

### Phase 2 — Products + Warehouse + Locations + Stock + Dashboard
- P1: migrations for warehouses/locations/categories/products/stock/sequence_counters;
  §2–§4 endpoints; **stock-engine implementation** (critical path artifact for Phase 3).
- P2: Products (Catalog+Stock tabs), Warehouse, Location, Dashboard screens (mocked → live).
- P3: freeze §6–§9 contracts + mock fixtures for P2 to consume; BR test matrix once stock-engine
  signatures are published.
- P4: implement Dashboard KPI endpoint (§5); seed script; integration test harness.
- Gate: create product → visible in Stock; create warehouse+location; Dashboard shows correct
  seeded KPIs.

### Phase 3 — Receipts + Deliveries
- P1: pairing support/hardening on stock-engine.
- P2: wire Receipts/Deliveries screens to live endpoints incrementally; build shared List/Kanban
  toggle + status stepper components.
- P3: implement §6 (Receipts) and §7 (Deliveries) fully, calling stock-engine on validate.
- P4: extend integration tests; verify KPIs against real data; QA pass vs mockups.
- Gate: Receipt validate increases stock; Delivery exceeding stock shows Waiting/red row, then
  becomes Ready after restocking, validate decreases stock.

### Phase 4 — Internal Transfers + Stock Adjustments + Move History + Settings/Profile + Final Integration
- P1: low-stock alert support; final security pass.
- P2: Transfers, Adjustments, Move History, Profile screens; final visual QA vs all mockups.
- P3: implement §8 (Transfers, two-leg stock-engine call) and §9 (Adjustments, set-quantity
  call) fully.
- P4: implement §10 (Move History); full regression suite; deploy demo; final QA sign-off vs
  every requirement ID in `01_REQUIREMENTS.md`.
- Gate: full PDF "Simplified Example" (Receive 100kg Steel → Transfer to Production Rack →
  Deliver 20 → Adjust −3kg damaged) runs end-to-end in the deployed demo with correct Move
  History and Dashboard numbers.

---

## 8. Definition of Done (apply to every task; full checklist: `13_DEFINITION_OF_DONE.md`)
Feature works · validation works (per §5 rules) · error handling works (standard error shape) ·
tests pass · no regressions · API docs updated · DB changes documented · UI matches mockup
intent (or documented deviation) · verified against real backend, not just mocks.

---

## 9. Open Decisions Carried Into Implementation
(Resolve-as-you-go; do not silently invent alternatives — log any new ones in
`14_CHANGELOG.md`.)
1. `nav-1`: "Products" is the nav item; "Stock" is a tab inside Products (not a separate nav
   entry), despite IMG:12 showing "Stock" in the nav bar.
2. `transfer-1`: Internal Transfer UI/workflow modeled on Receipt (Draft→Ready→Done); no
   dedicated mockup exists.
3. `adjust-1`: Stock Adjustment is a single-step form, Draft→Done immediately; no dedicated
   mockup exists.
4. OTP delivery is mocked/logged server-side, not sent via a real provider.
5. Signup redirects to Login (not auto-login) on success.
6. Transfer with insufficient stock returns `CONFLICT` rather than a Waiting-equivalent state.
7. Move History's kanban/grouping toggle groups by IN/OUT direction rather than status (all
   ledger rows are inherently "Done").
8. `role` (Inventory Manager / Warehouse Staff) is stored but not permission-enforced in MVP.

---

## 10. Reference Documents (for anything this summary doesn't fully cover)
`00_PROJECT_OVERVIEW.md` · `01_REQUIREMENTS.md` · `02_UI_FUNCTIONALITY.md` ·
`03_ARCHITECTURE.md` · `04_DATABASE_SCHEMA.md` · `05_API_CONTRACTS.md` ·
`06_BUSINESS_RULES.md` · `07_STATUS_WORKFLOWS.md` · `08_PHASE_PLAN.md` ·
`09_TEAM_OWNERSHIP.md` · `10_DEPENDENCY_MATRIX.md` · `11_TESTING_STRATEGY.md` ·
`12_GIT_COLLABORATION.md` · `13_DEFINITION_OF_DONE.md` · `14_CHANGELOG.md`
