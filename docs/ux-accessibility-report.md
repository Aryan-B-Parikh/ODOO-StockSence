# StockSense — UX & Accessibility Audit Report

| | |
|---|---|
| **Report ID** | UXA-REPORT-001 |
| **Method** | `HEURISTIC_REVIEW` + static/automated audit |
| **Conformance target** | WCAG 2.1 Level AA |
| **Audit date** | 2026-10-05 |
| **Audited commit** | `67b12f7` — *StockSense PWA: mobile-first UI, offline support, QR scanning, and Capacitor prep* |
| **Branch note** | The working tree is checked out on `main`; the requested target `nextjs-pwa` resolves to the **identical commit** `67b12f7`, so the audited source is the same either way. Prior, superseded accessibility work lives at `733909f` on branch `monorepo-version`. |
| **Guard** | `npm run audit:a11y` → `scripts/audit-a11y.mjs` |
| **Status** | All findings below are resolved except §4.2 (deferred) and §4.3 (triaged) |

> **This report is not an accessibility certification.** No assistive-technology
> testing, user testing, or device testing was performed. Claims here rest on
> computed contrast values, source-level assertions, and code review — see
> §6 for exactly what that does and does not establish.

---

## 1. Executive summary

The `nextjs-pwa` rewrite ships a solid structural foundation — one `<h1>` per
view via a shared `PageHeader`, real landmarks (`<main>`, `<nav>`), Radix
dialogs with focus trapping, and `aria-current` on desktop navigation. The
failures were concentrated in three places:

1. **Colour.** The light `--primary` was used as *text* (links, active nav,
   state chips) but was only ever tuned as a *fill*, landing at 4.22–4.42:1
   against page backgrounds — just under the 4.5:1 floor. Focus rings were drawn
   at `ring-ring/50`, which mathematically cannot reach the 3:1 required for
   focus indicators. Four separate hardcoded button colours and the scan FAB
   gradient failed independently.
2. **Navigation affordance.** As a hash-view SPA (`#view=<key>`) with no
   router, nothing was moving focus, announcing the view change, or updating
   `document.title` after navigation — the three things a router normally does
   for free. Page zoom was explicitly disabled in the viewport metadata.
3. **Interaction semantics.** A clickable `<div role="img">` was unreachable by
   keyboard, and the count-scope radios relied on `<label>` wrapping to name a
   control that Radix renders as `<button role="radio">` — a name that comes
   from *content*, and the content was only the indicator circle.
4. **Form error communication.** Validation errors existed on screen but were
   unreachable by assistive technology. The shared `FormMessage` rendered a
   plain `<p>` that *mounts only when a message appears*, so nothing was ever
   spoken; hand-rolled dialog fields set `aria-invalid` without ever linking the
   visible message through `aria-describedby`; several dialog-level errors had
   no live region; and no `<th>` in the app declared `scope`.

**Baseline → fixed, same guard, same commit:** **36 failures → 0.**

| | Baseline (`67b12f7`) | After fixes |
|---|---:|---:|
| Token contrast checks (light + dark) | 10 fail + 4 missing tokens | 44/44 pass |
| Hard-coded component colour pairs | 5 fail + 5 pattern-gone | 13/13 pass |
| Static accessibility guards (SG-01…SG-13) | 12 fail | 13/13 pass |
| **Total** | **36** | **0** |
| `npm run lint` | 0 errors | 0 errors (3 warnings, see §4) |

---

## 2. Scope and method

### 2.1 In scope
- Client-rendered application shell, all 11 views, the shared UI kit
  (`src/components/ui/*`), and design tokens (`src/app/globals.css`).
- Mobile chrome: top bar, bottom tab bar, elevated Scan action, install banner.
- Navigation model: `NAV_SECTIONS` / `VIEW_KEYS` / `NAV_BY_VIEW` and hash sync.

### 2.2 Out of scope
- Server routes, database, Prisma schema, offline/replay engine internals.
- `backend/`, `examples/`, `mini-services/`, `frontend/` (untracked Vite
  leftover — a separately audited codebase).
- Native Capacitor shell and the print stylesheet's ink behaviour.

### 2.3 Method
1. **Recon** — mapped 43 app files and 120 components; identified the nav model
   and the app shell as the correct place for focus/title/announcement handling.
2. **Contrast computation** — a dependency-free solver
   (`scripts/audit-a11y.mjs`, §5) converts every `oklch()` token to sRGB using
   CSS Color 4 gamut mapping, composites alpha over the theme backdrop, and
   applies WCAG relative luminance **on linearised sRGB**.
3. **Static source guards** — thirteen assertions (SG-01…SG-13) for properties a
   contrast calculation cannot see.
4. **Static lint** — `eslint-config-next`'s built-in `jsx-a11y` set, extended
   with 21 rules (§3.3), run across `src`.
5. **Build/type/lint verification** — `npm run build`, `npx tsc --noEmit`,
   `npm run lint`.

