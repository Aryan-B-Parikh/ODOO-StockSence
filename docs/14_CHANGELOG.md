# 14 — Changelog

Running log of decisions, contract amendments, and open-decision resolutions. Maintained by
Person 4; any person can add an entry when they make or resolve a decision.

Format: `[Phase] YYYY-MM-DD — Author — Summary`

---

## Initial Documentation Set
`[Planning] — Architect — Generated the full documentation set (00–13, MASTER_EXECUTION_PLAN)
from the hackathon PDF ("StockSense") and 13 Excalidraw mockup images. All usernames/avatar
labels in mockups were excluded as non-requirements per instructions.`

**Open decisions recorded at generation time** (see source docs for full detail):
- `nav-1` (`01_REQUIREMENTS.md`): Dashboard mockup (IMG:12) shows "Stock" in the nav bar where
  every other screen shows "Products". Decision: keep **Products** as the top-level nav item;
  Stock is a tab within Products.
- `transfer-1` (`01_REQUIREMENTS.md`): No mockup exists for Internal Transfers. Decision: model
  its UI/status flow on the Receipt screen (Draft → Ready → Done), no Waiting state.
- `adjust-1` (`01_REQUIREMENTS.md`): No mockup exists for Stock Adjustments. Decision: single-
  step form, status goes directly Draft → Done, applied immediately on submit.
- OTP delivery channel (`02_UI_FUNCTIONALITY.md` / `03_ARCHITECTURE.md`): PDF says "OTP-based"
  but specifies no delivery mechanism. Decision: mock/log OTP server-side for the hackathon demo
  instead of integrating a real SMS/email provider.
- Signup post-submit redirect (`02_UI_FUNCTIONALITY.md`): mockup doesn't specify whether signup
  auto-logs-in or returns to Login. Decision: redirect to Login with a success message.
- Transfer insufficient-stock behavior (`07_STATUS_WORKFLOWS.md`): Decision to block with a
  CONFLICT error rather than add a Waiting-equivalent state, for MVP simplicity.
- Move History "Kanban" grouping (`07_STATUS_WORKFLOWS.md`): mockup shows a kanban-view icon but
  Move History only ever contains Done records. Decision: group by IN/OUT direction instead of
  status — flagged for Person 2/Person 4 alignment at Phase 4 kickoff, may change.
- Role enforcement (`00_PROJECT_OVERVIEW.md`): `role` field exists on `users` but is not enforced
  anywhere in Phase 1–4; Inventory Manager and Warehouse Staff have identical access for MVP.

---

## [Phase 1] 2026-09-26 — Person 4 (implementation agent) — Phase 1 shipped: Foundation + Authentication
- What changed:
  - Backend (P1): Express + Prisma + PostgreSQL scaffold; `users`/`otp_requests` migration
    `20260926000000_init_phase1_auth`; `/auth/signup|login|otp/request|otp/verify-reset|me`
    endpoints; JWT middleware; seed-script skeleton; 29 unit/API tests (BR1–BR6) + opt-in
    PostgreSQL integration test.
  - Shared (P1/P2): `@stocksense/shared` workspace with Zod auth schemas + contract types
    (single source for client and server validation).
  - Frontend (P2): React + Vite + React Router + React Query shell; nav bar with Operations/
    Settings submenus and profile menu (R3.1–R3.4); Login/Signup/Forgot-Password (OTP)
    screens; protected routing; MSW mock layer for contract §1; 9 component/integration tests.
  - Domain (P3): stock-engine interface draft (`backend/src/stock-engine/INTERFACE.md` +
    `interface.ts`) and schema/contract review (`docs/reviews/PHASE1_SCHEMA_CONTRACT_REVIEW.md`).
  - Ops (P4): `docker-compose.yml` (Postgres + backend + frontend), Dockerfiles,
    `.env.example`, README quickstart, PR template, `scripts/smoke-auth.mjs`/`.sh`,
    Dashboard KPI contract draft (`docs/reviews/PHASE1_DASHBOARD_KPI_CONTRACT.md`).
- Decisions / clarifications (flag for review, not silent):
  - **JWT scope clarification:** the literal "all routes except `/auth/*` require JWT" wording
    cannot apply to `GET/PATCH /auth/me`; the four credential/OTP endpoints are public,
    `/auth/me` endpoints require a Bearer token.
  - **OTP anti-enumeration:** `POST /auth/otp/request` returns `200 {"message":"OTP sent"}` with
    no `debugOtp` for unknown accounts, consistent with BR5.
  - **Signup redirect:** implemented the documented default (redirect to Login with success
    message, no auto-login).
  - `totalProductsInStock`/`toReceive`/`toDeliver` aggregation boundaries remain open questions
    for Phase 2 kickoff (documented in `docs/reviews/PHASE1_DASHBOARD_KPI_CONTRACT.md`).
  - `reserved_qty` lifecycle and the Phase 2 `created_at` nits remain open (documented in
    `docs/reviews/PHASE1_SCHEMA_CONTRACT_REVIEW.md`).
