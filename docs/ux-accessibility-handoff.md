# UX & Accessibility — Knowledge-Sync Handoff

| | |
|---|---|
| **From** | UX & Accessibility Engineer workflow |
| **Date** | 2026-10-05 |
| **Report** | `docs/ux-accessibility-report.md` |
| **Manifest** | `docs/ux-accessibility-manifest.json` |
| **Audit target** | `67b12f7` (branch `main`; `nextjs-pwa` resolves to the same commit) |

This document carries the findings that outlive the audit itself. No `ai/`
knowledge directory exists in this repository, so each block below is written to
be pasted as-is into the corresponding file should one be created
(`ai/known-issues.md`, `ai/current-state.md`, `ai/decisions.md`).

---

## → `ai/known-issues.md`

```markdown
## UXA-018 — Keyboard-inaccessible OTP debug affordance (login)
- **Status:** OPEN · **Severity:** Low · **WCAG:** 2.1.1
- **Where:** `src/components/auth/login-view.tsx:527`
- **What:** `<span className="… cursor-pointer" onClick={() => setResetOtp(debugOtp)}>`
  is a click-only control with no keyboard path.
- **Why it was not fixed during the audit:** this file carries in-flight
  uncommitted work on the mail/OTP feature; editing it risked clobbering
  changes not yet written to disk.
- **Fix:** promote to `<button type="button">`, or add `role="button"`,
  `tabIndex={0}` and Enter/Space handling.
- **Detected by:** `npm run lint` (jsx-a11y extended set, warning level).

## UXA-025 — Login field errors are flagged invalid but never described
- **Status:** OPEN · **Severity:** Medium · **WCAG:** 1.3.1 / 3.3.1
- **Where:** `src/components/auth/login-view.tsx:379` and `:409`
- **What:** the email and password inputs set `aria-invalid`, but the sibling
  error `<p>` at `:383` / `:413` has no `id` and the inputs have no
  `aria-describedby`. Assistive tech announces *"invalid entry"* without ever
  saying why.
- **Why it was not fixed during the audit:** same file as UXA-018 — it carries
  in-flight uncommitted mail/OTP work.
- **Fix:** add an `id` to each error `<p>` and reference it from the input with
  `aria-describedby`, mirroring `new-delivery-dialog.tsx`.
- **Detected by:** `npm run lint` is silent here; found by review. `SG-13`
  encodes the exception — it currently reports
  `all linked except known-open finding UXA-025`, and clears itself once fixed.

## UXA-026 — Topbar `<h2>` precedes the document's only `<h1>`
- **Status:** OPEN · **Severity:** Low · **WCAG:** 1.3.1 (heading order)
- **Where:** `src/components/shell/topbar.tsx:84`
- **What:** the topbar renders the view label as `<h2>` *before* `<main>`, and
  all 11 views pass that identical string as their `PageHeader` `<h1>`. Heading
  navigation therefore announces every view name twice, with the level
  descending before it ascends.
- **Why it was not fixed during the audit:** `topbar.tsx` carries in-flight
  owner work (+25 lines for the mail hub).
- **Fix:** change `<h2>` to `<p>` at line 84. Tailwind preflight resets heading
  size and weight to inherit, so the rendered output is visually identical.

## UXA-018-adjacent — build script does not run on Windows
- **Status:** OPEN · **Not a UX defect**, recorded here because it masks real
  failures.
- **What:** `package.json`'s `build` script chains `cp -r …`. `cp` does not
  exist on Windows, so `npm run build` exits 1 **even when Next.js compiled
  successfully**. Read the output for `✓ Compiled successfully` before treating
  a non-zero exit as a build failure.
- **Fix:** replace `cp` with a cross-platform copy (e.g. `cpy-cli`, a small
  Node script, or a `postbuild` hook).

## Pre-existing type errors (untouched by the UX audit)
- `npx tsc --noEmit` reports 3 errors: `src/components/ui/carousel.tsx` (×2,
  `'api' is possibly 'undefined'`) and `examples/websocket/server.ts` (×1,
  missing `socket.io`). Neither was modified by this audit.
- `next.config.ts` sets `typescript.ignoreBuildErrors: true`, so `next build`
  does not surface them. Do not mistake a clean build for clean types.
```

