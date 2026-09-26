# 00 — Project Overview
**Project:** StockSense — Inventory Management System (IMS)
**Type:** 4-person hackathon MVP
**Duration:** 4 phases (parallel development)

## 1. Problem Statement (Source: Hackathon PDF)
Build a modular Inventory Management System that digitizes and streamlines all stock-related
operations within a business, replacing manual registers, Excel sheets, and scattered tracking
methods with a centralized, real-time, easy-to-use app.

## 2. Target Users (Source: PDF)
- **Inventory Managers** — manage incoming & outgoing stock.
- **Warehouse Staff** — perform transfers, picking, shelving, and counting.

> **OPEN DECISION:** The PDF does not specify different permission levels for these two roles.
> For MVP, both roles will have identical access to all screens/actions. `role` is stored on the
> user record for future use but is not enforced anywhere in Phase 1–4. Revisit post-hackathon.

## 3. Core Modules (Source: PDF + Mockups)
1. Authentication (Login, Signup, OTP-based password reset)
2. Dashboard (KPIs, dynamic filters)
3. Products (catalog, categories, stock per location)
4. Stock (on-hand / free-to-use view, manual stock edit)
5. Operations → Receipts (Incoming)
6. Operations → Delivery Orders (Outgoing)
7. Operations → Internal Transfers
8. Operations → Stock Adjustments
9. Move History (unified ledger)
10. Settings → Warehouse & Location management
11. Profile Menu (My Profile, Logout)

## 4. MVP Scope Boundaries
This is a hackathon MVP. The following are explicitly **out of scope** unless a document below
states otherwise:
- Multi-tenant / multi-company support
- Role-based access control enforcement
- Email/SMS OTP delivery via a real provider (a stub/mock OTP flow is acceptable — see
  `01_REQUIREMENTS.md`)
- Reporting/exports (PDF export of receipt/delivery documents is in scope only as "Print" —
  see `06_BUSINESS_RULES.md`)
- Barcode scanning
- Purchase Orders / Sales Orders as separate entities (Receipts/Deliveries are standalone
  documents, matching the mockups — not linked to an upstream PO/SO module)

## 5. Team Structure
| Person | Ownership Area |
|---|---|
| Person 1 | Backend / Database / Core Services (Auth, Products, Warehouses, Locations, Stock engine, Sequence generator) |
| Person 2 | Frontend / UX (all screens, navigation, state management, API integration) |
| Person 3 | Inventory Domain (Receipts, Deliveries, Internal Transfers, Adjustments — business logic & endpoints) |
| Person 4 | Operations / Integration / QA (Move History, Dashboard aggregation, Settings, integration testing, Git hygiene) |

## 6. Phase Structure
| Phase | Focus |
|---|---|
| Phase 1 | Foundation + Authentication |
| Phase 2 | Products + Warehouse + Locations + Stock + Dashboard |
| Phase 3 | Receipts + Deliveries |
| Phase 4 | Internal Transfers + Stock Adjustments + Move History + Settings/Profile + Final Integration |

## 7. Guiding Principles
- **Contract-first development** — API contracts are written and frozen before implementation
  begins each phase; frontend builds against mocks matching the contract.
- **No developer blocks on another finishing a whole phase** — only specific artifacts (a
  contract, a schema, a seed script) are hard dependencies. See `10_DEPENDENCY_MATRIX.md`.
- **Traceability** — every requirement in `01_REQUIREMENTS.md` is tagged with its source
  (PDF section or mockup image) so nothing is invented.
- **Consistency** — terminology, statuses, and field names are identical across every document
  in this set.

## 8. Document Index
| File | Purpose |
|---|---|
| 00_PROJECT_OVERVIEW.md | This file |
| 01_REQUIREMENTS.md | Full functional requirements, sourced and numbered |
| 02_UI_FUNCTIONALITY.md | Screen-by-screen UI/UX spec from mockups |
| 03_ARCHITECTURE.md | System architecture & tech stack |
| 04_DATABASE_SCHEMA.md | Tables, columns, relationships |
| 05_API_CONTRACTS.md | REST endpoint contracts (request/response) |
| 06_BUSINESS_RULES.md | Validation & business logic rules |
| 07_STATUS_WORKFLOWS.md | Status state machines per document type |
| 08_PHASE_PLAN.md | 4-phase detailed execution plan |
| 09_TEAM_OWNERSHIP.md | Who owns what code/module |
| 10_DEPENDENCY_MATRIX.md | Task-level dependency table |
| 11_TESTING_STRATEGY.md | Test ownership and approach |
| 12_GIT_COLLABORATION.md | Branching, commits, merge rules |
| 13_DEFINITION_OF_DONE.md | DoD checklist |
| 14_CHANGELOG.md | Running log of decisions/changes |
| MASTER_EXECUTION_PLAN.md | Single-file execution plan for an autonomous coding agent |