### 2.4 Severity scale

| Severity | Definition |
|---|---|
| **Critical** | Blocks a task outright for a user group, or a safety/security-relevant failure. |
| **High** | A WCAG A/AA failure that meaningfully obstructs a task; workaround exists but is painful. |
| **Medium** | A WCAG AA failure or usability defect that degrades but does not block; affects a substantial user group. |
| **Low** | Minor usability or polish issue; affects few users or little of the task. |
| **Informational** | No user impact; tooling, process, or documentation note. |

**Confidence** — `HIGH` = computed or directly asserted from source;
`MEDIUM` = reasoned from source but dependent on runtime/browser behaviour that
was not executed.

---

## 3. What was measured

### 3.1 Contrast (WCAG 1.4.3 / 1.4.11) — 44 token pairs, both themes

Text pairs require 4.5:1 (normal text); non-text pairs (focus ring, control
boundary) require 3:1. Every pair is evaluated in light **and** dark.

### 3.2 Hard-coded component colours — 13 pairs
These bypass the token system, so they are asserted against the *compiled*
Tailwind palette read from `.next/static/chunks`, and the source pattern is
re-checked on every run so a refactor cannot silently orphan the assertion.

### 3.3 Static lint — what the repo already had, and what was added

`eslint-config-next/core-web-vitals` registers only **6** `jsx-a11y` rules, all
at *warning* level, covering ARIA validity and `img` alt — nothing about labels,
keyboard interaction, focus, or landmarks.

`eslint.config.mjs` was extended with **21** rules at warning level so
`npm run lint` still exits 0. Two options were required to avoid false
positives:

- `label-has-associated-control` → `controlComponents: [Input, Textarea, Select,
  Switch, Checkbox, RadioGroupItem, InputOtp, Calendar, Slider]`. Without this
  the rule cannot resolve a custom component to the DOM control it renders and
  reports every correctly-wrapped label as unassociated.
- `control-has-associated-label` → `ignoreElements: [td, th, tr]` +
  `ignoreRoles`. Table cells are layout, not controls.

> The `jsx-a11y` plugin is registered by `nextCoreWebVitals`. Flat config
> rejects a second registration ("Cannot redefine plugin"), so the extension
> declares rules only.

### 3.4 Verification results

| Check | Command | Result |
|---|---|---|
| UX/a11y guard | `npm run audit:a11y` | **exit 0 — 70/70 pass** |
| Lint | `npm run lint` | **exit 0 — 0 errors, 3 warnings** |
| Build | `npm run build` | **✓ Compiled successfully** |
| Types | `npx tsc --noEmit` | 3 errors, all pre-existing in untouched files |

`npm run build` exits 1 **only** because the `build` script chains
`cp -r …`, which does not exist on Windows. This is a pre-existing environment
issue, unchanged by this work, and unrelated to compilation.

`npx tsc --noEmit` reports 3 errors in `src/components/ui/carousel.tsx` (×2) and
`examples/websocket/server.ts` (×1). Neither file was modified by this audit,
and `next.config.ts` sets `typescript.ignoreBuildErrors: true`.

---

## 4. Findings

### 4.1 Resolved

| ID | Finding | SC | Sev. | Conf. | Affected users |
|---|---|---|---|---|---|
| UXA-001 | Light `--primary` used as text at 4.22–4.42:1 | 1.4.3 | Medium | High | Low vision, colour-deficient |
| UXA-002 | Focus ring drawn at `ring-ring/50` → 1.97:1 / 2.67:1 | 1.4.11 | High | High | Keyboard, low vision |
| UXA-003 | Form-control boundary 1.28–1.40:1 | 1.4.11 | Medium | High | Low vision |
| UXA-004 | `--destructive-foreground` never defined | 1.4.3 | Medium | High | Dark-mode users |
| UXA-005 | White on `emerald-600` action buttons → 3.73:1 | 1.4.3 | Medium | High | Low vision |
| UXA-006 | White on `amber-600` action buttons → 3.20:1 | 1.4.3 | Medium | High | Low vision |
| UXA-007 | Scan FAB gradient 1.81:1 vs bg, 1.90:1 icon | 1.4.11 | **High** | High | Mobile, low vision |
| UXA-008 | Page zoom disabled (`maximumScale: 1`) | 1.4.4 | **High** | High | Low vision, presbyopic |
| UXA-009 | No skip link | 2.4.1 | Medium | Med. | Keyboard, screen reader |
| UXA-010 | View change: no focus move, no announcement, stale title | 4.1.3 / 2.4.3 / 2.4.2 | **High** | Med. | Screen reader, keyboard |
| UXA-011 | Bottom tab bar lacked `aria-current` | 1.3.1 / 4.1.2 | Medium | High | Screen reader |
| UXA-012 | Continuous animation not disabled under reduced motion | 2.3.3 | Low | High | Vestibular disorders |
| UXA-013 | Fixed tab bar covered footer and last rows | 1.4.10 | Medium | High | Mobile, zoomed users |
| UXA-014 | Clickable `div role="img"` QR sticker, no keyboard path | 2.1.1 / 4.1.2 | **High** | High | Keyboard-only |
| UXA-015 | Count-scope radios had no reliable accessible name | 4.1.2 / 3.3.2 | **High** | Med. | Screen reader |
| UXA-016 | Metric progressbars had no accessible name | 4.1.2 | Low | High | Screen reader |
| UXA-017 | `<canvas>` aria-hidden / label rule conflict | — | Info. | High | — |
| UXA-019 | New a11y lint coverage added (root-cause regression guard) | process | Info. | High | — |
| UXA-027 | Shared `FormMessage` rendered errors with no live-region role | 4.1.3 | Medium | High | Screen reader |
| UXA-028 | Dialog field errors set `aria-invalid` but never linked the visible message | 1.3.1 / 3.3.1 | Medium | High | Screen reader, low vision |
| UXA-029 | Dialog-level error messages rendered with no live region | 4.1.3 | Low | High | Screen reader |
| UXA-030 | No `<th>` in the app declared `scope` | 1.3.1 | Low | High | Screen reader |

