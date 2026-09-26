# 08 — Phase Plan

Team: **P1** = Backend/DB/Core, **P2** = Frontend/UX, **P3** = Inventory Domain, **P4** =
Operations/Integration/QA.

Golden rule: nobody blocks on someone else finishing a whole phase. Each phase starts with a
**contract freeze** (5–10% of phase time) so everyone can work in parallel for the rest.

---

## PHASE 1 — Foundation + Authentication

### 1. Objective
Stand up the shared skeleton (repo, DB, CI-less local run, auth) so every later phase has a
working login-gated app to build into.

### 2. Scope
R1.1–R1.11 (Auth), R3.1/R3.4 (nav shell), repo/tooling setup, DB migration tooling, JWT
middleware.

### 3. Person 1 tasks
- Init backend project (Express/Fastify), Postgres connection, migration tool (Prisma/Knex).
- Implement `users`, `otp_requests` tables (`04_DATABASE_SCHEMA.md` §users/otp_requests).
- Implement `POST /auth/signup`, `POST /auth/login`, `POST /auth/otp/request`,
  `POST /auth/otp/verify-reset`, `GET /auth/me`, `PATCH /auth/me` (`05_API_CONTRACTS.md` §1).
- JWT issuance + verification middleware, applied to all future non-auth routes.
- Write and commit seed script skeleton (empty for now, extended each phase).

### 4. Person 2 tasks
- Init frontend project (React+Vite), routing shell, shared nav bar component (Dashboard |
  Operations | Products | Move History | Settings + avatar menu) per `02_UI_FUNCTIONALITY.md`.
- Build Login, Signup, Forgot Password (OTP) screens per IMG:1 and derived flow.
- Build the API client + MSW mock layer using the **frozen** Phase 1 contract
  (`05_API_CONTRACTS.md` §1) — build against mocks, do not wait for Person 1.
- Auth state management (store JWT, protected route wrapper, redirect to Dashboard placeholder
  on login success — R1.11).

### 5. Person 3 tasks
- Review and sign off on `04_DATABASE_SCHEMA.md` / `05_API_CONTRACTS.md` (stock_moves,
  stock_move_lines, stock_ledger) since Person 3 will implement against them in Phase 3.
- Draft the shared "stock-engine" interface (function signatures only, no implementation) that
  Person 1 will build in Phase 2 — this is the contract Person 3 will mock in Phase 2/3.
- Start local domain modeling notes for Receipts/Deliveries validation rules
  (`06_BUSINESS_RULES.md` BR10–BR18) — no blocking code yet.

### 6. Person 4 tasks
- Set up `docker-compose.yml` (Postgres + backend + frontend) so the whole team runs one command.
- Set up repo structure, `.env.example`, README quickstart.
- Set up Git branch protection / PR template (`12_GIT_COLLABORATION.md`).
- Draft Dashboard KPI query contract (`05_API_CONTRACTS.md` §5) for Person 1/Person 3 to build
  against in Phase 2/3 — contract only, no implementation yet.

### 7. Deliverables per person
- **P1:** working `/auth/*` endpoints, JWT middleware, migrations for `users`/`otp_requests`.
- **P2:** Login/Signup/Forgot-Password screens wired to mocks, nav shell, protected routing.
- **P3:** signed-off schema/contract review notes, stock-engine interface draft.
- **P4:** `docker-compose.yml`, README, branch protection rules, Dashboard KPI contract draft.

### 8. Contracts required (frozen before parallel work starts)
- `05_API_CONTRACTS.md` §1 (Auth) — owner Person 1, reviewed by Person 2.
- Stock-engine function interface — owner Person 3 draft, reviewed by Person 1.

### 9. Dependencies
- Person 2's auth screens depend on the **contract**, not the implementation (mocked via MSW).
- Person 4's docker-compose depends on Person 1's backend having a runnable entrypoint (even
  stubbed) — a thin `Dockerfile` stub is Person 1's first commit, delivered within the first
  hour of Phase 1.