- Files affected: `backend/**`, `frontend/**`, `shared/**`, `scripts/**`, `docker-compose.yml`,
  `README.md`, `.env.example`, `.github/pull_request_template.md`, `docs/reviews/**`.
- Consumer notified? N/A (single-session implementation; review notes committed under
  `docs/reviews/` for Person 1/P3/P4 sign-off).

---

## [Phase 2] 2026-09-26 — Person 1/2/3/4 (implementation agent) — Phase 2 shipped: Products + Stock + Warehouse + Locations + Dashboard

- What changed:
  - **Backend (P1):** full inventory schema migration `20260926063920_phase2_inventory_core`
    (warehouses, locations, categories, products, contacts, stock, sequence_counters,
    stock_moves, stock_move_lines, stock_ledger); §2–§4 endpoints (products/categories,
    warehouses/locations, stock read + manual edit); JWT-protected; seed supports
    `SEED_RESET=1`.
  - **Domain (P3):** stock-engine implemented (BR10–BR16) with atomic stock arithmetic, ledger
    writes, reference generator (BR7–BR9) and shared adjustment orchestration for initial stock
    + manual edits; `INTERFACE.md` updated to "implemented".
  - **Frontend (P2):** Products page (Catalog tab: search/category filter/create/edit; Stock
    tab: on-hand/free-to-use, location filter, low/out badges, inline stock edit), Warehouse and
    Location settings screens, real Dashboard (5 KPI cards, Receipt/Delivery summary cards,
    document-type/status/warehouse/location/category filters, R2.16/R2.17 links), MSW mocks
    for §2–§5 plus read-only §6–§9 fixtures for Phase 3.
  - **Ops/QA (P4):** real Dashboard KPI endpoint with pure shared summarizer (BR19–BR22),
    canonical seed (warehouses/locations/categories/products/stock/contacts + DONE/open
    documents), `scripts/smoke-phase2.mjs`, Phase 2 integration test suite.
- Contract/schema amendments (documented in `docs/reviews/PHASE2_DECISIONS.md`):
  - 05 §3: stock row adds `reorderMin`, `lowStock`, `outOfStock` (product-level BR22 rule).
  - 05 §5: dashboard adds `type`/`status` filters; explicit status replaces the open predicate.
  - 04 §stock_moves: nullable `note` column; `created_at` added where the preamble required it
    (categories/stock/sequence_counters).
  - Initial stock and manual stock edits are DONE `ADJUSTMENT` documents (ledger traceability).
  - `toReceive`/`toDeliver` = `schedule_date <= today`; `totalProductsInStock` = products with
    on-hand > 0; reservation lifecycle still open for Phase 3 (reserved stays 0 in Phase 2).
- Verification: 34 shared + 42 backend (incl. 11 Phase 2 DB integration tests) + 33 frontend
  tests green; typecheck and production build green; Docker Compose + seed + smoke verified.
- Files affected: `backend/**`, `frontend/**`, `shared/**`, `scripts/smoke-phase2.mjs`,
  `docs/04_DATABASE_SCHEMA.md`, `docs/05_API_CONTRACTS.md`, `docs/reviews/**`, `README.md`.
- Consumer notified? N/A (single-session implementation); amendments recorded above and in
  `docs/reviews/PHASE2_DECISIONS.md`.

---

## [Phase 3] 2026-09-27 — Person 1/2/3/4 (implementation agent) — Phase 3 shipped: Receipts + Deliveries

- What changed:
  - **Backend/domain (P1/P3):** §6 Receipts (list/get/create/patch/confirm/validate/cancel/print)
    and §7 Deliveries (list/get/create/patch/validate/cancel/print) implemented against the
    frozen contracts; new §4b Contacts (`GET/POST /contacts`) so suppliers/customers can be
    selected; all stock effects go through the Phase 2 stock-engine with the optional
    transaction handle (multi-line atomicity).
  - **Reservation lifecycle (decision 1):** open (`DRAFT`/`READY`) deliveries hold
    `reserved_qty` equal to their lines via the engine's reserve/release primitives; `WAITING`
    deliveries hold none; validate `DRAFT→READY` ("Pick & Pack") changes no stock, validate
    `READY→DONE` decreases on-hand and releases reservations in one transaction; cancel
    releases; `receipt validate` and manual adjustments trigger a synchronous FIFO recheck that
    promotes newly-satisfiable `WAITING` deliveries to `READY`.
  - **Frontend (P2):** real Receipts and Delivery Orders screens with list/kanban toggle, search,
    status + warehouse filters, detail/create forms (product lines, quantity, contact pickers
    with inline creation), status steppers, draft/ready/done action bars, red out-of-stock rows,
    waiting banner, print preview, and full loading/empty/error states.
  - **Ops/QA (P4):** canonical seed now drives the real receipt/delivery workflows; Phase 3
    integration suite (12 tests incl. atomicity + reservation recheck + KPI regression);
    `scripts/smoke-phase3.mjs` (27 checks); Phase 3 UI tests (13).
