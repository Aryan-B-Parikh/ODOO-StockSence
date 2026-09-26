# Phase 1 — Schema / Contract Review (Person 3 deliverable)

> `08_PHASE_PLAN.md` Phase 1 §5: "Review and sign off on `04_DATABASE_SCHEMA.md` /
> `05_API_CONTRACTS.md` (stock_moves, stock_move_lines, stock_ledger) since Person 3 will
> implement against them in Phase 3."

**Reviewer:** Person 3 (Inventory Domain)
**Reviewed:** `04_DATABASE_SCHEMA.md`, `05_API_CONTRACTS.md`, `06_BUSINESS_RULES.md`,
`07_STATUS_WORKFLOWS.md`, `backend/prisma/schema.prisma` (Phase 1 migration), stock-engine
interface draft (`backend/src/stock-engine/INTERFACE.md`).

## Findings

1. **JWT exemption vs `/auth/me` (docs clarification).**
   `03_ARCHITECTURE.md` §7 and `05_API_CONTRACTS.md` §0 say every route *except* `/auth/*`
   requires a JWT, but `GET/PATCH /auth/me` live under `/auth/*` and cannot work without one.
   Implemented interpretation: only `/auth/signup`, `/auth/login`, `/auth/otp/request`,
   `/auth/otp/verify-reset` are public; `GET/PATCH /auth/me` require the Bearer token.
   Logged in `14_CHANGELOG.md`. Needs Person 1/P2 acknowledgment (behavior is what the
   contract's `/auth/me` response requires).

2. **OTP anti-enumeration response.** `05_API_CONTRACTS.md` §1 does not define an error for
   `otp/request` when the account does not exist. Implemented: the endpoint always returns
   `200 { "message": "OTP sent" }` (no `debugOtp`), consistent with BR5's anti-enumeration
   intent. Flagged for sign-off.

3. **`otp_requests` index.** The phase-1 migration adds `INDEX otp_requests(user_id)` (used by
   the invalidate/single-use lookups in BR6). Not listed in `04_DATABASE_SCHEMA.md`
   "Indexing Notes" — additive, no schema/contract impact; noted for Person 1's awareness.

4. **Phase 2 schema consistency nits (no Phase 1 action).** `04_DATABASE_SCHEMA.md` opens with
   "All tables have `created_at`" but `categories`, `stock` and `sequence_counters` omit it in
   their column tables. Not a conflict for Phase 1; raise at Phase 2 kickoff when those
   migrations are written.

5. **`reserved_qty` lifecycle remains unspecified** (BR11 defines the formula, no BR defines
   when reservations are created/released). Documented as an open question in
   `backend/src/stock-engine/INTERFACE.md`; must be resolved at Phase 3 kickoff before
   Deliveries' WAITING logic is built.

6. **Status flows for Phase 3/4 are internally consistent** with `07_STATUS_WORKFLOWS.md`:
   Transfer takes the Receipt shape (Draft→Ready→Done, CONFLICT on insufficient stock),
   Adjustment is create→Done. No changes requested.

## Sign-off

- [x] Person 3 reviewed schema + contracts; no Phase 1 blockers.
- [x] Person 1 acknowledges items 1–3 (behavior implemented as described; OTP index shipped in
      the Phase 1 migration).

> **Phase 2 resolution (2026-09-26):** item 4 (`created_at` consistency) resolved by the Phase 2
> migration — see `04_DATABASE_SCHEMA.md` and `PHASE2_DECISIONS.md` §8. Item 5 (`reserved_qty`
> lifecycle) recorded: Phase 2 keeps reservations at 0 and the lifecycle decision is due at
> Phase 3 kickoff — see `PHASE2_DECISIONS.md` §10 / stock-engine `INTERFACE.md`.
