# 10 — Dependency Matrix

"Can Start Immediately?" = Yes means the task can start at phase kickoff without waiting on any
other in-phase artifact (may still depend on a prior phase's already-delivered artifact).

| Phase | Task | Owner | Can Start Immediately? | Depends On | Blocking Person | Required Artifact | Integration Point |
|---|---|---|---|---|---|---|---|
| 1 | Backend project init + Dockerfile stub | P1 | Yes | — | — | — | Phase 1 checkpoint |
| 1 | `users`/`otp_requests` migrations + `/auth/*` endpoints | P1 | Yes | — | — | — | Phase 1 checkpoint |
| 1 | Auth API contract (§1) freeze | P1 | Yes | — | — | §1 contract doc | Phase 1 kickoff |
| 1 | Nav shell + routing | P2 | Yes | — | — | — | Phase 1 checkpoint |
| 1 | Login/Signup/Forgot-Password UI | P2 | Yes (against mock) | §1 contract | P1 (for live swap) | §1 mock fixtures | Phase 1 checkpoint |
| 1 | Stock-engine interface draft | P3 | Yes | — | — | interface doc | Phase 2 kickoff |
| 1 | Schema/contract review | P3 | Yes | `04_DATABASE_SCHEMA.md`, `05_API_CONTRACTS.md` | — | — | Phase 1 kickoff |
| 1 | `docker-compose.yml` | P4 | No | P1's Dockerfile/package.json stub | P1 | Dockerfile stub | Phase 1 checkpoint |
| 1 | Repo structure, branch protection, PR template | P4 | Yes | — | — | — | Phase 1 kickoff |
| 1 | Dashboard KPI contract draft (§5) | P4 | Yes | — | — | §5 contract draft | Phase 2 kickoff |
| 2 | `warehouses`/`locations`/`categories`/`products`/`stock`/`sequence_counters` migrations | P1 | Yes | Phase 1 DB tooling | — | — | Phase 2 checkpoint |
| 2 | Products/Stock/Warehouse/Location endpoints (§2–§4) | P1 | Yes | §2–§4 contract freeze | — | — | Phase 2 checkpoint |
| 2 | Stock-engine implementation | P1 | Yes | Phase 1 interface draft | — | function signatures published mid-phase | Phase 3 kickoff (hard gate) |
| 2 | Products/Stock UI | P2 | Yes (against mock) | §2/§3 contract | P1 (live swap) | §2/§3 mock fixtures | Phase 2 checkpoint |
| 2 | Warehouse/Location UI | P2 | Yes (against mock) | §4 contract | P1 (live swap) | §4 mock fixtures | Phase 2 checkpoint |
| 2 | Dashboard UI | P2 | Yes (against mock) | §5 contract | P4 (live swap) | §5 mock fixtures | Phase 2 checkpoint |
| 2 | §6–§9 contract freeze + mock fixtures | P3 | Yes | Phase 1 schema review | — | §6–§9 contract docs | Phase 2 checkpoint (unblocks Phase 3 P2 work) |
| 2 | BR test matrix (BR12–BR18) | P3 | No | Stock-engine function signatures | P1 | signatures doc | Phase 3 kickoff |
| 2 | Dashboard KPI endpoint (§5) | P4 | Yes | `stock_moves`/`stock_ledger` schema (exists) | — | — | Phase 2 checkpoint |
| 2 | Seed script | P4 | Yes | Phase 2 schema | — | — | Phase 2 checkpoint |
| 2 | Integration test harness skeleton | P4 | Yes | — | — | — | Phase 2 checkpoint |
| 3 | Receipts endpoints (§6) full impl | P3 | Yes | Stock-engine impl (Phase 2) | P1 | stock-engine lib | Phase 3 checkpoint |
| 3 | Deliveries endpoints (§7) full impl | P3 | Yes | Stock-engine impl (Phase 2) | P1 | stock-engine lib | Phase 3 checkpoint |
| 3 | Receipts UI live wiring | P2 | Yes (against mock, incremental swap) | §6 endpoints landing incrementally | P3 | per-endpoint merges | Phase 3 checkpoint |
| 3 | Deliveries UI live wiring + red-row/alert logic | P2 | Yes (against mock, incremental swap) | §7 endpoints landing incrementally | P3 | per-endpoint merges | Phase 3 checkpoint |
| 3 | Shared List/Kanban toggle + status stepper components | P2 | Yes | — | — | — | Phase 3 checkpoint |
| 3 | Receipt/Delivery lifecycle integration tests | P4 | No | P3's endpoints reaching Done state | P3 | at least 1 Receipt + 1 Delivery flow working | Phase 3 checkpoint |
| 3 | KPI regression check vs real data | P4 | No | Phase 3 Receipt/Delivery data existing | P3 | — | Phase 3 checkpoint |
| 3 | QA pass on Receipts/Deliveries UI vs mockups | P4 | No | P2's UI reaching feature-complete | P2 | — | Phase 3 checkpoint |
| 4 | Low-stock alert query + endpoint support | P1 | Yes | Phase 2 schema | — | — | Phase 4 checkpoint |
| 4 | §8/§9 contract freeze | P3 | Yes | — | — | §8/§9 contract docs | Phase 4 kickoff |
| 4 | Internal Transfers endpoints (§8) | P3 | Yes | Stock-engine two-leg move support | P1 | — | Phase 4 checkpoint |
| 4 | Stock Adjustments endpoints (§9) | P3 | Yes | Stock-engine set-quantity support | P1 | — | Phase 4 checkpoint |
| 4 | Transfers/Adjustments UI | P2 | Yes (against mock, incremental swap) | §8/§9 endpoints landing incrementally | P3 | per-endpoint merges | Phase 4 checkpoint |
| 4 | Move History endpoint (§10) | P4 | Yes | `stock_ledger` data from Phase 3 | — | — | Phase 4 checkpoint |
| 4 | Move History UI | P2 | Yes (against mock) | §10 contract | P4 (live swap) | §10 mock fixtures | Phase 4 checkpoint |
| 4 | Profile UI | P2 | Yes | Phase 1 `/auth/me` endpoints | — | — | Phase 4 checkpoint |
| 4 | Final regression suite + PDF example E2E test | P4 | No | All Phase 1–4 features complete | P1/P2/P3 | — | Final integration |
| 4 | Demo deployment | P4 | No | Feature-complete build | P1/P2/P3 | — | Final integration |
| 4 | Final QA sign-off vs `01_REQUIREMENTS.md` | P4 | No | Regression suite green | P1/P2/P3 | — | Final integration |
