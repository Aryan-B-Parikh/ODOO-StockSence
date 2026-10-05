# StockSense — Current State

> Reconcile this file whenever verification results change. Last updated 2026-10-05.

## Lifecycle

**IMPLEMENTED.** Do not advance to `VALIDATED`.

QA state: `TESTED_INCOMPLETE` — 7 of 12 completion criteria met (4 partial, 1 unmet).
The remaining unmet criterion is #12, blocked by BLK-02.

## Verification results (all reproduced at `67b12f7` + the fix set)

| Command | Result |
|---|---|
| `npm run lint` | exit 0 — **0 errors**, 3 warnings (all in `src/components/auth/login-view.tsx`) |
| `npx tsc --noEmit` | **exit 0** — 0 errors |
| `npm run audit:a11y` | exit 0 — `ALL CHECKS PASS` (70 checks) |
| `npm run build` | **exit 0** |
| `npm test` | exit 0 — **16/16** (unit) |
| `npm run test:e2e` | exit 0 — **38/38** (contract, auth, permissions, negative, delivery + transfer concurrency) |
| `npm run test:mail` | exit 0 — **24 passed, 0 failed, 2 skipped** |
| `bash tests/*.sh` (×3) | exit 0 — **SKIP** (`verified NOTHING`, QA-009) |

**144 checks executed, 0 failures.** (16 + 34 + 24 + 70.)

## Completion criteria (§45)

| # | Criterion | Met? |
|---|---|---|
| 1 | Critical requirements have test mappings | PARTIAL — ACs are derived, not authoritative |
| 2 | Critical ACs have executable verification | PARTIAL — AC-06 blocked, AC-12 not tested |
| 3 | Happy paths tested | PARTIAL — API yes, UI untested |
| 4 | Important negative paths tested | **YES** |
| 5 | Important boundaries tested | **YES** |
| 6 | Critical integration paths tested | PARTIAL — API↔DB yes, UI no |
| 7 | Regression tests exist for material defects | **YES** (was NO) |
| 8 | Flaky tests identified | **YES** (1) |
| 9 | Test evidence reproducible | **YES** |
| 10 | Critical gaps resolved or accepted | **YES** (was NO — QA-001/002 fixed) |
| 11 | Results synchronized with Project Knowledge | **YES** |
| 12 | No critical validation blocker remains | **NO** — BLK-02 |

**7 met · 4 partial · 1 unmet = 12.**
*(An earlier revision of this table reported "5 + 4 + 7" for 12 criteria — that did not
add up. Corrected here and in the report.)*

## Blockers

| ID | Type | Status |
|---|---|---|
| BLK-01 | VALIDATION — no test framework / `test` script / CI | **PARTIAL**: runner + 50 tests exist; CI still absent |
| BLK-02 | SCOPE — requirements/AC document not in the repo | OPEN. `docs/acceptance-criteria.md` is *derived* and provisional |
| BLK-03 | IMPLEMENTATION — `tests/*.sh` unrunnable, `.zscripts` missing | OPEN. Now skips loudly instead of dying |
| BLK-04 | VALIDATION — AC-06 needs a destructive re-seed | OPEN. Needs a non-destructive fixture path |

## Independently verified as working

- **Ledger reconciles.** Every entry satisfies `diff === newQty - prevQty`; chain
  continuity holds (`prevQty === prior newQty`); every chain tail equals the current
  `StockLevel`; every non-zero `StockLevel` has an `ON_HAND` chain.
- **All five engine invariants** from `worklog.md:12`: `available = onHand - reserved`
  (per-location and aggregate), atomic check-then-update, no overselling, no negative
  stock, ledger entry per change.
- **Concurrency.** 8 parallel individually-satisfiable deliveries → exactly 1 success;
  losers read post-commit state; `reserved` grows by exactly `successes * qty`; cleanup
  restores stock byte-exactly.
- **Auth.** 401 with an *identical* body for bad-password vs unknown-account; session
  genuinely destroyed on logout; stale cookie → 401.
- **Permission gate precedes resource lookup** — staff gets 403 on an id that does not
  exist, manager gets 404. No object-ID oracle.
- **Blocked operations write nothing partial** — stock and ledger byte-identical after.
- **No unhandled 500s / no stack-trace leakage** across malformed JSON, empty bodies,
  unknown ids, negative numbers, invalid enums.
- **OTP** (as of the fix set): CSPRNG, attempt-limited with lockout + 429, `debugOtp`
  opt-in, known/unknown responses identical.
- `dashboard.attention.summary === /api/attention.summary` (single computation source).

## Not verified

UI rendering; keyboard/screen-reader behaviour (delegated — `HEURISTIC_REVIEW`, never a
user study); code coverage (**never claim coverage — not measured**); real SMTP delivery
(mail is in-memory); deployment packaging (BLK-03); receipt/transfer/cycle-count paths
under concurrency; performance against targets (none are documented); mail/OTP functional
correctness end-to-end beyond the checks listed above.

## Data footprint

QA mutated `db/custom.db` **only through the app's own API**, during mandated baseline,
E2E and concurrency runs:

- all direct DB access used `readOnly: true`
- concurrency probe created then cancelled its own order → stock restored exactly
- `test_mail_usecases.mjs` creates a delivery and walks it to `DELIVERED`, so running it
  deducts 1 unit and adds ledger entries — that is the use case under test, not drift
- `RM-STL-ROD10` onHand moved 79 → 78 as a result of that existing E2E flow

The in-memory mail inbox resets whenever the dev server restarts.

## In-flight human work (do not touch without instruction)

`src/app/api/auth/otp`, `src/app/api/auth/reset-password`, `src/app/api/mail`,
`src/lib/auth`, `src/lib/mail`, `src/components/auth/login-view.tsx`,
`src/components/ui/topbar.tsx`, `src/components/mail/mail-inbox-sheet.tsx`,
`test_mail_usecases.mjs`.
