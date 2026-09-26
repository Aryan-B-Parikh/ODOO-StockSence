# StockSense — Inventory Management System

4-person hackathon MVP built from the requirements/mockup documentation in `docs/` (start with
`docs/00_PROJECT_OVERVIEW.md` and the single-file `docs/MASTER_EXECUTION_PLAN.md`).

**Current status:** Phase 1 — Foundation + Authentication (see `docs/08_PHASE_PLAN.md`).

## Repository layout

```
backend/   Node.js + Express + Prisma + PostgreSQL API (Person 1)
frontend/  React + Vite + React Router + React Query + MSW SPA (Person 2)
shared/    Contract types + Zod validation schemas used by both (contract-first)
scripts/   Smoke scripts (Person 4)
docs/      Source-of-truth documentation set
```

## Prerequisites

- Node.js >= 20 and npm >= 10
- Docker + Docker Compose (recommended path), or a local PostgreSQL 14+

## Quickstart (Docker Compose — recommended)

```bash
cp .env.example .env        # Windows: copy .env.example .env
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:4000/api/v1
- Postgres: localhost:5432 (credentials from `.env`)

The backend container runs `prisma migrate deploy` on start, so migrations are applied
automatically.

## Quickstart (native, no Docker)

1. Start PostgreSQL and create a database, then:

```bash
cp backend/.env.example backend/.env    # then edit DATABASE_URL / JWT_SECRET
npm install
npm run prisma:migrate --workspace @stocksense/backend    # apply migrations
npm run dev:backend
```

2. In a second terminal:

```bash
cp frontend/.env.example frontend/.env  # optional
npm run dev:frontend
```

`frontend/.env` sets `VITE_USE_MSW`. With `true` the UI is served entirely from MSW mock
fixtures matching `docs/05_API_CONTRACTS.md` §1 (contract-first development). Set it to `false`
to talk to the real backend at `/api/v1` through the Vite dev proxy.

## Tests / checks

```bash
npm test            # shared + backend + frontend unit/component tests
npm run typecheck   # TypeScript across all workspaces
npm run build       # production build of the frontend
```

Backend DB integration tests are opt-in (they need a throwaway database):

```bash
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5433/stocksense_test"
$env:RUN_DB_TESTS="1"
npm run test --workspace @stocksense/backend
```

## Auth smoke test

With the stack running (Docker or native):

```bash
node scripts/smoke-auth.mjs          # or: bash scripts/smoke-auth.sh
```

Exercises signup → login → /auth/me → OTP request → OTP reset → login with new password.

## Working agreements

- `docs/` is the implementation source of truth. Do not silently change schema, contracts,
  business rules, statuses, workflows, or ownership.
- Git/PR rules: `docs/12_GIT_COLLABORATION.md`; Definition of Done: `docs/13_DEFINITION_OF_DONE.md`.
- Record decisions/contract amendments in `docs/14_CHANGELOG.md`.

## OTP in development

Per the documented OPEN DECISION, OTPs are not sent via a real provider. In non-production
environments `POST /auth/otp/request` also returns the code in a `debugOtp` field and logs it to
the server console.