---

## → `ai/current-state.md`

```markdown
## UX / accessibility status (2026-10-05)

- **Guard:** `npm run audit:a11y` → 70/70 checks pass, exit 0.
  Baseline at `67b12f7` with the same guard: **36 failures**.
- **Lint:** `npm run lint` → exit 0, 0 errors, 3 warnings
  (1 pre-existing `react-hooks/incompatible-library` in `login-view.tsx`,
  2 = UXA-018).
- **Build:** compiles; non-zero exit is the pre-existing Windows `cp` issue.
- **Coverage:** 44 token contrast checks (light + dark), 13 hard-coded colour
  pairs, 13 static guards (SG-01…SG-13), and 21 `jsx-a11y` rules in
  `eslint.config.mjs` at warning level.
- **Findings:** 30 total — 22 resolved, 3 open (UXA-018, UXA-025, UXA-026, all
  in the owner's in-flight files), 5 triaged as non-defects.
- **Known gaps:** no assistive-technology testing, no browser execution, no
  user study. Report §7 lists every limitation.
```

---

## → `ai/decisions.md`

```markdown
## D-UXA-01 — Focus ring uses full-strength tokens
**Decision:** `ring-ring` / `outline-ring` at full opacity, never `/50`.
**Why:** a 50% alpha ring composites against the page background and cannot
reach the 3:1 required by WCAG 1.4.11 without driving the token near-black —
which would break it as light-theme text. Measured 1.97 (light) / 2.67 (dark)
before; 4.73 / 7.86 after.
**Guard:** `SG-04` fails on any `(ring|outline)-ring/\d+`.

## D-UXA-02 — `--primary` is tuned as text, not only as a fill
**Decision:** light `--primary: oklch(0.5305 0.144 163.5)`.
**Why:** the token is consumed as text (links, active nav, state chips, scan
caption) and as a fill under `--primary-foreground`. This is the lightest value
that passes 4.5:1 as text *and* 4.5:1 with the foreground over it.
**Consequence:** any lightening for aesthetic reasons reintroduces UXA-001.

## D-UXA-03 — `animate-spin` survives reduced motion
**Decision:** `.animate-pulse`, `.animate-ping` and `.lift:hover` are disabled
under `prefers-reduced-motion: reduce`; `animate-spin` is deliberately kept.
**Why:** the spin is the offline-sync status affordance. Removing it leaves a
static spinner indistinguishable from a frozen one. WCAG 2.3.3 exempts
essential motion.

## D-UXA-04 — Route side-effects live in the app shell, not the store
**Decision:** `document.title`, focus movement and the live announcement are
applied by an effect keyed on `view` inside `app-shell.tsx`.
**Why:** this is a hash-view SPA (`#view=<key>`) with no router, so no
route-transition hook exists. Putting DOM side effects in the zustand store
would couple it to the DOM and break SSR.
**Constraints that must be preserved:**
1. first run is skipped (via a `prevView` ref, which also survives StrictMode);
2. focus is not stolen from an open Radix modal — `openProduct()` switches view
   *and* opens the detail dialog in one store update;
3. the live region's text is written imperatively, because React must not
   manage its children or it wipes them on re-render.

## D-UXA-05 — Skip link must not touch `location.hash`
**Decision:** the skip link calls `preventDefault()` on click.
**Why:** view state is stored in `location.hash`. A fragment navigation to
`#main-content` would clobber `#view=<key>` and break deep links.

## D-UXA-06 — Skip link uses an off-screen offset, not `sr-only`
**Decision:** `fixed -top-24` → `focus:top-3`, rather than
`sr-only focus:not-sr-only`.
**Why:** both utilities set `position`, so which wins depends on Tailwind's
internal sort order. An off-screen offset has no such ambiguity.

