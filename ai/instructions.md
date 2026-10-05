# StockSense — Agent Instructions

> Knowledge-sync target for handoffs. Last synced 2026-10-05 (QA & Verification pass,
> revision `67b12f7`). Update this file when a rule below stops being true — do not let
> it drift silently.

## Project shape

- Next.js 16 App Router, TypeScript, Tailwind CSS 4, shadcn/ui, Prisma + SQLite, Zustand,
  TanStack Query, Recharts.
- **One** user-visible route `/` (`src/app/page.tsx`). Everything else is a client-side
  hash-view switch. There is no `/login` page — do not probe for one.
- Demo credentials are printed on the login screen and are documented in `worklog.md:17`.
- `db/custom.db` is a live SQLite file. Prefer the HTTP API for anything that writes.

## Baseline commands — run these before and after any change

| Command | Expect |
|---|---|
| `npm run lint` | exit 0, **0 errors** (3 pre-existing warnings live in `src/components/auth/login-view.tsx`) |
| `npx tsc --noEmit` | exit 0, 0 errors |
| `npm run audit:a11y` | exit 0, `ALL CHECKS PASS` (70 checks) |
| `npm run build` | exit 0 |
| `npm test` | exit 0 (unit, no server needed) |
| `npm run test:e2e` | exit 0 (needs the dev server on :3000) |
| `npm run test:mail` | exit 0 (needs the dev server on :3000) |

Never claim "tests pass" without naming the command you ran. Never infer a pass from a
process that exits 0 — read the output.

## Testing

- A test runner exists: Node's built-in `node:test` (**no jest/vitest/playwright** — do not
  add them without discussing it first).
  - `tests/unit/*.test.mjs` — pure, read-only, no server. Ledger invariants + OTP store.
  - `tests/e2e/*.test.mjs` — requires `npm run dev` on :3000.
  - **e2e files MUST run sequentially** (`--test-concurrency=1`). They share one mutable
    database, so parallel file execution makes ledger/stock assertions interfere across
    files. Do not remove that flag.
- `npm run test:e2e` deliberately asserts **stable invariants** (shapes, status codes,
  self-consistency, engine rules) rather than absolute seeded counts, because seeded counts
  drift as the database is used. Follow that convention in new tests.
- Tests **create and cancel** their own documents to leave the DB unchanged. Do the same.
- The three `tests/*.sh` deployment scripts **SKIP loudly** — `.zscripts/` was never
  committed (QA-009). A SKIP is not a PASS; they verify nothing today.

## The inventory engine

Every quantity change MUST go through `bumpStock` inside `db.$transaction`
(`src/lib/inventory.ts`). **Never mutate `StockLevel` directly.**

Five invariants are regression-guarded by `tests/unit/ledger-reconcile.test.mjs` and
`tests/e2e/*.test.mjs` and must keep holding:

1. `available = onHand - reserved`, per location **and** in aggregate
2. atomic check-then-update
3. no overselling
4. no negative stock on any field
5. a ledger entry for every change, with `diff === newQty - prevQty`, chain continuity,
   and the chain tail equal to the current `StockLevel`

## Auth / password recovery

- OTP codes come from `crypto.randomInt` — never `Math.random()`.
- Verification is attempt-limited: 5 wrong guesses destroys the code and returns **429**.
- `debugOtp` is returned **only** when `OTP_DEBUG=1` (set in `.env`, which is gitignored).
  If the login view's click-to-autofill helper disappears, check that flag.
- Known and unknown accounts must return **identical** response bodies (no enumeration
  oracle). Do not add a key to only one branch.
- Unexpected failures return `{ error: 'Internal error' }` with 500 and log server-side.
  Never echo `err.message`, stack traces, or paths.

## Status codes in use (verified)

`400` validation · `401` unauthenticated / bad credentials · `403` role lacks permission ·
`404` unknown resource · `422` CRITICAL below-zero adjustment blocked · `429` OTP locked ·
`500` unexpected.

**Permission checks run BEFORE resource lookup** — an unprivileged caller gets `403` even
for an id that does not exist. Preserve that ordering; reversing it creates an object-ID
oracle.

## UI rules (from `worklog.md:16`)

- No blue/indigo.
- Severity palette: red = critical/stockout, orange = review, amber = high,
  emerald = success, zinc neutrals.
- Sticky footer (`min-h-screen flex flex-col` + footer `mt-auto`).
- Mobile-first responsive; sidebar collapses to bottom-nav/hamburger.
- Reuse existing shadcn/ui components in `src/components/ui`.

## Scope warnings

- `src/app/api/auth/otp`, `src/app/api/auth/reset-password`, `src/lib/auth/**`,
  `src/lib/mail/**`, `login-view.tsx`, `topbar.tsx`, `mail-inbox-sheet.tsx` and
  `test_mail_usecases.mjs` belong to **in-flight human work**. Read them freely; change
  them only with explicit instruction.
- `examples/` is a standalone demo excluded from the typecheck — it needs `socket.io`,
  which is not installed. It is not part of the app.
- `AGENTS.md` contains a Next.js agent-rules block written by `next dev`. Do not delete it
  from a diff; it is re-added automatically.
