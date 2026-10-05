# StockSense — Decision Record

> Each decision records *why*, so a later agent can reverse it knowingly. Never silently
> change a decision here — supersede it with a new entry and date it.

## D-QA-01 — Derived ACs are provisional until the requirements document is committed
The authoritative *IMPLEMENTATION PLAN* referenced by `worklog.md:4` is absent from the
repository. Per the QA source hierarchy, conflicts were **not** silently reconciled:
recorded as TEST-DESIGN-CONTRADICTION #1, and verification fell back to Project Knowledge
+ implementation. Authority order in force:
`prisma/seed.ts` → entity **counts**; live DB → **current state**; `worklog.md` snapshot
figures → **historical only**.
See `docs/acceptance-criteria.md`.

## D-QA-02 — Stale expectations are BLOCKED, never FAILED
`delayedReceipts = 0` is the correct computation for the current database, so AC-06 is
BLOCKED (cannot be re-derived without a destructive re-seed), not a product defect.
Severity must never be inflated just because an expectation went stale.

## D-QA-03 — Own failing tests are audited before being reported as defects
Two of three initial QA failures were withdrawn as FALSE-POSITIVE: `QA-N01`
(`StockByLocationDTO` has no `productId`) and `QA-P04` (staff legitimately holds
`adjust`). One false PASS was also caught: `QA-N02` passed only because a 400 came from
schema validation rather than the oversell check. **Always ask whether the harness or the
product failed.**

## D-QA-04 — A vacuous test is a defect in the test
The first concurrency probe sized `qty` from product-level availability (59) while the
engine checks per-location availability (24), so all 8 requests failed independently of
concurrency — a fully non-atomic engine would still have "passed". Re-run with
`qty = 13 ≤ 24` produced a genuinely discriminating result (exactly 1 success).

## D-QA-05 — *Superseded 2026-10-05*
Originally: "QA created no test files inside the repository, because `worklog.md:15` says
Do NOT write test files; all QA scripts live in temp."
That rule was the root cause of QA-002 (CRITICAL) and therefore QA-001. The owner later
explicitly delegated the fix, so the rule is **overridden for the verification role** and
the correction was appended to `worklog.md` (append-only, per its line 18).
**Current rule:** regression tests live in `tests/unit/` and `tests/e2e/`. A future agent
that wants to delete them to satisfy `worklog.md:15` must first get explicit instruction.

## D-QA-06 — Security findings are reported, then fixed only under explicit delegation
During the read-only QA pass, `src/app/api/auth/otp`, `reset-password` and
`src/lib/auth/otp-store.ts` were NOT modified — findings QA-003..QA-007 were handed off
instead. They were later fixed only because the owner explicitly chose "fix the 12 QA
findings". **Do not treat a finding as licence to edit someone else's in-flight work.**

## D-QA-07 — Brute-force severity is sized, not asserted
No general rate limiting is a fact (0 of 620 attempts returned 429). But measured
throughput (~64 req/s) gives only ~4.21% success probability inside the 10-minute TTL
(750 req/s would be needed for 50%), so the issue was graded HIGH rather than CRITICAL.
**Do not upgrade severity without new throughput evidence.**

## D-QA-08 — `examples/` is out of the typecheck scope (not "fixed")
`examples/websocket/server.ts` imports `socket.io`, which is not installed and is not
referenced anywhere in `src/`. Two options existed: add a dependency for an unused demo,
or scope it out. Chose scoping it out of `tsconfig.json` and documenting it.
**This is scope-narrowing, not a fix** — the import still cannot resolve. A future agent
must not cite "tsc is green" as evidence that `examples/` compiles.

## D-QA-09 — A SKIP must never read as a PASS
`tests/*.sh` now exit 0 with an unmistakable `SKIP … verified NOTHING` message, because
their subject (`.zscripts/`) was never committed. The distinction matters: QA-001 was
CRITICAL precisely because a check printed `PASSED` while proving nothing. Any new skip
path must state, in the output itself, that nothing was verified.

## D-QA-10 — E2E tests assert stable invariants, not seeded counts
Absolute seeded counts drift as the database is used (QA-008). `tests/e2e/api.test.mjs`
therefore asserts shapes, status codes, self-consistency (`summary.belowReorder ===
below.length`), and engine rules. **Do not add a test asserting `SKU count === 19`.**

## D-QA-11 — `debugOtp` is gated on an explicit opt-in, accepting a local-config cost
`OTP_DEBUG=1` must be set in `.env` (gitignored) for the login view's click-to-autofill
helper to appear. This deliberately trades "works on a fresh clone with zero setup" for
"cannot leak a reset code from a non-production deployment". If the helper disappears for
a new contributor, the answer is to document `OTP_DEBUG`, not to revert to `NODE_ENV`.

## D-QA-12 — Test tooling stays dependency-free
The runner is Node's built-in `node:test`, chosen because the project had no test
dependencies and `worklog.md` discourages adding infrastructure. Node 24's type stripping
lets `tests/unit/otp-store.test.mjs` import the real `.ts` source, so the test cannot
drift from the implementation. **Do not add jest/vitest/playwright without discussion.**