---

#### UXA-001 — Primary colour failed contrast when used as text
**Severity** Medium · **Confidence** High · **Users** low vision, colour-deficient

`--primary` was `oklch(0.558 0.144 163.5)` — tuned as a *fill*, but consumed as
*text* for links, the active nav item, state chips and the scan caption.

| Check | Before | After |
|---|---:|---:|
| link / active nav as text | 4.22 ✗ | **4.73** ✓ |
| primary as text on card | 4.42 ✗ | **4.96** ✓ |
| sidebar active link | 4.25 ✗ | **4.77** ✓ |
| primary button label | 4.23 ✗ | **4.75** ✓ |

**Root cause** — one token served two opposing roles; darkening it as a fill
would have broken the white label on it, and lightening it as text broke AA.

**Fix** — `oklch(0.5305 0.144 163.5)`, the lightest value that passes as text
*and* still passes with `--primary-foreground` on it as a fill. Applied to all 5
occurrences including `::selection`, which is also read as text-on-fill.

**Verification** — `scripts/audit-a11y.mjs` §1, 4 checks light + 4 dark.

---

#### UXA-002 — Focus indicator rendered at 50% opacity
**Severity** High · **Confidence** High · **Users** keyboard, low vision

`ring-ring/50` and `outline-ring/50` appeared in **19 files**. A 50% alpha ring
composites against the page background, so its contrast is bounded by how dark
you let it go — measured **1.97:1 (light)** and **2.67:1 (dark)** against a 3:1
requirement. It is *impossible* to reach 3:1 this way without driving the token
near-black, which would break it as a light-theme text colour.

**Fix** — full-strength `ring-ring` / `outline-ring` (4.73 light / 7.86 dark).
The base `outline-ring/50` in `globals.css` was changed too.

**Note** — a prior one-off audit in this repo reported "11 contrast failures"
including *"muted text 2.23:1"*. That script **never linearised sRGB**; the true
value is 5.23:1. Those failures were false. `luminance()` in the guard
linearises and must not be "simplified".

**Verification** — guard §1 `focus ring as actually rendered in source` (alpha
is derived from source, so reintroducing *any* alpha re-fails the check) +
`SG-04` (grep for `(ring|outline)-ring/\d+`).

---

#### UXA-003 — Form-control boundary below 3:1
**Severity** Medium · **Confidence** High · **Users** low vision

`--input` measured **1.28 / 1.34 (light)** and **1.40 / 1.33 (dark)** — an input
border that is effectively invisible against the page, so the *extent* of the
control is not perceivable (WCAG 1.4.11).

**Fix** — light `oklch(0.6375 0.008 165)` → **3.23 / 3.38**; dark
`oklch(0.985 0 0 / 38%)` → **3.40 / 3.24**. Both sit deliberately just above the
floor so the borders stay visually quiet.

---

#### UXA-004 — `--destructive-foreground` was never defined
**Severity** Medium · **Confidence** High · **Users** dark-mode users

`toast.tsx` already referenced `text-destructive-foreground`, but the token did
not exist in either theme — a latent bug papered over with a magic
`dark:bg-destructive/60` on the destructive button variant (which also failed
contrast). Two effects: the guard reported the pair as *missing* in both themes,
and destructive labels were never actually token-driven.

**Fix** — added `--destructive-foreground` to `@theme` and both theme blocks;
destructive button and badge now use `text-destructive-foreground` with a solid
`bg-destructive`, matching the existing `--primary-foreground` pattern. The
magic `dark:bg-destructive/60` and the dimmed `ring-destructive/20|/40` are
gone.

**Result** — light **4.73**, dark **6.06**.

---