### 10. Who must wait for whom
- Nobody waits on a finished phase. The only hard sequencing: Person 4 needs Person 1's initial
  `Dockerfile`/`package.json` skeleton (artifact, not full feature) before finalizing
  `docker-compose.yml` — expected within hour 1.

### 11. What can be mocked
- All `/auth/*` responses (Person 2 uses MSW fixtures matching §1 exactly).

### 12. Integration checkpoint
End of Phase 1: Person 2 switches MSW off for `/auth/*` and logs in against Person 1's real
API inside the docker-compose stack. All 4 people verify signup → login → dashboard-redirect
works end-to-end.

### 13. Tests
- P1: unit tests for password/loginId/email validation rules (BR1–BR4), login failure message
  (BR5), OTP expiry/single-use (BR6).
- P2: component tests for form validation (client-side mirrors BR1–BR4); MSW-backed integration
  test for full signup→login flow.
- P4: smoke test script (`scripts/smoke-auth.sh`) hitting the live docker-compose stack.

### 14. Definition of done
See `13_DEFINITION_OF_DONE.md` — plus: docker-compose brings up all 3 services with one command;
a fresh user can sign up, log in, and land on a (placeholder) Dashboard route.

---

## PHASE 2 — Products + Warehouse + Locations + Stock + Dashboard

### 1. Objective
Deliver the full Products/Stock/Warehouse/Location domain plus a live Dashboard, and ship the
real "stock-engine" module that Phase 3 depends on.

### 2. Scope
R4 (Products), R10 (Warehouse/Location), part of R4.6/R4.7 (Stock view), R2 (Dashboard), R3.1–3.3
nav completion.

### 3. Person 1 tasks
- Implement `warehouses`, `locations`, `categories`, `products`, `stock`,
  `sequence_counters` tables.
- Implement `05_API_CONTRACTS.md` §2 (Products/Categories), §3 (Stock), §4
  (Warehouses/Locations).
- Implement the **real stock-engine module** (BR10–BR16 increment/decrement functions +
  reference generator per BR7–BR9) as an internal library other backend modules import — this is
  the critical artifact Person 3 needs by end of Phase 2 to start real (non-mocked) integration
  in Phase 3.
- Publish stock-engine's internal function signatures/README to the repo the moment they're
  final (before full implementation is done), so Person 3 can start wiring against real function
  calls mid-phase instead of waiting for phase end.

### 4. Person 2 tasks
- Build Products screen (Catalog tab + Stock tab) per `02_UI_FUNCTIONALITY.md`, against mocks
  for §2/§3 first, then switch to live endpoints once Person 1 publishes them.
- Build Warehouse and Location settings screens (IMG:8,10,11).
- Build Dashboard screen: KPI cards, Receipt/Delivery summary cards, dynamic filters bar
  (IMG:12), against the §5 mock contract.
- Finish nav bar: enable Operations submenu placeholders (Receipts/Deliveries/Transfers/
  Adjustments routes exist but show "coming in Phase 3/4" placeholder content).

### 5. Person 3 tasks
- Finalize Receipt/Delivery/Transfer/Adjustment **request/response contracts**
  (`05_API_CONTRACTS.md` §6–§9) — freeze these early in Phase 2 even though implementation is
  Phase 3/4, so Person 2 can start building those screens' mocks in parallel.
- Build local mock server responses for §6–§9 for Person 2 to consume immediately.
- Design the `stock_moves`/`stock_move_lines` business-rule test matrix (BR12–BR18) ready to
  implement against Person 1's stock-engine as soon as it's published.

### 6. Person 4 tasks
- Implement Dashboard KPI aggregation endpoint (`05_API_CONTRACTS.md` §5) — reads from
  `stock_moves`/`stock_ledger` (tables exist from schema, populated starting Phase 3, so build
  and test this against seed data now).
