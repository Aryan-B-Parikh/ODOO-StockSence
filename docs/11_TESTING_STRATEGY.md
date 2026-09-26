# 11 — Testing Strategy

## Ownership
| Test type | Owner | Scope |
|---|---|---|
| Backend unit tests | Module owner (P1 for auth/catalog/locations/stock-engine, P3 for
receipts/deliveries/transfers/adjustments, P4 for dashboard/move-history) | Business rules
(`06_BUSINESS_RULES.md` BR-IDs), validation logic |
| Frontend component tests | P2 | Form validation, status stepper transitions, red-row
rendering, list/kanban toggle |
| Frontend integration tests (MSW-backed) | P2 | Full screen flows against mock fixtures |
| API integration tests (supertest or equivalent, against real DB) | P4 (harness owner),
contributions from module owner per phase | Full request→DB→response cycles |
| End-to-end scenario tests | P4 | The PDF's "Simplified Example" flow (Receive → Transfer →
Deliver → Adjust) |
| Manual QA vs mockups | P4, with P2 support | Visual/interaction fidelity to IMG:1–13 |

## What Gets Tested Per Module (traceability to Business Rules)
| Module | Must cover |
|---|---|
| Auth | BR1–BR6 (loginId/email/password rules, generic error message, OTP expiry/single-use) |
| Stock-engine | BR7–BR16 (reference generation concurrency, on_hand math, ledger writes,
transactional two-leg transfer) |
| Receipts | BR12, BR25, BR27 |
| Deliveries | BR13, BR17, BR18, BR25, BR27 |
| Transfers | BR14, BR16, BR25, BR27, the OPEN DECISION conflict-on-insufficient-stock behavior |
| Adjustments | BR15, BR16 |
| Dashboard | BR19–BR22 |
| Move History | BR23, BR24 |

## Test Data
- P4 maintains one canonical seed dataset (`scripts/seed.ts` or equivalent) used by both manual
  demo and automated integration tests, so numbers shown in the Dashboard/Move History during
  demo match what's asserted in tests.
- The PDF's "Simplified Example" (100kg Steel receipt → transfer to Production Rack → deliver 20
  → adjust −3kg damaged) is the canonical end-to-end fixture, implemented as an automated test in
  Phase 4 and also used as the live demo script.

## Test Gate per Phase
Each phase's Definition of Done (`13_DEFINITION_OF_DONE.md`) requires:
- All unit tests for that phase's new business rules passing.
- The phase's integration checkpoint scenario (defined in `08_PHASE_PLAN.md` §12 per phase)
  reproducible manually and, from Phase 3 onward, via an automated integration test.
- No previously-passing test broken (regression check, owned by P4).

## Out of Scope for MVP Testing
- Load/performance testing.
- Cross-browser testing beyond latest Chrome/Firefox.
- Accessibility audit (nice-to-have if time remains in Phase 4, not required for DoD).