#### UXA-005 / UXA-006 — Hard-coded action-button colours
**Severity** Medium / Medium · **Confidence** High · **Users** low vision

| Pair | Before | After |
|---|---:|---:|
| white on `emerald-600` (reorder suggestions, install banner) | 3.73 ✗ | `emerald-700` → **5.43** ✓ |
| white on `amber-600` (delivery actions) | 3.20 ✗ | `amber-700` → **5.05** ✓ |

The token `bg-primary` was considered and **rejected**: these buttons carry
distinct "positive action" semantics (accept a suggestion, mark delivered) that
must not collapse into generic brand green. One step darker in each hue
preserves the semantics and clears AA.

---

#### UXA-007 — Scan FAB was nearly invisible
**Severity High** · **Confidence** High · **Users** mobile, low vision

The elevated Scan action is the primary mobile workflow, and it was the worst
measured pair in the app:

| Pair | Before | After |
|---|---:|---:|
| `to-teal-400` stop vs page background | **1.81** ✗ | `to-teal-600` → **3.54** ✓ |
| white icon vs `to-teal-400` | **1.90** ✗ | **3.71** ✓ |
| `from-emerald-600` stop vs page | 2.69 ✗ | `from-emerald-700` → **5.18** ✓ |
| "SCAN" caption (`emerald-600`/`emerald-400`) | 3.73 ✗ / — | `text-primary` → **4.73 / 7.86** ✓ |

**Fix** — gradient `from-emerald-700 to-teal-600`; caption uses `text-primary`
so it inherits the same token discipline as the rest of the nav.

---

#### UXA-008 — Page zoom was disabled
**Severity High** · **Confidence** High · **Users** low vision, presbyopic, older adults

`layout.tsx` set `maximumScale: 1` and `userScalable: false`, which prevents
pinch/browser zoom outright — a direct 1.4.4 failure and one of the most
consequential defects found.

**Fix** — both removed, with a comment explaining why so they are not
reintroduced.

---

#### UXA-009 — No skip link
**Severity** Medium · **Confidence Medium** · **Users** keyboard, screen reader

**Fix** — a skip link is now the **first** element of the app shell, ahead of
`<Sidebar>`/`<Topbar>` in source order, targeting `id="main-content"` on a
`tabIndex={-1}` `<main>`.

Two details worth recording:

- It is positioned `fixed -top-24` → `focus:top-3` rather than using
  `sr-only focus:not-sr-only`. Both of those utilities set `position`, so which
  one wins depends on Tailwind's internal sort order — an off-screen offset has
  no such ambiguity.
- The click handler calls `preventDefault()` so activating it does **not**
  rewrite `location.hash` — the app stores view state as `#view=<key>`, and a
  fragment navigation would break deep-linking.

**Confidence is MEDIUM** because focus movement was verified by source assertion,
not by driving a browser.

---

#### UXA-010 — SPA navigation was silent
**Severity High** · **Confidence Medium** · **Users** screen reader, keyboard

A router normally updates the document title, moves focus to the new page, and
lets assistive tech announce the transition. This app is a hash-view SPA with no
router, so **none of the three happened**: after navigating, focus stayed on the
nav control, `document.title` never changed, and a screen reader user received
no feedback that anything happened.

**Fix** (in `app-shell.tsx`, keyed on `view`):
1. `document.title = "${label} — StockSense"`, restored to the default on
   unmount so the login page is not labelled with the last visited view.
2. `mainRef.current.focus()` on `<main tabIndex={-1}>`.
3. A persistent `role="status" aria-live="polite"` region whose text is written
   **imperatively** (`textContent`), not via `setState`.

Three deliberate details:

- **First run is skipped** (`prevView`), so focus is not stolen on mount —
  and the ref-based guard also survives React StrictMode's double effect
  invocation, which a `useRef` boolean flag would not.
- **Modal guard.** `openProduct()` switches to the Products view *and* opens the
  detail dialog in one store update (used by the search command and the scan
  dialog). Child effects run before parent effects, so without a guard `<main>`
  would yank focus straight out of the dialog that just opened. The effect bails
  when `document.activeElement` is inside — or a modal exists at all — using
  `[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]`,
  the same selector this codebase already uses in `scan-dialog.tsx`.
- **Imperative live-region text.** React must not manage the region's children
  or it would wipe the text on re-render; the element is rendered self-closing
  and the DOM node is written directly. This also satisfies `react-hooks/
  set-state-in-effect`, which the original `setState` version violated.

**Confidence MEDIUM** — the mechanism is source-verified; the *announcement
behaviour itself* was not exercised with a screen reader.

---

#### UXA-011 — Mobile bottom navigation had no current-page state
**Severity** Medium · **Confidence** High · **Users** screen reader

Active state was conveyed by colour alone, and `aria-current` was absent, so
assistive tech could not say which destination was selected.