- Write seed script populating warehouses/locations/products/sample stock for demo purposes.
- Start integration test harness (supertest or similar) that will run against every module as it
  lands.

### 7. Deliverables per person
- **P1:** live Products/Stock/Warehouse/Location endpoints; stock-engine library + docs.
- **P2:** live Products, Stock, Warehouse, Location, Dashboard screens.
- **P3:** frozen §6–§9 contracts + mock fixtures; BR test matrix document.
- **P4:** live Dashboard KPI endpoint; seed script; integration test harness skeleton.

### 8. Contracts required
- `05_API_CONTRACTS.md` §2, §3, §4 (Person 1, frozen at phase start).
- `05_API_CONTRACTS.md` §5 Dashboard KPI (Person 4 finalizes, Person 1 confirms field names
  match `stock_moves`/`stock_ledger` schema).
- `05_API_CONTRACTS.md` §6–§9 (Person 3 freezes by mid-phase for Person 2 to mock).
- Stock-engine function signatures (Person 1 → Person 3, published mid-phase).

### 9. Dependencies
- Person 4's Dashboard KPI implementation depends on Person 1's `stock_moves`/`stock_ledger`
  tables existing (schema only — no data needed yet, seed script covers demo data).
- Person 3's BR test matrix depends on Person 1's stock-engine signatures (not full
  implementation) being published.

### 10. Who must wait for whom
- Person 2 does **not** wait for Person 1: builds Products/Stock/Warehouse/Dashboard UI against
  mocks first, swaps to live endpoints as Person 1 lands them (expected mid-to-late phase).