## D-UXA-07 — Distinct action colours stay distinct
**Decision:** suggestion/delivery/adjustment action buttons use
`emerald-700`/`amber-700`/`stone-*`, not `bg-primary`.
**Why:** they carry "positive action" semantics that must not collapse into
generic brand green. One step darker in each hue clears AA without losing that
distinction.

## D-UXA-08 — Never simplify `luminance()` in the guard
**Decision:** `scripts/audit-a11y.mjs` linearises sRGB before computing
relative luminance.
**Why:** an earlier one-off audit in this repo skipped linearisation and
reported 11 contrast failures — including "muted text 2.23:1" when the true
value is 5.23:1. Those were false failures.

## D-UXA-09 — A field error must be both *announced* and *described*
**Decision:** every validation message satisfies two independent requirements:
it is announced when it appears (`role="alert"` on the message) **and** it is
programmatically associated with the control (`aria-describedby` pointing at it).
Neither substitutes for the other.
**Why:** both halves failed in this codebase. `FormMessage` mounted a bare `<p>`
at the moment validation failed — nothing was ever spoken — while hand-rolled
dialog fields set `aria-invalid` with an unlinked message, so a screen reader
said *"invalid entry"* and never why. `aria-describedby` only surfaces text when
the field is next focused, which never happens if focus is on the submit button.
**Guard:** `SG-12` (FormMessage keeps its live-region role) and `SG-13` (every
`aria-invalid` control links its error text).

## D-UXA-10 — Fix the shared component, not the call sites
**Decision:** when a defect is generic, fix it once in the shared component and
let every call site inherit it — `TableHead` defaults `scope="col"`,
`FormMessage` carries `role="alert"`, `FormControl` wires `aria-describedby`.
**Why:** a per-call-site fix across 13 tables and 20+ form fields would be
larger, slower to review, and always one missed site away from silently
regressing. `SG-11`…`SG-13` exist to make that regression loud.
```

---

## → `ai/instructions.md` (regression checklist)

```markdown
## Before merging any UI change
1. `npm run audit:a11y` — must exit 0 (70 checks: contrast, colour pairs,
   static guards).
2. `npm run lint` — must exit 0 errors.
3. If `globals.css` theme blocks or the bottom nav changed, re-run #1 and read
   the per-check ratios, not just the exit code.

## When adding a colour
Prefer a design token. If a hard-coded utility is genuinely needed, add a pair
to `HARDCODED_PAIRS` in `scripts/audit-a11y.mjs` with a source `pattern` — the
guard reports `PATTERN-GONE` if the code is later refactored away.

## When adding a form field
- Inside a `Form`/`FormField`, render `<FormMessage>` — it wires
  `aria-describedby` and `role="alert"` for you (D-UXA-09).
- Hand-rolling a field? The error element needs an `id` **and** the control an
  `aria-describedby` referencing it, or `SG-13` fails the build. Setting
  `aria-invalid` alone is not enough — it says *that* something is wrong, never
  *what*.

## When adding a table
Use `<TableHead>` from `src/components/ui/table.tsx` — it defaults
`scope="col"`. A raw `<th>` without `scope` fails `SG-11`.

## When adding a view
- Use `<PageHeader title="…">` — it renders the view's single `<h1>`.
- Add the key to `VIEW_KEYS` (ui-store) and `NAV_SECTIONS`/`NAV_BY_VIEW`
  (shell/nav); SG-05/SG-06 and the title effect both depend on them.
- Do not render the same label as a heading anywhere else in the chrome — that
  is exactly what UXA-026 is.

## When changing focus rings
Never add an alpha. `SG-04` fails on `ring-ring/NN` and `outline-ring/NN`, and
the numeric focus-ring check derives its alpha from source.
```

---

## What to verify after syncing

```bash
npm run audit:a11y   # exit 0, 70/70
npm run lint         # exit 0, 0 errors
npm run build        # look for "✓ Compiled successfully" (exit 1 = Windows cp)
```

All three were green at the time this handoff was written.