**Fix** — `aria-current="page"` on all 4 tab controls and on both sheet item
lists (6 attributes total; active items are detected, not assumed). The visual
state already carried a non-colour cue (`font-medium` + `bg-primary/10` chip +
indicator dot), so it was not a colour-only failure — the gap was purely
semantic.

---

#### UXA-012 — Animation not disabled under reduced motion
**Severity** Low · **Confidence** High · **Users** vestibular disorders

`.animate-pulse`, `.animate-ping` and `.lift:hover` kept animating when
`prefers-reduced-motion: reduce` was set.

**Fix** — all three neutralised in the reduced-motion block.

**`animate-spin` was deliberately kept.** It is on the offline-sync indicator,
where it is the *essential status affordance* — removing it would leave a static
spinner indistinguishable from a frozen one. WCAG 2.3.3 exempts essential
motion.

---

#### UXA-013 — Fixed tab bar covered page content
**Severity** Medium · **Confidence** High · **Users** mobile, zoomed users

`<main>` had `pb-8` (32px) against a fixed bar of `h-16` (64px) plus the iOS
safe-area inset — the footer and the last rows of every view sat underneath it.

**Fix** — a `.bottom-nav-space` class on the shell's inner column:
`padding-bottom: calc(4rem + env(safe-area-inset-bottom, 0px))`, reset at
`min-width: 48rem` (Tailwind's `md`) where the bar is hidden. Applied to the
column rather than `<main>` because the *footer* is the element the bar covers.

---

#### UXA-014 — QR sticker was keyboard-inaccessible
**Severity High** · **Confidence** High · **Users** keyboard-only

```tsx
<div onClick={onClick} role="img" aria-label={...} title={...} />
```

Two independent failures: no keyboard path to activate it (2.1.1), and a role
that claims to be a static image while behaving as a button (4.1.2).

**Fix** — `<button type="button">` with `aria-label` and a `focus-visible` ring.
It is only ever instantiated with an `onClick`, so a button is always correct.

---

#### UXA-015 — Count-scope radios had no reliable accessible name
**Severity High** · **Confidence Medium** · **Users** screen reader

Radix `RadioGroupItem` renders `<button type="button" role="radio">`. ARIA name
computation for `button` takes **name from content** (step 2F) *before* any
`label`-derived source, and this button's content was only the indicator circle.
The visible "Location / Product" text sat in `<span>`s that were *siblings* of
the button inside the `<label>`. So the radios could announce as an unnamed
radio button — a user could not tell the two scopes apart, and the choice
determines the whole count sheet.

**Fix** — explicit `aria-labelledby` referencing both the title and description
spans. This is deterministic across browsers, whereas implicit `<label>`
association for a `<button role="radio">` is not.

**Confidence MEDIUM** — the defect depends on browser name computation, which
was not observed directly; the fix makes the outcome correct regardless.

---

#### UXA-016 — Metric progressbars were unnamed
**Severity** Low · **Confidence** High · **Users** screen reader

`role="progressbar"` with `aria-valuenow` but no accessible name, so a screen
reader reported "65%" with no indication of *what*.

**Fix** — `aria-labelledby` → the metric's title `<p>` (id derived from
`item.key`, which is already unique enough to be the React key).

---

#### UXA-017 — Canvas aria-hidden / label conflict
**Severity** Informational · **Confidence** High

The offscreen decode buffer is `className="hidden"` (`display: none`), which
already removes it from the a11y tree and the tab order. With `aria-hidden` it
trips `no-aria-hidden-on-focusable`; without it, `control-has-associated-label`
demands a name. Neither is a real defect — jsx-a11y is CSS-unaware. Resolved by
dropping `aria-hidden` and supplying a name, which silences both without
changing runtime behaviour.

---

#### UXA-019 — A11y lint coverage added at the root
**Severity** Informational · **Confidence** High

Rather than only fixing instances, the rule class that would let them recur was
enabled: 21 `jsx-a11y` rules in `eslint.config.mjs`, warning-level so CI is not
gated. See §3.3 for the two options that were necessary to keep the signal
clean.

---

#### UXA-027 — Validation messages were never announced
**Severity** Medium · **Confidence** High

`FormMessage` in `src/components/ui/form.tsx` returned `null` unless a message
existed, then rendered a bare `<p>`. That node *mounts* at the moment validation
fails, and inserting an element with no live-region role announces nothing —
`aria-describedby` on the control only surfaces text when the field is next
focused. A user who submits with focus on the Submit button never hears what went
wrong.

Fixed by giving the node `role="alert"` **only when it is an actual error**, so
non-error helper text passed through `props.children` is not announced. Every
react-hook-form form benefits: `new-product-dialog`, `new-receipt-dialog`,
`supplier-form-dialog`, `new-count-dialog`.

---

#### UXA-028 — Field errors were flagged invalid but never described
**Severity** Medium · **Confidence** High

Forms that bypass react-hook-form set `aria-invalid` directly and render a red
`<p>` alongside, with no `id` and no `aria-describedby`:

- **`new-delivery-dialog.tsx`** — the customer field, and each line's quantity
  input (its "Only N available" hint lives in a `LineHint` component that
  rendered no id).
- **`new-adjustment-dialog.tsx`** — the reason textarea, and the counted-quantity
  input, which went invalid on decimal/negative entry while *nothing anywhere on
  screen* said why.
- **`new-transfer-dialog.tsx`** — each line's quantity input and the
  source/destination route error.

Fixed by linking each control to its text. For the `LineHint` cases a stable
wrapper id was added so the **existing** hint doubles as the description rather
than introducing duplicate copy; the counted-quantity input gained the message it
was missing entirely, with wording chosen to match whichever condition actually
failed (missing product/location vs. malformed quantity).

---

#### UXA-029 — Dialog-level errors had no live region
**Severity** Low · **Confidence** High

`new-receipt-dialog.tsx` renders form-level line errors (`errors.lines.root`,
`errors.lines.message`) below the "Add line" button. They are not attached to any
control, so without a live region a screen reader never encounters them. The
transfer dialog's route error had the same gap. Both now carry `role="alert"`; in
the transfer case it is applied only when the message is actually an error, so
the ordinary informational route text is not announced on every keystroke.

---

#### UXA-030 — No table header declared its scope
**Severity** Low · **Confidence** High

Zero `<th>` elements in the app declared `scope`, so assistive tech could not
announce which column a data cell belongs to — a real loss on the wide products,
history and stock tables. Fixed at the root rather than per-call-site: `TableHead`
now defaults to `scope="col"` (overridable for row headers), which covers every
table built from the shared kit, plus the 8 raw headers in `count-sheet-print.tsx`.

---

### 4.2 Open / deferred

| ID | Finding | SC | Sev. | Status |
|---|---|---|---|---|
| UXA-018 | `login-view.tsx:527` — clickable `<span onClick>` not keyboard-operable | 2.1.1 | Low | **OPEN — deferred to owner** |
| UXA-025 | `login-view.tsx:379,409` — field errors set `aria-invalid` but are never linked | 1.3.1 / 3.3.1 | Medium | **OPEN — deferred to owner** |
| UXA-026 | `topbar.tsx:84` — an `<h2>` precedes the document's only `<h1>` and repeats it verbatim | 1.3.1 (heading order) | Low | **OPEN — deferred to owner** |

```tsx
<span className="... cursor-pointer" onClick={() => setResetOtp(debugOtp)}>
  {debugOtp}
</span>
```

A genuine 2.1.1 failure, but it lives in `login-view.tsx`, which carries
**in-flight uncommitted owner work** (the mail/OTP feature). Editing it risked
clobbering changes not yet written to disk, so it was deliberately not touched.

**Recommended fix:** promote to `<button type="button">` (or add
`role="button"`, `tabIndex={0}` and Enter/Space handling).

```tsx
<Input id="email" aria-invalid={!!errors.email} ... />
{errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
```

The error `<p>` has no `id` and the input has no `aria-describedby`, so assistive
tech announces *"invalid entry"* but never the reason. A sighted user reads the
red text; a screen-reader user has to go looking for it. This is the same defect
class as UXA-028, which is fixed everywhere else in the app — `SG-13` now encodes
the exception explicitly and reports it as `all linked except known-open finding
UXA-025`, so it self-clears the moment the link is added.

**Recommended fix:** `id` on the `<p>`, `aria-describedby` on the input, mirroring
`new-delivery-dialog.tsx`.

```tsx
// topbar.tsx:84 — rendered before <main>, therefore before the view's <h1>
<h2 className="truncate text-sm font-semibold md:text-base">{meta?.label ?? 'StockSense'}</h2>
```

`meta` is `NAV_BY_VIEW[view]`, and all 11 views pass that exact string as their
`PageHeader title`. Heading navigation therefore announces every view name
**twice** — once as an `h2` in the top bar, then again as the document's only
`h1` — with the level descending before it climbs. Because Tailwind preflight
resets heading size and weight to inherit, `<h2>` and `<p>` render identically
under that `className`, so the fix is a tag swap with **no visual change**.
Deferred because `topbar.tsx` carries in-flight owner work (+25 lines for the
mail hub).

### 4.3 Triaged as non-defects

| ID | Observation | Ruling |
|---|---|---|
| UXA-020 | `pagination.tsx:52` `anchor-has-content` | **False positive** — `children` arrives via `{...props}` spread, so content exists at runtime. |
| UXA-021 | `count-sheet-print.tsx` `<td>` flagged as an unlabelled control | **False positive** — table cells are layout, not controls. Handled by `ignoreElements`. |
| UXA-022 | 5 × `label-has-associated-control` | **Tooling limitation** — jsx-a11y cannot resolve custom components to their DOM control. Runtime names are present (`aria-label`, or `aria-labelledby` added by UXA-015). Handled by `controlComponents`. |
| UXA-023 | 26 × `prefer-tag-over-role` (`<div role="status">` → `<output>`, etc.) | **Accepted.** Not enabled by default; `<div role="status">` is used in 9 places across the existing codebase, so changing one would be inconsistent. `role="status"` and `<output>` expose the same role. |
| UXA-024 | `search-command.tsx:93` `autoFocus` | **Accepted by design.** Focusing the query field on a Cmd+K palette is the established convention and matches user expectation. Noted for SC 3.2.1. |

