# StockSense — QA Knowledge-Sync Handoff (§42 / §43)

Paste-ready blocks for the `ai/` knowledge suite. Source of truth: `docs/qa-verification-report.md`.
Revision: `67b12f7` · QA state: `TESTED_INCOMPLETE` · Generated 2026-10-05.

> **SUPERSeded BY ACTUAL FILES.** Blocks A–D below were written *before* remediation.
> The `ai/` suite now exists as real files and carries the **post-fix** state — read
> `ai/known-issues.md`, `ai/current-state.md`, `ai/decisions.md`, `ai/instructions.md`
> instead of pasting these blocks. Block E is retained as the completed fix queue.

---

## Block A → `ai/known-issues.md`

```markdown
## QA-001 (CRITICAL) — The existing test suite cannot fail
- Where: `test_mail_usecases.mjs`
- Evidence: baseline run printed `GET /login -> status 404` followed by
  `Branding check: PASSED (StockSense loaded)` and exited `0`.
- Cause: no assertions anywhere; `main().catch(console.error)` (line 120) swallows every
  rejection; `process.exit` is never called. `/login` is not a route — the only page is
  `src/app/page.tsx` (the app is a hash-view SPA).
- Impact: zero regression safety. A green run proves nothing.
- Do not treat a successful run of this script as evidence of anything.

## QA-002 (CRITICAL) — No test infrastructure
- `package.json` has no `test` script; no jest/vitest/playwright/puppeteer; no CI config.
- Root cause is a standing project rule: `worklog.md:15` — "Run `bun run lint` before
  finishing. Do NOT write test files."
- Blocks QA completion criteria #1, #7, #10, #12.

## QA-003 (HIGH) — Password-reset OTP uses a non-cryptographic PRNG
- Where: `src/app/api/auth/otp/route.ts:22`
  `Math.floor(100000 + Math.random() * 900000)`
- CWE-338. Use `crypto.randomInt(100000, 1000000)`.

## QA-004 (HIGH) — No attempt limiting on OTP verification
- Where: `src/lib/auth/otp-store.ts:28-30`
- A wrong code returns `false` but does NOT delete the entry or count an attempt; only a
  correct code (line 32) or the 10-minute TTL (line 23) clears it.
- Measured: 120 sequential + 500 concurrent attempts against
  `/api/auth/reset-password` produced **zero 429s**.
- Honest sizing: ~64 req/s on this dev server → ~38,680 attempts inside the 600s TTL
  against a 900,000 space → P(success) ≈ 4.21% (750 req/s needed for 50%). So brute force
  is NOT trivially practical today — the severity comes from having no defence in depth at
  all, and from QA-003 making the space predictable.

## QA-005 (MEDIUM) — debugOtp disclosed outside production
- Where: `src/app/api/auth/otp/route.ts:32`
  `debugOtp: process.env.NODE_ENV !== 'production' ? otpCode : undefined`
- Observed live: `debugOtp: '688640'`. Key is absent in a production build.

## QA-006 (MEDIUM) — Anti-enumeration defeated by its own response shape
- Where: `src/app/api/auth/otp/route.ts:19` returns `{message}` only, while `:28-33`
  returns `{success:true, message, debugOtp?}`.
- Verified: unknown account → no `success` key. Different key sets = existence oracle,
  despite the "Anti-enumeration" comment on line 18.

## QA-007 (LOW) — Raw error messages returned on 500
- `otp/route.ts:35-36`, `reset-password/route.ts:61-62` return `err.message` directly.

## QA-008 (MEDIUM) — Acceptance baseline is not reproducible
- `worklog.md:20-30` seed snapshot is stale AND the live DB has drifted.
- AC-06 (delayed receipts = 1) is BLOCKED: `prisma/seed.ts:311` creates that receipt as
  `EXPECTED`, but the live DB shows all 6 receipts `RECEIVED`, so 0 delayed is correct.
- Re-seeding would wipe live data (including in-flight work), so it was not performed.

## QA-009 (MEDIUM) — Deployment tests cannot run
- `tests/{database-runtime-build,python-runtime-build,python-runtime-container}.sh`
  all exit 1 at line 5: `cd: tests/../.zscripts: No such file or directory`.

## QA-010 (MEDIUM) — Requirements/AC document missing
- `worklog.md:4` names "IMPLEMENTATION PLAN — REVISED · Six Phases to Build It" as the
  source of truth; it is not committed. All ACs in this pass are DERIVED from
  `worklog.md`, not authoritative.

## QA-011 (LOW) — Pre-existing tsc errors masked
- `examples/websocket/server.ts(2,24)` missing socket.io; `src/components/ui/carousel.tsx`
  lines 99-100 `'api' is possibly undefined`. Suppressed by `ignoreBuildErrors`.

## QA-012 (INFORMATIONAL) — `npm run build` fails on Windows
- POSIX `cp` in the build script; `✓ Compiled successfully` still appears. Accepted risk.
```

---

## Block B → `ai/current-state.md`