- Person 3 does **not** implement real Receipt/Delivery logic yet (that's Phase 3) but **does**
  wait for Person 1's stock-engine signatures before finalizing its own function-call stubs —
  expected by phase midpoint per Person 1's task list above.

### 11. What can be mocked
- §5 KPI response (Person 2 mocks until Person 4's endpoint lands).
- §6–§9 (Person 2 mocks all Phase 3/4 operation screens using Person 3's fixtures).

### 12. Integration checkpoint
End of Phase 2: Products, Stock, Warehouse, Location, Dashboard all run live end-to-end in
docker-compose with seeded data. Stock-engine library has unit tests passing.

### 13. Tests
- P1: unit tests for stock-engine (BR11 free_to_use calc, BR7–BR9 reference generation
  concurrency test).
- P2: component/integration tests for Products/Stock/Warehouse/Location/Dashboard screens.
- P4: integration tests for KPI endpoint against seed data (BR19–BR22).

### 14. Definition of done
Standard DoD (`13_DEFINITION_OF_DONE.md`) plus: a demo user can create a product, see it in
Stock, create a warehouse+location, and see correct KPI numbers on the Dashboard reflecting seed
data.

---

## PHASE 3 — Receipts + Deliveries

### 1. Objective
Implement the two primary stock-moving workflows end-to-end, live, using the Phase-2 stock-engine.

### 2. Scope
R5 (Receipts), R6 (Deliveries), relevant slices of R9 (Move History rows now start being
produced, though the Move History **screen** ships in Phase 4).

### 3. Person 1 tasks
- Support Person 3 on stock-engine edge cases discovered during Receipt/Delivery
  implementation (insufficient stock CONFLICT per BR13, transactional increment/decrement).
- Harden `sequence_counters` concurrency (BR8) under real multi-request load if issues surface.
- No new endpoints owned by Person 1 this phase — available to pair with Person 3/Person 4.

### 4. Person 2 tasks
- Wire Receipts List/Detail screens (IMG:3,4) to live §6 endpoints as Person 3 lands them;
  until then, continue against Phase 2 mocks.
- Wire Delivery List/Detail screens (IMG:2,5,6) to live §7 endpoints; implement red-row/alert
  behavior (BR18) and status stepper component (reusable — also used by Transfers in Phase 4).
- Implement List ⇄ Kanban toggle component (shared, reusable across Receipts/Deliveries/
  Transfers/Move History) per R5.6/R6.6.

### 5. Person 3 tasks
- Implement `05_API_CONTRACTS.md` §6 (Receipts) fully: CRUD + confirm/validate/cancel/print,
  calling Person 1's stock-engine for the validate step (BR12).
- Implement §7 (Deliveries) fully: CRUD + waiting-status computation (BR17), validate/cancel/
  print, calling stock-engine for the validate step (BR13).
- Write BR-driven unit tests per the Phase 2 test matrix (BR12, BR13, BR17, BR18, BR25).

### 6. Person 4 tasks
- Extend integration test harness to cover Receipt/Delivery full lifecycle
  (Draft→Ready→Done, Draft→Waiting→Ready→Done).
- Verify Dashboard KPIs (`pendingReceipts`, `pendingDeliveries`, late/waiting counts) update
  correctly as real Receipt/Delivery data is created — regression-test Phase 2's KPI endpoint
  against Phase 3's real data instead of only seed data.
- Begin QA pass on Receipts/Deliveries UI against `02_UI_FUNCTIONALITY.md` and the original
  mockups (IMG:2,3,4,5,6), logging any mismatches.

### 7. Deliverables per person
- **P1:** stock-engine hardening/pairing support, no new standalone deliverable this phase.
- **P2:** live Receipts and Deliveries screens, shared List/Kanban toggle + status stepper
  components.
- **P3:** live §6/§7 endpoints with full status-transition logic and BR test coverage.
- **P4:** extended integration tests, KPI regression verification, QA findings log.

### 8. Contracts required
- §6/§7 already frozen in Phase 2 — any change this phase requires a documented amendment in
  `14_CHANGELOG.md` and a heads-up to Person 2 before merging.

### 9. Dependencies
- Person 2's live-endpoint wiring depends on Person 3's §6/§7 implementation landing
  incrementally (endpoint-by-endpoint, not "all at once at phase end") — Person 3 merges small
  PRs per endpoint (e.g., `GET /receipts` first, then `POST`, then `/validate`) so Person 2 can
  swap mocks out incrementally.
- Person 3's `/validate` endpoints depend on Person 1's stock-engine (already delivered Phase 2;
  only pairing support needed now).

### 10. Who must wait for whom
- Person 2 only "waits" in the sense of continuing to use Phase 2 mocks for any §6/§7 sub-
  endpoint not yet merged by Person 3 — never fully blocked.
- Person 4's KPI regression check waits on Person 3 having at least one Receipt and one Delivery
  reach `DONE` in a test environment — expected mid-phase.

### 11. What can be mocked
- Any §6/§7 sub-endpoint not yet merged continues to use the Phase 2 mock fixture.

### 12. Integration checkpoint
End of Phase 3: create a Receipt → validate → stock increases → visible in Stock tab and KPIs.
Create a Delivery exceeding stock → shows Waiting/red row → add more stock via a Receipt →
Delivery becomes Ready → validate → stock decreases.

### 13. Tests
- P3: full BR12/BR13/BR17/BR18/BR25 unit + integration coverage.
- P2: UI tests for status stepper transitions and red-row rendering.
- P4: end-to-end scenario tests (Receipt→Stock→Delivery chain) and KPI regression tests.

### 14. Definition of done
Standard DoD plus: the PDF's "Simplified Example" Steps 1 and 3 (Receive 100kg Steel; Deliver 20
steel) are reproducible end-to-end in the running app with correct resulting stock numbers.

---

## PHASE 4 — Internal Transfers + Stock Adjustments + Move History + Settings/Profile + Final Integration

### 1. Objective
Complete the remaining operation types, ship the unified Move History ledger view, finish
Settings/Profile, and integrate/QA the whole system for demo.

### 2. Scope
R7 (Internal Transfers), R8 (Stock Adjustments), R9 (Move History), remainder of R10
(Settings polish), Profile screen, R11 (cross-cutting: low-stock alerts, multi-warehouse
verification, SKU search), final end-to-end QA.

### 3. Person 1 tasks
- Support Person 3 on the two-leg stock-engine call needed for Transfers (BR14) and the
  set-based adjustment call (BR15) if new stock-engine functions are needed.
- Implement low-stock alert query (BR22) as a reusable function, exposed via the existing
  Dashboard KPI endpoint (`lowStockCount`) and optionally a `GET /products?lowStock=true` filter
  for the Products screen.
- Final pass on auth/security (JWT expiry handling, password hashing config review).

### 4. Person 2 tasks
- Build Internal Transfer List/Detail screens (reusing Receipt-style components per
  `02_UI_FUNCTIONALITY.md`).
- Build Stock Adjustment single-step form screen.
- Build Move History screen (IMG:7,9): list view, search, color-coded IN/OUT rows, Kanban/
  grouping per `07_STATUS_WORKFLOWS.md`'s open decision (default: group by direction).
- Build My Profile screen (display name edit, password change).
- Final visual QA pass against every mockup image, fixing any drift.

### 5. Person 3 tasks
- Implement `05_API_CONTRACTS.md` §8 (Internal Transfers) fully, calling stock-engine's two-leg
  move (BR14), writing two ledger rows per line (BR16).
- Implement §9 (Stock Adjustments) fully, single-step apply (BR15).
- Full BR test coverage for BR14, BR15, BR16, BR23, BR24.

### 6. Person 4 tasks
- Implement `05_API_CONTRACTS.md` §10 (Move History), reading `stock_ledger` only (BR23/BR24).
- Run full regression suite across all 4 phases' features.
- Finalize demo deployment (Render/Railway/Fly.io or equivalent) and demo seed data set.
- Compile final QA sign-off checklist against `01_REQUIREMENTS.md` (every R-ID checked off) and
  `13_DEFINITION_OF_DONE.md`.

### 7. Deliverables per person
- **P1:** low-stock alert support, final security pass.
- **P2:** Transfers, Adjustments, Move History, Profile screens; final visual QA fixes.
- **P3:** live §8/§9 endpoints with test coverage.
- **P4:** live §10 endpoint, full regression pass, deployed demo, final QA sign-off doc.

### 8. Contracts required
- §8, §9, §10 frozen at Phase 4 kickoff (drafted in Phase 3 idle time if capacity allows,
  otherwise at Phase 4 start — see `10_DEPENDENCY_MATRIX.md`).

### 9. Dependencies
- Person 4's Move History endpoint depends only on `stock_ledger` data already being produced by
  Phase 3's Receipts/Deliveries — can be built and tested immediately at Phase 4 start using
  existing data, in parallel with Person 3 building Transfers/Adjustments.
- Person 2's Move History screen depends on Person 4's §10 contract (frozen at kickoff) — mocked
  until live.

### 10. Who must wait for whom
- Nobody blocks on a full phase. Person 2's Transfers/Adjustments screens use mocks until Person
  3 lands §8/§9 endpoint-by-endpoint, same incremental-merge pattern as Phase 3.

### 11. What can be mocked
- §8, §9, §10 responses, until each lands.

### 12. Integration checkpoint
End of Phase 4 (final): full PDF "Simplified Example" walkthrough (Receive 100kg Steel → Internal
transfer to Production Rack → Deliver 20 steel → Adjust 3kg damaged) runs start-to-finish in the
deployed demo with correct Move History entries and Dashboard KPIs.

### 13. Tests
- P3: BR14/BR15/BR16 coverage.
- P4: full regression suite + the PDF example scenario as an automated end-to-end test.
- P2: Move History rendering tests (color coding, multi-row-per-reference).

### 14. Definition of done
Standard DoD, plus: every requirement ID in `01_REQUIREMENTS.md` is checked off in Person 4's
final QA sign-off, and the deployed demo runs the full PDF example scenario without errors.