---

## 5. Regression guard

`scripts/audit-a11y.mjs` — dependency-free, wired as `npm run audit:a11y`,
exits non-zero on any failure. Three sections:

1. **44 token contrast checks** (light + dark). The focus-ring alpha is
   **derived from source** rather than hard-coded, so reintroducing
   `ring-ring/60` or `outline-ring/40` re-fails the numeric check instead of
   being silently skipped.
2. **13 hard-coded colour pairs.** Each carries a source `pattern` that is
   re-asserted before the measurement — if a refactor removes the code, the
   check reports `PATTERN-GONE` rather than quietly passing. Colours are read
   from the compiled Tailwind palette when `.next` exists, with a hard-coded
   fallback so the script still runs on a clean checkout.
3. **13 static guards**, SG-01…SG-13: page zoom, skip link presence *and*
   source order, focus-indicator opacity, `aria-current` on both navigations,
   focus/announcement on view change (including the modal guard), document
   title, reduced motion, and bottom-bar clearance — plus three added with the
   form-error pass:
   - **SG-11** — every `<th>` declares `scope`, and `TableHead` still defaults it.
   - **SG-12** — `FormMessage` still carries a live-region role, so validation
     errors keep being announced.
   - **SG-13** — every control setting `aria-invalid` links its visible error via
     `aria-describedby`. `login-view.tsx` sits in the guard's `KNOWN_OPEN` set as
     UXA-025 and drops out of it automatically once the link is added, so the
     exception cannot go stale.

**Method note.** The baseline was reproduced by adding a throwaway `git
worktree` at `67b12f7`, copying the guard into it, and running it there — so
baseline and post-fix figures come from the *same* script against the *same*
palette. The worktree was removed afterwards. **36 failures is the reproducible
number with the current 70-check guard**; the earlier "33" was measured with the
pre-extension revision (10 static guards) and is superseded.

One bug in the guard was found and fixed during this work: `FOCUS_RING_ALPHA`
resolved files against `process.cwd()` instead of `ROOT`, so it silently
reported 100% opacity when invoked from another directory. All file reads now
resolve against `ROOT`.

---

## 6. WCAG 2.1 Level AA — conformance position

**All identified violations of WCAG 2.1 Level AA have been addressed.**

**Conformance is NOT certified.** This was a `HEURISTIC_REVIEW` plus automated
and static analysis. It is not a `USER_STUDY`.

Covered by the evidence above:

- **1.4.3** Contrast (Minimum), **1.4.4** Resize Text, **1.4.11** Non-text
  Contrast — computed against rendered colours in both themes.
- **2.1.1** Keyboard, **2.4.1** Bypass Blocks, **2.4.2** Page Titled,
  **2.4.3** Focus Order — source-verified.
- **4.1.2** Name, Role, Value — source-verified for the specific defects found.
- **4.1.3** Status Messages — live regions on navigation, shared form messages
  and dialog-level errors; announcement not observed.
- **1.3.1** Info and Relationships — `aria-current`, explicit radio naming,
  `scope` on table headers, and `aria-describedby` links from invalid controls to
  their error text.
- **3.3.1** Error Identification — errors are identified (`aria-invalid`) and
  described in text that is programmatically associated with the control.
- **2.3.3** Animation from Interactions — reduced-motion handling.

Not evaluated: **1.4.5 Images of Text**, **1.4.10 Reflow** beyond the
bottom-bar clearance fix, **1.4.13 Content on Hover or Focus** (Radix
Tooltip/Popover are relied on for Esc-dismiss and hoverable content; their
defaults were not asserted here), **2.2.1** Timing, **2.5.x** pointer input,
**3.3.2** Labels or Instructions and **3.3.3** Error Suggestion beyond the
labelled fields present, **3.3.4** Error Prevention, and language/`lang`
behaviour at the document level.

## 7. Limitations

1. **No assistive-technology testing.** Nothing was verified with NVDA,
   JAWS, VoiceOver, or TalkBack. Announcements, focus order and landmark
   navigation are reasoned from source, not observed.
2. **No browser execution.** Skip-link activation, focus movement, the modal
   focus guard, and reduced-motion behaviour are source-asserted. No headless or
   manual browser run was performed.
3. **No user testing.** No `USER_STUDY`, no participants, no task-success or
   comprehension measurement.
4. **No device or viewport matrix.** Responsive layout was reviewed by code
   inspection only; no real-device or browser-matrix testing.
