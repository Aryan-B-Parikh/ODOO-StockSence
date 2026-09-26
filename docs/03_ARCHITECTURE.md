# 03 — Architecture

All choices in this document are **implementation decisions** (not sourced from the PDF/mockups,
which are UI/functional-only) made to enable 4-way parallel development on a hackathon timeline.

## 1. Style
Modular monolith, single deployable backend service + single frontend SPA. No microservices —
unnecessary complexity for a 4-phase hackathon MVP.

## 2. Tech Stack
| Layer | Choice | Reason |
|---|---|---|
| Frontend | React + Vite, React Router, a lightweight fetch/axios client | Fast dev loop, component-driven, matches Person 2's mandate |
| State/Data | React Query (server cache) + local component state | Avoids hand-rolled caching, plays well with contract-first mocking (MSW) |
| Backend | Node.js + Express (or Fastify) | Fast to scaffold, JSON-first, easy to mock/stub for contract-first flow |
| Database | PostgreSQL | Relational integrity needed for stock ledger correctness; free-tier friendly |
| ORM | Prisma (or Sequelize) | Fast migrations + type-safe queries, good for a 4-day build |
| Auth | JWT (access token) issued on login/signup, stored client-side | Stateless, simple, no session store needed for MVP |
| API style | REST, JSON | Matches contract-first mocking tooling (Postman/MSW) |
| Mocking (frontend) | MSW (Mock Service Worker) or static JSON fixtures matching `05_API_CONTRACTS.md` | Lets Person 2 build UI without waiting on real endpoints |

> **OPEN DECISION:** Exact ORM/framework choice is left to Person 1 at Phase 1 kickoff as long as
> it does not change the API contracts in `05_API_CONTRACTS.md` or the schema in
> `04_DATABASE_SCHEMA.md`.

## 3. High-Level Component Diagram
```
[React SPA] --HTTPS/JSON--> [Express API] --SQL--> [PostgreSQL]
     |                             |
     | (Phase 1: MSW mocks)        | (Phase 1: seed script)
```

## 4. Backend Module Boundaries (maps to `09_TEAM_OWNERSHIP.md`)
| Module | Owner | Responsibility |
|---|---|---|
| `auth` | Person 1 | signup, login, OTP reset, JWT issuance/verification middleware |
| `catalog` | Person 1 | Products, Categories |
| `locations` | Person 1 | Warehouses, Locations |
| `stock-engine` | Person 1 | Central stock read/write functions used by every operation module (single source of truth for increment/decrement, prevents double logic) |
| `sequence` | Person 1 | Reference-number generator (`WH/IN/0001` style) |
| `receipts` | Person 3 | Receipt CRUD + status transitions, calls `stock-engine` |
| `deliveries` | Person 3 | Delivery CRUD + status transitions, calls `stock-engine` |
| `transfers` | Person 3 | Internal Transfer CRUD + status transitions, calls `stock-engine` |
| `adjustments` | Person 3 | Stock Adjustment CRUD, calls `stock-engine` |
| `ledger` / move-history | Person 4 | Read-only aggregation over ledger entries written by `stock-engine` |
| `dashboard` | Person 4 | KPI aggregation queries across all modules |

**Key architectural rule:** only `stock-engine` (Person 1, delivered as a Phase-2 contract/module)
is allowed to write to the `stock` and `stock_ledger` tables. Every operation module
(Receipts/Deliveries/Transfers/Adjustments, Person 3) calls it rather than writing SQL directly.
This is what allows Person 3 to build against a **mocked** `stock-engine` interface in Phase 2/3
before Person 1's real implementation lands.

## 5. Frontend Module Boundaries (all Person 2)
- `auth/` (Login, Signup, Forgot Password)
- `dashboard/`
- `products/` (Catalog tab, Stock tab)
- `operations/receipts/`, `operations/deliveries/`, `operations/transfers/`, `operations/adjustments/`
- `move-history/`
- `settings/warehouse/`, `settings/location/`
- `profile/`
- `shared/` — nav bar, status stepper component, list/kanban toggle component, API client

## 6. Environments
- Local dev: `docker-compose` with Postgres + backend + frontend (Phase 1 deliverable, Person 4
  sets it up so everyone can run the stack identically).
- No staging/prod infra required for a hackathon — local + a single demo deployment
  (Render/Railway/Fly.io) is sufficient, set up in Phase 4 by Person 4.

## 7. Cross-Cutting Concerns
- **Validation:** shared Zod (or Joi) schemas defined once per contract in `05_API_CONTRACTS.md`
  and reused on both client (form validation) and server (request validation) where feasible.
- **Error format:** all API errors return `{ "error": { "code": string, "message": string,
  "fields"?: { [field]: string } } }` — see `05_API_CONTRACTS.md` §0.
- **Auth middleware:** every route except `/auth/*` requires a valid JWT (`Authorization: Bearer
  <token>`).
- **IDs:** all primary keys are UUID v4 strings, except human-facing sequence numbers (receipt/
  delivery/transfer/adjustment `reference`), which are business-generated strings, not DB PKs.
