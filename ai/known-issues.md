# StockSense — Known Issues

> Every entry states whether it is **OPEN**, **MITIGATED**, or **CLOSED**.
> Closed items are kept briefly so a future agent does not "rediscover" them.
> Last updated 2026-10-05.

## OPEN

### UX-018 — Checkbox "Remember me" label not associated with its control
- Where: `src/components/auth/login-view.tsx:527`
- Severity: MEDIUM (WCAG 2.4.4 / 4.1.2). Deferred because the file is in-flight human work.
- Do not "fix" it without coordinating — the surrounding view is being rewritten.

### UX-025 — `aria-describedby` chain incomplete for the reset/new-password fields
- Where: `src/components/auth/login-view.tsx:379`, `:409`
- Severity: MEDIUM (WCAG 1.3.1 / 3.3.1). Error text exists but is not linked to the input.
- Also tracked by `npm run audit:a11y` as `all linked except known-open finding UXA-025`.

### UX-026 — Topbar icon button has no accessible name at one breakpoint
- Where: `src/components/ui/topbar.tsx:84`
- Severity: LOW. In-flight file.

### QA-008 — Acceptance baseline cannot be reproduced without destroying data
- The `worklog.md:20-30` seed snapshot is stale; a correction record was **appended** to
  that file, but the numbers in lines 20-30 themselves were deliberately left as history.
- AC-06 (delayed receipts = 1) stays **BLOCKED**: `seed.ts:311` creates it as `EXPECTED`,
  but every receipt in the live DB has since been walked to `RECEIVED`, so
  `delayedReceipts = 0` is the *correct* computation.
- Re-running `bun prisma/seed.ts` **wipes the database**, including in-flight work.
- **Needed:** a non-destructive fixture path (e.g. `seed --dry-run` writing to a scratch DB).

### QA-009 — Deployment tests verify nothing
- `tests/{database-runtime-build,python-runtime-build,python-runtime-container}.sh`
  depend on `.zscripts/`, which is not in this repository and never was.
- Now **MITIGATED**: they print an unmistakable `SKIP … verified NOTHING` and exit 0
  instead of dying at `line 5`.
- Root cause is open: either vendor `.zscripts/` or delete the scripts. Until then the
  deployment story (build → package → start) has **no test coverage at all**.

### QA-002 (residual) — No CI
- A runner and 50 regression tests now exist, but nothing runs them automatically.
- **Needed:** a CI workflow running `lint`, `tsc`, `audit:a11y`, `test`, `build`.

### No rate limiting on general endpoints
- OTP verification is now attempt-limited, but `/api/auth/otp` (mail dispatch),
  `/api/auth/login` and the other routes have no request throttling. A measured ~64 req/s
  is achievable against the dev server. See `docs/security-audit-report.md` for the
  independent assessment.

## CLOSED (2026-10-05)

| ID | Was | Now |
|---|---|---|
| QA-001 | E2E script had no assertions, swallowed errors, exited 0, reported PASSED for a 404 on `/login` | 24 real checks, `process.exitCode = 1` on failure, route corrected to `/` |
| QA-002 | No test runner, no `test` script | `npm test` (16) + `npm run test:e2e` (34) via `node:test`, zero new dependencies |
| QA-003 | OTP from `Math.random()` (CWE-338) | `crypto.randomInt(100000, 1000000)` |
| QA-004 | No attempt limiting; wrong code never invalidated | 5-attempt cap, code destroyed on lock, HTTP 429 |
| QA-005 | `debugOtp` gated on `NODE_ENV !== 'production'` | gated on explicit `OTP_DEBUG=1` |
| QA-006 | Known/unknown account responses had different keys | single shared payload; identical bodies |
| QA-007 | Raw `err.message` returned on 500 | generic `{error:'Internal error'}`, detail logged server-side |
| QA-010 | No requirements/AC document at all | `docs/acceptance-criteria.md` — **derived**, clearly labelled provisional |
| QA-011 | 3 pre-existing tsc errors | `npx tsc --noEmit` → exit 0 (`carousel.tsx` guarded; `examples/` scoped out) |
| QA-012 | `npm run build` exited 1 on Windows (`cp`) | `scripts/copy-standalone.mjs`; build → exit 0 |
| — | `worklog.md:15` "Do NOT write test files" | superseded; correction **appended** to `worklog.md` |

## Anti-patterns to avoid re-introducing

- **A test that cannot fail.** `test_mail_usecases.mjs` once printed `PASSED` for an HTTP
  404 on a route that does not exist. Any assertion-free check is worthless.
- **A vacuous assertion.** One anti-enumeration check written during QA passed
  unconditionally (`!('debugOtp' in unknown)` is always true) and had to be tightened.
- **A mis-sized concurrency probe.** Sizing a race test from product-level rather than
  per-location availability made all requests fail *regardless* of concurrency, so a fully
  broken engine would have "passed".
- **Treating a SKIP as a PASS.** Distinguish `skip()`, `pass()` and `fail()` explicitly.
- **Running shared-state e2e files in parallel.** `node --test` fans out across *files* by
  default. Two e2e suites touching the same SQLite file then interfere — observed as a
  ledger assertion failing with `actual: 4, expected: 2`. `npm run test:e2e` pins
  `--test-concurrency=1`; keep it.