```markdown
## QA / Verification state (revision 67b12f7)

- QA state: TESTED_INCOMPLETE — **7 of 12** completion criteria fully met (4 partial, 1 unmet).
- Lifecycle position unchanged: IMPLEMENTED. Must NOT advance to VALIDATED (BLK-01, BLK-02).
- 152 automated checks executed (82 QA-authored + 70 pre-existing a11y): 146 pass, 4 fail.
- 14 command-level suites: 8 pass, 2 fail, 3 blocked, 1 invalid-evidence.
- Findings: 12 total (2 critical, 2 high, 5 medium, 2 low, 1 informational).
  10 open, 1 blocked, 1 accepted-risk. 0 fixed this pass (QA does not implement).
- Acceptance: 10 passed / 0 failed / 1 blocked / 1 not-tested of 12.

### Independently verified as WORKING
- Ledger reconciles: 46 chains, `diff === newQty - prevQty` on all 96 entries,
  chain continuity holds, tail equals current StockLevel.
- All five engine invariants from `worklog.md:12`: available = onHand - reserved,
  atomic check-then-update, no overselling, no negative stock, ledger entry per change.
- Concurrency: 8 parallel individually-satisfiable deliveries → exactly 1 success;
  losers read post-commit state (24 → 11). Cleanup restored stock exactly.
- Auth: 401 with identical message for bad-password vs unknown-account; session actually
  destroyed on logout; stale cookie → 401.
- Permission gate runs BEFORE resource lookup (staff 403 vs manager 404 on unknown id) —
  no object-ID oracle.
- Blocked operations write nothing partial (stock and ledger byte-identical after).
- Error handling: malformed JSON, empty bodies, unknown IDs, negative numbers,
  invalid enums all return structured 4xx — no unhandled 500, no stack traces.
- `dashboard.attention.summary === /api/attention.summary` (single computation source).

### Baseline commands (all reproduced at 67b12f7)
| command | result |
|---|---|
| `npm run lint` | exit 0 — 0 errors, 3 warnings |
| `npx tsc --noEmit` | exit 2 — 3 errors |
| `npm run audit:a11y` | exit 0 — 70/70 PASS |
| `npm run build` | `✓ Compiled successfully`; exit 1 = Windows `cp` |
| `node test_mail_usecases.mjs` | exit 0 — INVALID EVIDENCE (QA-001) |
| `bash tests/*.sh` (×3) | exit 1 line 5 — BLOCKED (QA-009) |

### NOT verified
UI rendering; keyboard/screen-reader behaviour (delegated, HEURISTIC_REVIEW only);
code coverage (never claim coverage — not measured); real SMTP delivery (in-memory inbox);
deployment packaging; receipt/transfer/count paths under concurrency; performance vs
targets (none documented); mail/OTP functional correctness end-to-end.

### Data footprint of this QA pass
QA mutated `db/custom.db` only through the app's own API during mandated baseline and
concurrency testing, then cancelled its own documents:
- created + cancelled 1 delivery probe → stock restored exactly (onHand 79, reserved 20)
- ledger 96 → 101: +2 from the concurrency probe (create/cancel), +3 from running
  `test_mail_usecases.mjs` (created DEL-2010, walked to DELIVERED)
- `RM-STL-ROD10` onHand 79 → 78 (deducted by DEL-2010) — caused by the existing E2E script
- all direct DB access used `readOnly: true`
```

---

## Block C → `ai/decisions.md`

```markdown
## D-QA-01 — Derived ACs are provisional until the requirements document is committed
The authoritative IMPLEMENTATION PLAN referenced by `worklog.md:4` is absent. Per the QA
source hierarchy, conflicts were NOT silently reconciled: recorded as
TEST-DESIGN-CONTRADICTION #1 and verification fell back to Project Knowledge +
implementation. `prisma/seed.ts` is authoritative for entity COUNTS; the live DB is
authoritative for CURRENT STATE; `worklog.md` snapshot figures are historical only.

## D-QA-02 — Stale expectations are BLOCKED, never FAILED
`delayedReceipts = 0` is the correct computation for the current database, so AC-06 is
recorded as BLOCKED (cannot be re-derived without a destructive re-seed), NOT as a product
defect. Severity must not be inflated because an expectation went stale.

## D-QA-03 — My own failing tests were audited before being reported as defects
2 of 3 initial failures were harness bugs and were withdrawn as FALSE-POSITIVE:
`QA-N01` (StockByLocationDTO has no `productId`) and `QA-P04` (staff legitimately holds
`adjust` per `permissions.ts:30`). One false PASS was also caught: `QA-N02` originally
passed because a 400 came from schema validation rather than the oversell check.

## D-QA-04 — The concurrency probe was re-run after being found vacuous
The first attempt sized `qty` from product-level availability (59) while deliveries check
per-location availability (24), so all 8 requests failed independently of concurrency and
`successes = 0` would have passed against a completely non-atomic engine. Re-run with
`qty = 13 ≤ 24` produced a genuinely discriminating result (exactly 1 success).

## D-QA-05 — QA created no test files inside the repository
`worklog.md:15` states "Do NOT write test files." This conflicts with the QA mandate to
produce verification scripts. Resolution: the contradiction is recorded, and all QA
scripts live outside the repo in the approved temp directory, with the evidence register
documenting how to re-run them. RECOMMENDATION: revisit this rule — it is the root cause
of QA-002 and therefore of QA-001.

## D-QA-06 — Security findings are reported, not fixed
Per the QA role boundary, `src/app/api/auth/otp`, `reset-password` and
`src/lib/auth/otp-store.ts` (all uncommitted, in-flight work) were NOT modified. Findings
QA-003..QA-007 are handed to the Completion Engineer / Security engineer with reproduction
and recommended fixes.

## D-QA-07 — Brute-force severity was sized, not asserted
No rate limiting is a fact (0 of 620 attempts returned 429). But measured throughput
(~64 req/s) gives only ~4.21% success probability inside the 10-minute TTL, so this was
graded HIGH rather than CRITICAL. Do not upgrade it without new throughput evidence.
```

---

## Block D → `ai/instructions.md` (additions)

```markdown
## Testing (QA)
- `npm test` does NOT exist. There is no test runner on this branch. Do not claim
  "tests pass" — state exactly which command you ran and what it proved.
- Never treat `node test_mail_usecases.mjs` exiting 0 as evidence: it has no assertions
  and reports PASSED for HTTP 404 (QA-001).
- Baseline before and after any change: `npm run lint`, `npx tsc --noEmit`,
  `npm run audit:a11y`, `npm run build`.
  - lint → must be 0 errors.
  - tsc → 3 known errors are pre-existing (QA-011); do not add new ones.
  - build → look for `✓ Compiled successfully`; exit 1 is the Windows `cp`, not a failure.
- `worklog.md` says "Do NOT write test files" (line 15). Until that rule is revisited,
  keep verification scripts outside the repo; document how to re-run them.

## When touching the inventory engine
- Every quantity change MUST go through `bumpStock` inside `db.$transaction`.
- Five invariants are regression-guarded and must keep holding:
  1. `available = onHand - reserved` (per-location AND aggregate)
  2. atomic check-then-update
  3. no overselling
  4. no negative stock on any field
  5. a ledger entry for every change, with `diff === newQty - prevQty` and chain continuity
- Verification: run the ledger reconciliation check (read-only) after engine changes.

## When touching auth / password recovery
- OTP must come from a CSPRNG (`crypto.randomInt`), never `Math.random()` (QA-003).
- Verification attempts must be rate-limited and a wrong code must invalidate the OTP
  (QA-004).
- The OTP must never appear in a response body (QA-005).
- Unknown-account and known-account responses must be byte-identical (QA-006).
- Return a generic `{error:'Internal error'}` on unexpected failures, never `err.message`
  (QA-007).

## Status codes actually in use (verified)
400 validation · 401 unauthenticated / bad credentials · 403 role lacks permission ·
404 unknown resource · 422 CRITICAL below-zero adjustment blocked · 500 unexpected.
Permission checks run BEFORE resource lookup — preserve that ordering (no ID oracle).
```

---

## Block E → Completion Engineer priority queue (§43)

**All 12 items actioned on 2026-10-05 under explicit owner delegation, then re-verified by
execution (report §28).** Status after remediation: 8 RESOLVED · 3 PARTIAL · 1 BLOCKED.

| Pri | QA-ID | One-line fix | Status |
|---|---|---|---|
| P0 | QA-001 | Give the E2E script real assertions + non-zero exit on failure; target `/`, not `/login` | **RESOLVED** — 24 checks, exit 1 on failure |
| P0 | QA-002 | Add a test runner + `test` script + CI; revisit `worklog.md:15` | **PARTIAL** — `node:test` + 50 tests; CI still absent |
| P1 | QA-003 | `crypto.randomInt(100000, 1000000)` | **RESOLVED** |
| P1 | QA-004 | Attempt counter in `otp-store` + rate limit; invalidate after N misses | **RESOLVED** — 5 attempts → destroy → 429 |
| P2 | QA-005 | Gate `debugOtp` on an explicit opt-in var, not `NODE_ENV` | **RESOLVED** — `OTP_DEBUG=1` |
| P2 | QA-006 | Return byte-identical bodies for known/unknown accounts | **RESOLVED** |
| P2 | QA-008 | Refresh the seed snapshot from `seed.ts`; add a non-destructive fixture path | **PARTIAL** — correction appended; fixture path missing |
| P2 | QA-009 | Vendor `.zscripts` helpers or remove `tests/*.sh` | **BLOCKED** — loud SKIP added; root cause open |
| P2 | QA-010 | Commit the Implementation Plan / acceptance criteria | **PARTIAL** — derived `docs/acceptance-criteria.md` only |
| P3 | QA-007 | Generic 500 message, log the detail server-side | **RESOLVED** |
| P3 | QA-011 | Fix `carousel.tsx` `api` possibly-undefined; drop `examples/` from the tsc program | **RESOLVED** — `tsc` exit 0 |
| P4 | QA-012 | Cross-platform copy in the build script | **RESOLVED** — build exit 0 |