- Contract/schema amendments (documented in `docs/reviews/PHASE3_DECISIONS.md`):
  - 05 §4b: Contacts endpoints added (required by §6/§7 `fromContactId`/`toContactId`).
  - 05 §6/§7: list endpoints add optional `warehouseId`; list/detail DTOs add contact email,
    line `sku`/`uom`, `warehouseId`, `validatedAt`, `responsibleUserName`; print payload shape.
  - 04: `stock_moves` line/stock CHECK constraints (migration
    `20260927000000_phase3_document_constraints`): `quantity > 0`, `on_hand >= 0`,
    `0 <= reserved <= on_hand`.
  - Stock-engine `setOnHandFromCount` now refuses to go below `reserved_qty` (decision 7).
  - UI mapping: PDF "pick → pack → validate" = Draft → Ready ("Pick & Pack") → Done; responsible
    user shown read-only (no user-directory endpoint); Delivery Address maps to the customer
    contact; operation type is free text (no documented option list).
- Verification: 47 shared + 54 backend (incl. 23 DB integration tests) + 46 frontend tests
  green; typecheck + production build green; Docker Compose + seed + all three smoke scripts
  verified end-to-end.
- Files affected: `backend/src/{receipts,deliveries,contacts}/**`, `backend/src/stock-engine/**`,
  `backend/prisma/**`, `shared/src/operations.*`, `frontend/src/**`,
  `frontend/src/pages/operations/**`, `scripts/smoke-phase3.*`, docs/reviews/**, README.
- Consumer notified? N/A (single-session implementation); amendments recorded above and in
  `docs/reviews/PHASE3_DECISIONS.md`.

---

## [Phase 4] 2026-09-27 — Person 1/2/3/4 (implementation agent) — Phase 4 shipped: Transfers + Adjustments + Move History + Settings/Profile + Final Integration

- What changed:
  - **Internal Transfers (P1/P3):** §8 endpoints (list/create/get/patch/confirm/validate/cancel)
    with `DRAFT → READY → DONE` (no Waiting state); `confirm` reserves the lines at the source
    (CONFLICT when `free_to_use` is short — 07 transfer-1), `validate` releases the reservation
    and moves every line with the stock-engine's atomic two-leg transfer (one OUT + one IN
    ledger row per line; total company stock unchanged, BR14/BR16).
  - **Stock Adjustments (P1/P3):** §9 list/get/create reusing `applyStockAdjustment`; recorded →
    counted → delta → stock reconciled (BR15); zero delta records a DONE document with no line
    and no ledger row; the Phase 3 reservation guard blocks counts below `reserved_qty`.
  - **Move History (P4):** §10 read-only over `stock_ledger` — one row per ledger entry with
    reference/date/contact/from/to/product/quantity/direction/status plus additive `type`,
    `productId`, `sku`, `movedAt`; filters for search/type/direction/status/product/warehouse/
    location/date range; Kanban groups by direction (IN green / OUT red) resolving the Phase 1
    open decision.
  - **Frontend (P2):** real Transfer list/detail screens (reservation-aware confirm/validate),
    Adjustment list + single-step form (recorded/reserved/delta preview), Move History screen
    (filters + list/kanban, colour-coded rows), and My Profile (display name + password change +
    logout). All Phase 4 placeholder pages removed.
  - **Ops/QA (P4):** seed now drives the real transfer + adjustment workflows; Phase 4
    integration suite (10 tests incl. transfer atomicity, total-stock invariant, move-history
    filters, full lifecycle); `scripts/smoke-phase4.mjs` (27 checks); 22 new UI tests; final QA
    sign-off (`docs/reviews/PHASE4_FINAL_QA.md`) and deployment guide (`docs/DEPLOYMENT.md`).
- Schema/contract amendments:
  - Migration `20260926090146_phase4_adjustment_counts`: nullable `recorded_quantity` /
    `counted_quantity` on `stock_moves` (adjustment list/detail must report both after the fact).
  - `05 §8/§9/§10` additive filters + DTO fields; transfer reservation lifecycle and the
    zero-delta adjustment behavior documented in `docs/reviews/PHASE4_DECISIONS.md`.
- Verification: 47 shared + 64 backend (incl. 34 DB integration tests) + 68 frontend tests green;
  all four smoke scripts pass; typecheck + production build green; Docker Compose + seed +
  complete lifecycle (receipt → transfer → delivery → adjustment → move history → dashboard)
  verified end-to-end.
- Files affected: `backend/src/{transfers,adjustments,move-history}/**`, `backend/prisma/**`,
  `shared/src/operations.*`, `frontend/src/**`, `scripts/smoke-phase4.*`,
  `docs/reviews/PHASE4_*`, `docs/DEPLOYMENT.md`, `README.md`.
- Consumer notified? N/A (single-session implementation); amendments recorded above.

---

## Template for future entries
```
## [Phase N] YYYY-MM-DD — <Person> — <Title>
- What changed:
- Why:
- Files affected:
- Consumer notified? (Y/N, who)
```