5. **Print output not verified.** The count sheet print stylesheet was checked
   for landmark/`app-chrome` interaction but not rendered to paper/PDF.
6. **Not exhaustive.** WCAG success criteria listed as unevaluated in §6 were
   not audited.
7. **Three findings deferred.** UXA-018 and UXA-025 (`login-view.tsx`) and
   UXA-026 (`topbar.tsx`) remain open because both files carry in-flight owner
   work. Each is written up in §4.2 with its recommended fix, and UXA-025 is
   encoded in the guard as a known-open exception so it cannot be forgotten.
8. **Static lint cannot see computed styles.** Contrast beyond the 57 asserted
   pairs, and any colour produced at runtime, is not covered.

---

## 8. Recommendations

1. **Fix the three deferred findings** when the mail/OTP work lands — UXA-018
   (keyboard-operable OTP affordance), UXA-025 (`aria-describedby` on the login
   errors, which clears `SG-13`'s exception automatically), and UXA-026
   (`<h2>` → `<p>` in the top bar; no visual change). All three are spelled out
   in §4.2.
2. **Run the real audit.** `npm run audit:a11y` is wired into `package.json`;
   consider adding it to CI alongside `npm run lint` so colour and guard
   regressions are caught before merge.
3. **Keep contrast in the token system.** The 13 hard-coded pairs exist because
   they bypass tokens. Where a distinct semantic colour is genuinely needed
   (suggestion accept, delivery complete), promote it to a named token instead
   of a raw utility, so the guard checks it in one place.
4. **Do not "simplify" `luminance()`.** Linearising sRGB is what makes the
   guard's numbers correct; the repo's earlier audit skipped it and produced
   false failures.
5. **A screen-reader pass would close the largest gap.** §7.1 is the single
   biggest limitation; a short NVDA/VoiceOver session over navigation, one
   dialog and one form would materially raise confidence in UXA-009, UXA-010 and
   UXA-015.
6. **Re-audit after large visual changes** — any edit to `globals.css` theme
   blocks or to the bottom nav should be followed by `npm run audit:a11y`.

## 9. Files changed

**Design tokens & document**
- `src/app/globals.css` — primary / destructive / input tokens,
  `--destructive-foreground` mapping, base `outline-ring`, extended
  reduced-motion block, `.bottom-nav-space`.
- `src/app/layout.tsx` — removed `maximumScale` / `userScalable`.

**App shell & chrome**
- `src/components/shell/app-shell.tsx` — skip link, `#main-content`, focus
  move, live announcement, modal guard, document title, clearance class.
- `src/components/shell/mobile-bottom-nav.tsx` — `aria-current` ×6, FAB
  gradient, SCAN caption colour.
- `src/components/shell/mobile-install-banner.tsx`, `scan-dialog.tsx`.

**UI kit (focus rings, error rings, destructive variant)**
- `accordion`, `badge`, `button`, `calendar`, `checkbox`, `input`, `input-otp`,
  `navigation-menu`, `radio-group`, `scroll-area`, `select`, `slider`, `switch`,
  `tabs`, `textarea`, `toggle`.
- `form.tsx` — `FormMessage` now carries `role="alert"` when it is an error
  (UXA-027).
- `table.tsx` — `TableHead` defaults `scope="col"` (UXA-030).

**Views**
- `receipts/receipt-card.tsx`, `receipts/receipt-detail-dialog.tsx`,
  `suppliers/supplier-card.tsx`, `suppliers/supplier-detail-dialog.tsx`,
  `reorder/suggestion-card.tsx`, `transfers/transfer-detail.tsx`,
  `adjustments/adjustment-detail.tsx`, `deliveries/delivery-detail.tsx`,
  `dashboard/rack-grid.tsx`, `dashboard/metrics-panel.tsx`,
  `counts/new-count-dialog.tsx`.
- `deliveries/new-delivery-dialog.tsx`, `transfers/new-transfer-dialog.tsx`,
  `adjustments/new-adjustment-dialog.tsx` — error messages linked with
  `aria-describedby`; the counted-quantity input gained the message it was
  missing (UXA-028).
- `receipts/new-receipt-dialog.tsx` — form-level line errors given
  `role="alert"` (UXA-029).
- `counts/count-sheet-print.tsx` — `scope="col"` on the 8 raw print headers
  (UXA-030).

**Tooling**
- `scripts/audit-a11y.mjs` (new), `eslint.config.mjs`, `package.json`
  (`audit:a11y` script).

**Deliberately untouched** — `login-view.tsx`, `topbar.tsx`, the
`src/app/api/**` routes, `src/lib/{auth,mail}` and the new OTP/reset-password
files, all of which carry in-flight owner work.

---

*Generated by the UX & Accessibility Engineer workflow. Findings and machine-readable metadata: `docs/ux-accessibility-manifest.json`. Handoff: `docs/ux-accessibility-handoff.md`.*
