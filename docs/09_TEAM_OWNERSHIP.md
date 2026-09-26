# 09 — Team Ownership

## Ownership by Code Area
| Area | Owner | Backup |
|---|---|---|
| `backend/src/auth/*` | Person 1 | Person 4 |
| `backend/src/catalog/*` (Products, Categories) | Person 1 | Person 3 |
| `backend/src/locations/*` (Warehouses, Locations) | Person 1 | Person 4 |
| `backend/src/stock-engine/*` | Person 1 | — (single owner, critical path) |
| `backend/src/sequence/*` | Person 1 | — |
| `backend/src/receipts/*` | Person 3 | Person 1 |
| `backend/src/deliveries/*` | Person 3 | Person 1 |
| `backend/src/transfers/*` | Person 3 | Person 1 |
| `backend/src/adjustments/*` | Person 3 | Person 1 |
| `backend/src/dashboard/*` | Person 4 | Person 3 |
| `backend/src/move-history/*` | Person 4 | Person 3 |
| `frontend/src/*` (all screens) | Person 2 | Person 4 (QA fixes only) |
| `frontend/src/mocks/*` | Person 2 (consumer), Person 3 (fixture author for §6–§10) | — |
| `infra/docker-compose.yml`, CI scripts, seed script | Person 4 | Person 1 |
| All `docs/*.md` (this document set) | Shared — each person updates the sections describing
their own module; Person 4 maintains `14_CHANGELOG.md` | — |

## Decision Authority
| Decision type | Final say |
|---|---|
| Database schema changes | Person 1, with sign-off from whoever's module is affected |
| API contract changes after freeze | Proposer documents in `14_CHANGELOG.md`, needs ack from
the contract's consumer before merging |
| UI/UX interpretation of ambiguous mockup details | Person 2, cross-checked against
`02_UI_FUNCTIONALITY.md` OPEN DECISIONs |
| Business rule interpretation (ambiguous PDF wording) | Person 3, documented as an OPEN
DECISION in `01_REQUIREMENTS.md`/`06_BUSINESS_RULES.md` |
| Git/branching/process issues | Person 4 |

## Communication Cadence
- Daily 10-minute sync at phase midpoint and phase end (integration checkpoint) — see
  `08_PHASE_PLAN.md` §12 of each phase.
- Any contract change after freeze must be posted to the team channel before merging, not just
  written in the changelog after the fact.

## Escalation
If two people disagree on an ambiguous requirement, default to the literal PDF text over the
mockup (per project ground rule: "The PDF is the primary functional requirement source"), and
record the resolution as an OPEN DECISION entry.
