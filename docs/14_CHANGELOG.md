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

## Template for future entries
```
## [Phase N] YYYY-MM-DD — <Person> — <Title>
- What changed:
- Why:
- Files affected:
- Consumer notified? (Y/N, who)
```
