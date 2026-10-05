# StockSense — Acceptance Criteria

> **PROVENANCE (QA-010).** This file did not previously exist. `worklog.md:4` names a
> *"IMPLEMENTATION PLAN — REVISED · Six Phases to Build It"* as the source of truth, but
> that document is **not committed to this repository**. The criteria below were therefore
> **derived** from the highest available sources:
>
> | Rank | Source | Used for |
> |---|---|---|
> | 1 | Explicit acceptance criteria | **absent** |
> | 2 | Explicit requirements | **absent** |
> | 3 | System design | not present as a document |
> | 4 | API/data contracts | `src/lib/types.ts`, `worklog.md:58-91` |
> | 5 | Repository implementation | `src/lib/inventory.ts`, `prisma/seed.ts` |
> | 7 | Project knowledge | `worklog.md` |
>
> **Treat these as provisional.** If the original Implementation Plan resurfaces, reconcile
> against it and record any contradiction rather than editing these silently.
>
> Generated 2026-10-05 by the QA & Verification Engineer. Verification evidence:
> `docs/qa-verification-report.md`.

---

## 1. Inventory engine invariants

Authoritative source: `worklog.md:12`. Every API route must call the engine inside
`db.$transaction`; `StockLevel` must never be mutated directly.

| AC | Criterion | Verification |
|---|---|---|
| **INV-1** | `available = onHand − reserved` holds **per location** and **in aggregate**, everywhere | `tests/unit/ledger-reconcile.test.mjs` |
| **INV-2** | Updates are **atomic check-then-update** — concurrent satisfiable requests cannot both commit | `tests/e2e/concurrency.test.mjs` |
| **INV-3** | **No overselling** — a reservation is rejected when availability is insufficient | `tests/e2e/api.test.mjs`, concurrency test |
| **INV-4** | **No negative stock** on `onHand` / `reserved` / `incoming` / `inTransit` / `damaged` | unit + e2e |
| **INV-5** | **A ledger entry for every change**, with `diff === newQty − prevQty`, chain continuity, and tail equal to current `StockLevel` | `tests/unit/ledger-reconcile.test.mjs` |

---

## 2. Engine behaviour

| AC | Criterion | Source |
|---|---|---|
| **BEH-1** | Adjustments that would take stock below zero are **blocked with 422** | `worklog.md:43`, `:78` |
| **BEH-2** | Deliveries exceeding availability are **rejected with 400** | `worklog.md:74` |
| **BEH-3** | Adjustment severity engine: LOW auto, MEDIUM 2–15% or repeated 3rd-in-30d flagged, HIGH >15% held for approval, CRITICAL below-zero blocked | `worklog.md:43` |
| **BEH-4** | `bumpStock` clamps ≥ 0 and posts one ledger entry per changed field | `worklog.md:43` |
| **BEH-5** | Reorder suggestions are supplier-aware with MOQ/order-multiple rounding | `worklog.md:43` |

---

## 3. API contract

| AC | Criterion | Source |
|---|---|---|
| **API-1** | Errors surface as `{ error: string }` with the documented status | `worklog.md:58` |
| **API-2** | Unexpected errors return **500 `{ error: 'Internal error' }`** — never raw `err.message`, stack traces or internal paths | `worklog.md:58` |
| **API-3** | Invalid credentials → **401**, with a body **identical** to an unknown account (no user enumeration) | `worklog.md:61` |
| **API-4** | Missing session on a protected route → **401**; missing permission → **403** | `worklog.md:58` |
| **API-5** | Permission checks run **before** resource lookup (no object-ID oracle) | implementation |
| **API-6** | Logout is **401-safe** — always succeeds, destroys the session, invalidates the cookie | `worklog.md:62` |
| **API-7** | Duplicate SKU → **400** | `worklog.md:68` |
| **API-8** | Validation rejects negative numbers and unknown enum values with **400** | `worklog.md:68`, implementation |

---

## 4. Data seeds

Authoritative source for **counts**: `prisma/seed.ts`. Authoritative source for
**current state**: the live database. The `worklog.md:20-30` snapshot is historical and
was found to be stale (QA-008) — figures below are corrected.

| AC | Criterion | Corrected value |
|---|---|---|
| **SEED-1** | Products defined by `seed.ts:106-124` | **19** (worklog said 20) |
| **SEED-2** | Shelf locations created by `seed.ts:84-89` | **16** (worklog said 17) |
| **SEED-3** | Hierarchy: 1 warehouse, 3 zones, 6 racks | unchanged |
| **SEED-4** | Suppliers | 6 |
| **SEED-5** | Steel Rods (`RM-STL-ROD10`) is below its reorder point | holds |
| **SEED-6** | Controller Board (`EL-CTL-CX2`) is a stockout at safety stock 3 | holds |
| **SEED-7** | Carton Box (`PK-CRT-4030`) has 850 on hand / 250 reserved at seed time | drifts with use |
| **SEED-8** | Attention summary is self-consistent with its own item lists | enforced by e2e test |

> **Non-reproducible:** verifying SEED-7/SEED-8 against exact numbers requires
> `bun prisma/seed.ts`, which **wipes the database**. This is why AC-06 in the QA report is
> `BLOCKED` rather than `PASSED`. A non-destructive fixture path is recommended.

---

## 5. Accessibility

Covered separately by `docs/ux-accessibility-report.md` (30 findings) and guarded by
`npm run audit:a11y` (70 checks). Those are labelled **HEURISTIC_REVIEW**, not a user study.

---

## 6. Mail / password recovery (in-flight)

| AC | Criterion | Status |
|---|---|---|
| **MAIL-1** | The 5 documented use cases work end-to-end | verified by `npm run test:mail` (now assert-backed) |
| **SEC-1** | OTP is generated from a **CSPRNG** | `src/app/api/auth/otp/route.ts` |
| **SEC-2** | OTP verification is **attempt-limited**; wrong guesses destroy the code | `src/lib/auth/otp-store.ts` |
| **SEC-3** | The OTP **never appears in a response** unless `OTP_DEBUG` is explicitly set | `src/app/api/auth/otp/route.ts` |
| **SEC-4** | Known and unknown accounts return **identical** responses | `src/app/api/auth/otp/route.ts` |

---

## Test mapping

| Suite | Command | Needs server |
|---|---|---|
| Unit (invariants, OTP) | `npm test` | no |
| API + concurrency | `npm run test:e2e` | yes |
| Mail use cases | `npm run test:mail` | yes |
| Accessibility | `npm run audit:a11y` | no |
| Lint / types | `npm run lint`, `npx tsc --noEmit` | no |
| Deployment | `bash tests/*.sh` | **SKIP** — see QA-009 |
