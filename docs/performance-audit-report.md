# StockSense — Performance & Reliability Audit

**Role:** Performance & Reliability Engineer v1
**Generated:** 2026-10-05
**Repository revision:** `67b12f7` (branch `main`, uncommitted work present in tree — no branches switched, no files modified other than this report)
**Verification level of this document:** `BENCHMARK-VERIFIED` for the latency numbers below (all measured live against `http://localhost:3000`); `BASELINE-ESTABLISHED` for capacity; static-analysis claims are explicitly labelled **(static)** where they were not executed.

---

## 1. Scope & Method

### 1.1 What was audited

| Area | Method |
|---|---|
| API latency | Live HTTP measurement (sequential + concurrent bursts, soak run) |
| N+1 / query fan-out | Line-by-line read of every handler under `src/app/api/**` + `src/lib/{inventory,attention,mappers}.ts`; SQL statement counts measured against a second read-only Prisma client |
| Frontend bundle | `.next` production-build artifacts (`diagnostics/route-bundle-stats.json`, chunk sizes, gzip), served HTML `<script>` graph, `src/**` import graph |
| Caching | Grep of all route segment exports, response headers, and client query hooks/stores |
| SQLite risk | `prisma/schema.prisma` vs. actual query usage; live `PRAGMA` reads on `db/custom.db`; row-count census |
| Reliability | Route error handling, client timeout/retry behaviour, error states, boot path, failure probes |
| Resource leaks | In-memory stores (`otp-store`, mail outbox, toast timeouts, offline queue, Prisma singleton) |

### 1.2 Environment

| Field | Value |
|---|---|
| Workload | READ-mostly request bursts + 60 s sustained read soak + 1 write-concurrency probe (login) |
| Runtime | Node **v24.16.0**, Windows (win32) |
| Server | `next dev` (Next.js 16) at `http://localhost:3000` — **development server, not `next start`** |
| Database | Prisma 6.x → SQLite file `db/custom.db`, **208,896 bytes**, `journal_mode=delete` |
| Dataset at start | Product 19 · StockLevel 26 · LedgerEntry **114** · Session 46 · DeliveryOrder 15 · Transfer 2 |
| Dataset at end | Product 19 · StockLevel 26 · LedgerEntry **142** · Session **74** · DeliveryOrder 17 · Transfer 8 |
| Client | Node `fetch` (undici) on the **same host** (loopback) — no network variance |
| Auth | Real `sns_session` cookie obtained via `POST /api/auth/login` (manager account) |
| Warm-up | 1 untimed request per endpoint before each phase |
| Sample size | 5 sequential + 20 concurrent per endpoint (n=25), plus dedicated soak/burst runs |

### 1.3 Method limitations (declared up front)

1. **Dev server only.** No `next start` production benchmark was run (running one would have displaced the live dev server the task requires). Every latency number below is **QUALIFIED evidence about a development-mode server** — production capacity is `NOT MEASURED`.
2. **The database changed during the audit window.** Row counts moved (LedgerEntry 114 → 142, DeliveryOrder 15 → 17, Transfer 2 → 8, Session 46 → 74) while measurements were running, i.e. another session was exercising the app concurrently. Latency samples may include that background load.
3. **No mutating business operations were executed.** Write-path latency for `createReceipt` / `receiveReceipt` / `markDeliveryPacked` is **NOT MEASURED** (it would have altered live documents during a concurrent QA pass) — those paths are analysed statically and labelled as such.
4. `n=5` sequential samples → sequential "p95" is reported as `max` of the 5 and is a weak statistic; the table says so.

### 1.4 Evidence states used

`MEASURED` = observed live · `STATIC` = derived from source/build artifacts, not executed · `NOT MEASURED` = explicitly not taken and why.

No target/SLO exists anywhere in the repository, so **no target is claimed as met** — `TARGET = UNKNOWN` throughout (proposed thresholds below are marked PROPOSAL).

---

## 2. Latency Measurements

### 2.1 Main table — `MEASURED`

1 warm-up + 5 sequential + 20 concurrent per endpoint, authed, HTTP 200 throughout.
The 5 sequential samples are the 5 fastest of each set, so the `p95 (n=25)` column is effectively the tail of the **20-way concurrent** phase.

| Endpoint | n | Response bytes | seq p50 (n=5) | seq max (n=5) | p50 (n=25) | **p95 (n=25)** | max | Statuses |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `/api/health` | 25 | 45 | 15.8 ms | 16.9 ms | 127.5 ms | **257.9 ms** | 271.7 ms | 200 × 25 |
| `/api/products` | 25 | 16,618 | 35.3 ms | 57.6 ms | 324.8 ms | **366.9 ms** | 370.1 ms | 200 × 25 |
| `/api/dashboard` | 25 | 9,941 | 67.7 ms | 80.1 ms | 656.3 ms | **692.0 ms** | 694.9 ms | 200 × 25 |
| `/api/ledger` | 25 | 21,419 | 40.1 ms | 42.8 ms | 381.8 ms | **414.3 ms** | 416.7 ms | 200 × 25 |
| `/api/attention` | 25 | 3,716 | 38.1 ms | 44.5 ms | 329.4 ms | **374.3 ms** | 376.8 ms | 200 × 25 |
| `/api/meta` | 25 | 5,826 | 23.8 ms | 32.5 ms | 311.2 ms | **375.8 ms** | 378.3 ms | 200 × 25 |
| `/api/search?q=rod` | 25 | 155 | 26.0 ms | 34.8 ms | 378.7 ms | **409.5 ms** | 411.0 ms | 200 × 25 |

**Headline answers:** `p95(/api/products) = 366.9 ms` · `p95(/api/dashboard) = 692.0 ms` (sequential-only p95: 57.6 ms and 80.1 ms).

Note the shape: `/api/health` executes **no database query at all** (`src/app/api/health/route.ts:6-8`) yet degrades from ~16 ms to p95 258 ms at 20-way concurrency, with a near-linear ramp (24.2 → 62 → 74.8 → … → 271.7 ms). That is request **queuing in a single process**, not database cost.

### 2.2 Sustained soak — `MEASURED`

3 concurrent workers, 5 endpoints (products/dashboard/ledger/attention/meta), 60 s:

| Metric | Value |
|---|---|
| Requests completed | 1,392 |
| Throughput | **23.2 req/s** |
| p50 / p95 / max | **82.1 ms / 338.7 ms / 1,398.7 ms** |
| Errors | **0** (1,392 × HTTP 200) |
| Mean of first 20 samples vs last 20 | 77.5 ms → 103.6 ms (+34 % over 60 s — could be drift or the concurrent session noted in §1.3) |
| Per-endpoint p95 | products 182.6 ms · **dashboard 616.5 ms** · ledger 199.1 ms · attention 202.2 ms · meta 175.7 ms |

### 2.3 Burst / write probes — `MEASURED`

| Test | Result |
|---|---|
| Mixed burst: 45 requests, 6 endpoints, all at once | wall 966 ms · **46.6 req/s** · p50 741.4 ms · p95 957.1 ms · max 961.9 ms · **45 × 200, 0 errors** |
| `POST /api/auth/login` sequential (n=5) | 91.5 / 97.2 / 98.4 / 147.1 / 119.0 ms |
| `POST /api/auth/login` ×10 concurrent (each writes a Session row) | p50 **709.2 ms**, p95 **727.9 ms**, range 706–728 ms, **10 × 200** |
| `POST /api/auth/otp` (unknown email ⇒ no mail dispatched, nothing written) n=15 | p50 74.3 ms, p95 **165.5 ms**, 15 × 200 |
| `GET /` HTML (n=5 sequential) | p50 ~57 ms, 25,402 bytes (dev-mode HTML) |

### 2.4 Payload-scaling probe — `MEASURED`

`GET /api/ledger` with different `limit` (all return HTTP 200):

| Query | p50 (n=5) | p95 (n=5) | Body bytes |
|---|---:|---:|---:|
| `?limit=1` | 33.5 ms | 47.9 ms | 541 |
| `?limit=50` | 38.8 ms | 41.5 ms | 21,419 |
| `?limit=200` | 37.1 ms | 49.1 ms | 47,716 |
| `?limit=99999&offset=-5` | — | — | 47,716 (clamped, 200) |

An **88× payload difference (541 B → 47,716 B) moved latency by < 6 ms** — consistent with the code (`findMany` with no `take`, slice in JS): the server does the same full-table work regardless of `limit`. At 142 rows this is invisible; it is the mechanism behind PERF-001.

### 2.5 Failure / robustness probes — `MEASURED`

| Probe | Result |
|---|---|
| `POST /api/products` with body `not-json` | **400** `{"error":"Invalid JSON body"}` |
| `GET /api/nonexistent` | **404** |
| `GET /api/products` without cookie | **401** |
| Malformed `limit`/`offset` | **200**, values clamped |
| 45-request burst + 1,392-request soak | **0 non-200 responses** |

### 2.6 Frontend bundle — `STATIC` (production build artifacts in `.next`)

`.next/diagnostics/route-bundle-stats.json` (from the last `next build`, `BUILD_ID P5tu1PCeqqcfeynSkix45`):

| Route | `firstLoadUncompressedJsBytes` |
|---|---:|
| `/` | **2,208,851 B (2.16 MiB)** |
| `/_not-found` | 520,218 B (508 KiB) |

Measured across the 7 first-load chunks of `/`:

| | Raw | gzip -9 |
|---|---:|---:|
| JS first load | **2,157.1 KB** | **595.3 KB** |
| CSS (`278gcx5hsayzs.css` 172.6 KB + `233p45nuh4m5b.css`) | 176.2 KB | ~28.7 KB |
| Largest single chunk `0xe8nplvkjd58.js` | 1,649.1 KB | 446.5 KB |

Route-specific delta (`/` minus `/_not-found`) ≈ **1.69 MB** of JS for one page.

### 2.7 SQL statements per call — `MEASURED` (second read-only Prisma client, `log:[query]` event capture)

| Include shape used by | Statements | Rows returned |
|---|---:|---:|
| `computeNeeds` (`product + stocks + suppliers.supplier`) | **4** | 19 |
| `PRODUCT_INCLUDE` (`/api/products`) | **8** | 19 |
| dashboard `stockLevel` shape (`+ product + location.rack.zone`) | **5** | 26 |
| `LEDGER_INCLUDE` (`/api/ledger`) | **3** | **142 (the whole table, no LIMIT)** |

---

## 3. Findings

Severity scale: `CRITICAL` = unavailable/corrupt under realistic load · `HIGH` = major degradation/failure near expected workload · `MEDIUM` = significant inefficiency or failure mode outside normal workload · `LOW` = limited-impact optimisation · `INFO` = observation.

### Severity distribution

| Severity | Count |
|---|---:|
| CRITICAL | **0** |
| HIGH | **3** |
| MEDIUM | **9** |
| LOW | **6** |
| INFO | **0** |
| **Total** | **18** |

---

### PERF-001 — `/api/ledger` loads the entire ledger table into memory on every request
**Severity: HIGH** · Category: DATABASE / APPLICATION CODE · Evidence state: `MEASURED` (payloads) + `STATIC` (cause) · Status: OPEN

**Location:** `src/app/api/ledger/route.ts:39`, `:54`, `:56`

**Evidence:**
```ts
const [rows, distinctRows] = await Promise.all([
  db.ledgerEntry.findMany({ where, include: LEDGER_INCLUDE, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),  // ← no `take`
  ...
const total = filtered.length                                     // ← needs every row anyway
const entries = filtered.slice(offset, offset + limit).map(...)   // ← pagination in JS
```
Measured: `?limit=1` → 541 B in p50 33.5 ms vs `?limit=200` → 47,716 B in p50 37.1 ms (§2.4) — identical server work for an 88× payload difference. Prisma statement capture shows `LEDGER_INCLUDE` returning **all 142 rows** with no SQL `LIMIT`. `LedgerEntry` is the highest-growth table in the system (one row per stock-field change per line document; 114 → 142 rows during this audit alone).

**Impact:** Every History-page request materialises the full table × 2 relation levels, then filters/sorts/slices/serialises it in JS. Memory, CPU and JSON size grow linearly forever; `total` forces the full scan even when `q` is empty. At 1 M ledger rows this is a multi-second, several-hundred-MB request — and `/api/dashboard` also reads the ledger twice (`src/lib/attention.ts:175`, `:195`).

**Recommended fix:** push `take`/`offset` into Prisma; compute `total` with `count()`; push `q`/`docType`/date filters into `where` (SQL `LIKE` on `code`/`docCode`, join or denormalise `sku`/`reason`); add the indexes listed in PERF-003.

---

### PERF-002 — Every ledger row written re-scans all of that year's ledger codes, inside the transaction
**Severity: HIGH** · Category: DATABASE / LOCK CONTENTION · Evidence state: `STATIC` (executed code path, not timed) · Status: OPEN

**Location:** `src/lib/inventory.ts:53-63` (scanner), called from `src/lib/inventory.ts:144-147` inside `bumpStock`

**Evidence:**
```ts
async function nextLedgerCode(tx: Tx, at: Date = new Date()): Promise<string> {
  const rows = await tx.ledgerEntry.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } }) // LEDGER-<year>-% — every row of the year
  ...
}
...
for (const a of applied) {
  await tx.ledgerEntry.create({
    data: { code: await nextLedgerCode(tx, ctx.at), ... }   // ← full-prefix scan PER ROW WRITTEN
  })
}
```
The same pattern exists for document codes: `nextDocCode` (`src/lib/inventory.ts:40-44`) does `receipt.findMany({select:{code:true}})` (etc.) — all codes of that model — on every document creation.

Callers loop lines: `receiveReceipt` (`:241-254`), `cancelReceipt` (`:265-272`), `createDelivery` (`:315-322`), `markDeliveryPacked` (`:339-347`), `createTransfer` (`:411-424`), `receiveTransfer` (`:432-439`), `cancelTransfer` (`:447-460`). Every one of those `$transaction` calls passes **no timeout options** (22 call sites, grep-verified) → Prisma's defaults apply: `maxWait 2 s`, **`timeout 5 s`**.

**Impact:** Cost per document ≈ `lines × (1 + appliedFields) × O(year-ledger-rows)` statements, all inside a single interactive transaction holding the SQLite write lock. Latency grows quadratically with ledger history; once the scan plus writes exceeds 5 s the transaction aborts and the user gets a 500 **after typing a whole document**. This is the single most likely future production failure.

**Recommended fix:** allocate codes once per document (fetch max once, increment in memory, single `createMany`), or maintain a per-year counter row updated with a single atomic `UPDATE … RETURNING`; keep the `@unique` constraint as the race guard.

---

### PERF-003 — The schema declares zero secondary indexes; every non-unique `WHERE`/`ORDER BY` is a full scan
**Severity: HIGH** · Category: DATABASE · Evidence state: `MEASURED` (schema + live `sqlite_master`) · Status: OPEN

**Location:** `prisma/schema.prisma` (whole file) — grep for `@@index` returns **0 matches**; live index census returns **16 indexes, all `@unique`/`@@unique`/`@id`**.

**Evidence — queries that today scan whole tables (row counts in brackets):**

| Query | Location | Table size |
|---|---|---|
| `ledgerEntry` `WHERE createdAt >= ?` + `ORDER BY createdAt DESC, id DESC` | `src/app/api/ledger/route.ts:39`, `src/lib/attention.ts:175` | LedgerEntry [142] **unbounded** |
| `ledgerEntry` `ORDER BY createdAt DESC LIMIT 8` | `src/lib/attention.ts:195-197` | same |
| `exceptionFlag` `WHERE status='OPEN' ORDER BY createdAt DESC` | `src/lib/attention.ts:28`, `:270` | ExceptionFlag [5] |
| `receipt` `WHERE status='EXPECTED' AND expectedAt < ?` | `src/lib/attention.ts:29-33` | Receipt [6] |
| `adjustmentLine` `WHERE productId=? AND locationId=? AND delta<0` | `src/lib/inventory.ts:524-531` | AdjustmentLine [13] |
| `stockLevel` `WHERE locationId=?` | `src/lib/inventory.ts:662` | StockLevel [26] |
| `cycleCount` `WHERE status='OPEN'` / `ORDER BY dueDate` | `src/app/api/counts/route.ts:27` | CycleCount [3] |
| `deliveryOrder` `WHERE status IN (…)` | `src/lib/attention.ts:138` | DeliveryOrder [17] |
| `ledgerEntry` `WHERE code LIKE 'LEDGER-2026-%'` | `src/lib/inventory.ts:56` | LedgerEntry, every write |

**Impact:** Invisible at today's sizes (tens-to-hundreds of rows — measured p95s are fine), but the ledger, session and document tables grow monotonically. This is the enabling condition behind PERF-001/PERF-002 and the top scaling risk in the system.

**Recommended fix:** add `@@index([createdAt])` (+ `@@index([docType, createdAt])`) on `LedgerEntry`, `@@index([status, createdAt])` on `ExceptionFlag`/`Adjustment`/`CycleCount`, `@@index([status, expectedAt])` on `Receipt`, `@@index([status])` on `DeliveryOrder`, `@@index([locationId])` on `StockLevel`, `@@index([productId, locationId])` on `AdjustmentLine`/`CycleCountLine`. Verify each with `EXPLAIN QUERY PLAN` before committing (read cost, write cost, storage).

---

### PERF-004 — `/api/dashboard` computes the full product-needs scan three times per request
**Severity: MEDIUM** · Category: APPLICATION CODE / DUPLICATE WORK · Evidence state: `STATIC` + `MEASURED` (latency) · Status: OPEN

**Location:** `src/lib/attention.ts:125`, `:22` (→ `:22` calls `computeNeeds`), `:248`

**Evidence:**
```ts
export async function computeDashboard(tx: Tx = db) {
  const needs    = await computeNeeds(tx)        // attention.ts:125  ─┐
  const attention = await computeAttention(tx)   // → computeNeeds()  ─┼─ 3×
  ... metrics: await computeMetrics(tx)          // → computeNeeds()  ─┘
```
`computeNeeds` = `product.findMany({ include: { stocks, suppliers.supplier } })` (`src/lib/inventory.ts:761-765`) — **measured at 4 SQL statements** (§2.7). Total dashboard request ≈ 30-40 statements (static estimate: 5 for the stocks shape + 4+4+4 for the three `computeNeeds` + 6 parallel counts in `computeAttention` + 2 ledger reads + 8+ in `computeMetrics`).

Measured consequence: `/api/dashboard` is the slowest endpoint in every phase — sequential p50 67.7 ms (vs 23.8 ms for `/api/meta`), concurrent p95 **692.0 ms**, soak p95 **616.5 ms** while other endpoints sat at 175-202 ms.

**Impact:** ~3× the heaviest read query on the endpoint a client refetches every 30 s (`dashboard-view.tsx:30`) and on every window focus (`providers.tsx:17`).

**Recommended fix:** compute `needs` once in `computeDashboard` and pass it to `computeAttention(needs)` / `computeMetrics(needs)` (both already take `tx` as a parameter — signature change only).

---

### PERF-005 — Write path issues a burst of sequential statements per line, inside one untimed interactive transaction
**Severity: MEDIUM** · Category: DATABASE / N+1 · Evidence state: `STATIC` (write timing **NOT MEASURED** — see §1.3) · Status: OPEN

**Location (per-line awaits):**

| Site | Statements per line |
|---|---|
| `src/lib/inventory.ts:200-204` `createReceipt` | `assertProduct` + `assertLocation` (2) |
| `src/lib/inventory.ts:220-227` `createReceipt` | `bumpStock` (getStock 1 + upsert 1 + per-field code-scan + create) |
| `src/lib/inventory.ts:241-254` `receiveReceipt` | `bumpStock` + `receiptLine.update` |
| `src/lib/inventory.ts:289-303` `createDelivery` | `assertProduct` + `assertLocation` + `getStock` + (`product.findUnique` on failure) |
| `src/lib/inventory.ts:339-347` `markDeliveryPacked` | `bumpStock` + `deliveryLine.update` |
| `src/lib/inventory.ts:495-510` `createAdjustment` | `assertProduct` + `assertLocation` + `getStock` |
| `src/lib/inventory.ts:523-536` `createAdjustment` | `adjustmentLine.count` **per downward line** |

`bumpStock` itself: `getStock` (`:116`) → `stockLevel.upsert` (`:139`) → per applied field, `nextLedgerCode` full scan + `ledgerEntry.create` (`:144-161`). Example: a 10-line receipt with 2 fields per line ≈ **60-80 sequential statements** in one `$transaction` with Prisma's default **5 s** timeout (PERF-002), holding SQLite's write lock the whole time (journal mode = `delete`, PERF-010).

**Impact:** Document latency and lock-hold time scale with line count × ledger size; concurrent readers queue behind it (measured: 10 concurrent writes → all ~710 ms, §2.3).

**Recommended fix:** batch the assertions with `findMany({ where: { id: { in: [...] } } })`, allocate one code per document, write ledger rows with `createMany`, keep the single `bumpStock` call per line (that one is required for correctness).

---

### PERF-006 — Six list endpoints fetch whole tables with no `take`, filtering in JavaScript
**Severity: MEDIUM** · Category: DATABASE / API · Evidence state: `STATIC` + `MEASURED` (current payloads) · Status: OPEN

**Location:** `src/app/api/products/route.ts:28` (+ JS filter/sort `:41-52`) · `src/app/api/meta/route.ts:13-18` · `src/app/api/receipts/route.ts:19` · `src/app/api/adjustments/route.ts:19` · `src/app/api/suppliers/route.ts:67` · `src/app/api/counts/route.ts:27`

**Evidence:** no `take` on any of them; `products` and `search`-style matching is done after loading (`products/route.ts:41-44`), and sorting is a JS `localeCompare` (`:47-52`). Measured payloads today: `/api/products` 16,618 B, `/api/meta` 5,826 B — small because Product[19]. `PRODUCT_INCLUDE` is **8 statements** per call (§2.7) because it drags `stocks.location.rack.zone.warehouse`.

**Impact:** every refetch (30 s interval on `products-view.tsx:104`, focus refetch everywhere) ships the full catalogue; at 10 k SKUs this is a multi-MB JSON response per poll, plus `meta` re-deriving the same reference data on every request.

**Recommended fix:** server-side pagination + `where` push-down for `products`; split "catalogue summary/categories" (cheap, cacheable) from row data; consider a materialised/search endpoint rather than `contains` in JS.

---

### PERF-007 — 2.16 MiB first-load JS on the only route; no code splitting anywhere in the app
**Severity: MEDIUM** · Category: CLIENT / FRONTEND · Evidence state: `STATIC` · Status: OPEN

**Location:** `src/components/views/view-registry.tsx:7-17` · `src/app/page.tsx:5` · repo-wide

**Evidence:**
- `.next/diagnostics/route-bundle-stats.json`: `/` = **2,208,851 B** first-load JS vs `/_not-found` = 520,218 B → **≈1.69 MB route-specific**.
- Chunk re-measure: **2,157.1 KB raw / 595.3 KB gzip** JS + 176 KB CSS; largest chunk 1,649.1 KB raw / 446.5 KB gzip.
- Grep for `next/dynamic` / `React.lazy` / `lazy(` across `src` → **0 matches**.
- `view-registry.tsx` statically imports **all 11 views** into one page; the dev HTML for `/` emits **42 `<script src>` tags**, including `node_modules_recharts_es6_*`, `node_modules_lodash_*`, `node_modules_framer-motion_*`, `node_modules_jsqr_*`, `react-hook-form`, `zod`, and every `src_components_views_*` chunk — i.e. dashboards, all CRUD views, QR decoding and charts are downloaded before the login screen can render.

**Impact:** ~600 KB gzip before first paint on the PWA/mobile target this repo explicitly ships (Capacitor + install banner); slow first load on 4G and wasted parse/compile for views the user may never open.

**Recommended fix:** `next/dynamic` per view in `view-registry.tsx` (one-line-per-view change), lazy-load `recharts`/`jsqr`/print dialogs, and split the login route from the app shell.

---

### PERF-008 — No timeout on any client fetch: a hung request wedges the UI indefinitely
**Severity: MEDIUM** · Category: CLIENT / RELIABILITY · Evidence state: `STATIC` · Status: OPEN

**Location:** `src/lib/api.ts:62-102` (the single `request()` used by every API call)

**Evidence:**
```ts
res = await fetch(path, { ...init, credentials: 'include', headers: {...} })   // no AbortSignal, no timeout
...
return res.json() as Promise<T>
```
Grep for `AbortController|signal:|timeout` in `src` → only `use-toast.ts` (`setTimeout` for toasts) and a comment. React Query has no default request timeout either; `retry: 1` (`providers.tsx:18`) doubles the exposure.

**Impact:** if the server hangs (a >5 s transaction — PERF-002/005 — or a slow external call — PERF-009), `query.isPending` stays `true` forever and the user sees the skeleton (`dashboard-view.tsx:45`) with **no error state and no retry affordance**, because `isError` never becomes true. This is the concrete "single failure wedges the UI" path.

**Recommended fix:** `fetch(path, { signal: AbortSignal.timeout(15_000), ... })` (or an `AbortController` per request) so timeouts surface as `ApiError`/`OfflineError` and React Query's existing error UI + retry take over.

---

### PERF-009 — External mail delivery (Brevo HTTPS, no timeout) is awaited inside request handlers
**Severity: MEDIUM** · Category: EXTERNAL DEPENDENCY / TIMEOUT · Evidence state: `STATIC` (the mail path itself is `NOT MEASURED` — measuring it would dispatch real email) · Status: OPEN

**Location:** `src/app/api/auth/otp/route.ts:39` · `src/app/api/mail/digest/route.ts:31` · `src/app/api/mail/low-stock/route.ts:10` → `src/lib/mail/triggers.ts:103-119` · `src/lib/mail/provider.ts:59-75`

**Evidence:**
```ts
await mailService.sendOtpEmail(user.email, user.name, otpCode);   // auth/otp:39 — blocks the response
...
const res = await fetch('https://api.brevo.com/v3/smtp/email', {...})  // provider.ts:59 — no signal/timeout
```
`.env` contains a live `BREVO_API_KEY`, so the active provider is `BrevoEmailProvider`, not the console stub. `triggerLowStockCheck` then loops **one awaited email per low-stock product** (`triggers.ts:103-119`) inside `POST /api/mail/low-stock`, which itself has no auth check. `POST /api/mail/digest` also has no auth check.

**Impact:** password-recovery and digest endpoints can block for as long as the network allows (undici has no default timeout) → request pile-up, client skeletons with no error (PERF-008), and an unauthenticated caller can hold worker time open-endedly.

**Recommended fix:** add `AbortSignal.timeout(10_000)` to the provider `fetch` (and `connectionTimeout`/`socketTimeout` to nodemailer), move dispatch to a fire-and-forget path like the GRN trigger already uses (`receipts/[id]/receive/route.ts:41`), and add `requirePermission` to the three `/api/mail/*` routes.

---

### PERF-010 — SQLite is in rollback-journal mode with no configured busy timeout
**Severity: MEDIUM** · Category: DATABASE / CONFIGURATION · Evidence state: `MEASURED` (PRAGMA) · Status: OPEN

**Location:** `.env` (`DATABASE_URL="file:../db/custom.db"`, no query parameters) · `prisma/schema.prisma:12-14`

**Evidence (live):**
```
PRAGMA journal_mode → 'delete'      (no -wal / -shm files exist next to db/custom.db)
PRAGMA page_size    → 4096
```
With `journal_mode=delete`, a writer holds an exclusive lock for the whole commit and **readers block** (and vice-versa); the connection string configures no `busy_timeout`.

**Impact:** read/write interference will show up as tail-latency spikes or `SQLITE_BUSY` errors exactly when writes get longer (PERF-002/005). Contributing factor, not proven root cause: the 10-concurrent-login probe took 706-728 ms vs 91-147 ms sequential (§2.3) — that probe mixes scrypt CPU cost with lock contention, so **lock impact itself is `NOT MEASURED`**.

**Recommended fix:** `DATABASE_URL="file:../db/custom.db?journal_mode=WAL&busy_timeout=5000"` (WAL lets readers proceed during writes), then re-run a read+write concurrency test.

---

### PERF-011 — No `error.tsx` / error boundary: one view render exception replaces the whole app
**Severity: MEDIUM** · Category: CLIENT / RESILIENCE · Evidence state: `STATIC` · Status: OPEN

**Location:** `src/app/` — glob for `src/app/{error,global-error,not-found,loading}.tsx` returns **no files**; only Next's built-in `_global-error.html` exists in `.next/server/app/`.

**Evidence:** all 11 views are statically mounted under one route (PERF-007) with no segment-level boundary. Every view *does* handle query errors (verified), but a **render-time** exception (bad data shape, chart throwing on `NaN`, QR decode edge case) propagates to Next's default boundary and replaces the entire page; recovery requires a full reload.

**Impact:** no graceful degradation — a single view failure takes down navigation, session and every other view, in a SPA whose whole value proposition is offline/continuous use.

**Recommended fix:** add `src/app/error.tsx` + `global-error.tsx`, and wrap `ActiveView` (`view-registry.tsx:40-48`) in a per-view boundary that falls back to the dashboard with a retry.

---

### PERF-012 — No production capacity evidence exists (dev-server measurements only)
**Severity: MEDIUM** · Category: MEASUREMENT-BLOCKER · Evidence state: `MEASURED` (dev) / **production `NOT MEASURED`** · Status: OPEN

**Location:** methodology (§1.3), `package.json` (`start` script runs the standalone build, but it was not started)

**Evidence:** every number in §2 comes from `next dev`. Observed dev envelope: **46.6 req/s burst**, 23.2 req/s sustained over 60 s, p95 < 1 s, **0 errors**, with clear queuing (health endpoint 16 ms → 258 ms p95 at 20 concurrent). No `TARGET`/SLO exists in the repository, so no pass/fail can be declared.

**Impact:** release decisions would be made on dev-mode numbers; dev servers are typically slower (uncached compilation, no minification) and are not a capacity model.

**Recommended fix:** run the same script against `npm run start` (standalone build), record CPU/memory, and publish it as the baseline. Proposed (PROPOSAL, not FACT) acceptance bar: p95 < 300 ms at 20 concurrent reads, 0 errors over a 10-minute soak.

---

### PERF-013 — Every route is `force-dynamic` with no cache headers, and the client refetches aggressively
**Severity: LOW** · Category: CACHE · Evidence state: `STATIC` + `MEASURED` (payloads) · Status: OPEN

**Location:** all 44 handlers export `export const dynamic = 'force-dynamic'` (grep-verified); grep for `Cache-Control|s-maxage|revalidate` across `src` → **0 matches**; `src/app/providers.tsx:16-17` (`staleTime: 15_000`, `refetchOnWindowFocus: true`); `src/components/views/dashboard-view.tsx:30` (30 s), `products-view.tsx:104` (30 s), `mail-inbox-sheet.tsx:56` (5 s while open), plus 20-30 s intervals on 7 other views.

**Evidence:** `/api/meta` re-runs 4 whole-table queries (8+ statements) on every call for data that changes only when a supplier/location/product is created; measured 5.8 KB / p50 23.8 ms sequential.

**Impact:** redundant recomputation and refetch traffic; modest today (0 errors, 23 req/s soak), amplified by focus-refetch of the 30-40-statement dashboard.

**Recommended fix:** raise `staleTime` for `meta`/`products`, drop `refetchOnWindowFocus` for heavy queries, and consider `Cache-Control: private, max-age=30` on `/api/meta`.

---

### PERF-014 — The OTP store never evicts expired entries
**Severity: LOW** · Category: RESOURCE LEAK · Evidence state: `STATIC` · Status: OPEN

**Location:** `src/lib/auth/otp-store.ts:13`, `:22-29`, `:36-39`

**Evidence:**
```ts
const otpStore = new Map<string, StoredOtp>();
export function storeOtp(email, code, ttlMinutes = 10) { otpStore.set(normalized, {...expiresAt...}) }  // no sweep, no cap
// expiry is only checked lazily inside verifyAndConsumeOtp
if (Date.now() > entry.expiresAt) { otpStore.delete(normalized); ... }
```
An address that requests a code and never verifies keeps its entry **forever**; there is no timer, no size cap, and no eviction on write.

**Impact:** unbounded growth in unique-email count for the lifetime of the process (in-memory, multiplies per instance); the TTL is enforced only on access, so stale codes sit in memory indefinitely.

**Recommended fix:** sweep expired entries on `storeOtp` (or on a `setInterval`), and cap the map size with LRU eviction.

---

### PERF-015 — Expired sessions are never pruned
**Severity: LOW** · Category: RESOURCE LEAK · Evidence state: `STATIC` + `MEASURED` (row count) · Status: OPEN

**Location:** `src/lib/auth.ts:37` (create), `:42` (logout delete), `:61-66` (read with no cleanup); `src/app/api/auth/reset-password/route.ts:62`

**Evidence:** grep finds only those two `session.deleteMany` calls — both triggered by explicit user actions; nothing deletes `expiresAt < now` despite `SESSION_TTL_MS = 7 days` (`auth.ts:14`). Live row count grew 46 → 74 during this audit (logins only, none logged out).

**Impact:** table grows with every login forever; `Session` lookups are indexed on `token` so read cost is unaffected, but the table and its unique index grow monotonically.

**Recommended fix:** opportunistic `deleteMany({ where: { expiresAt: { lt: new Date() } } })` on login, or a daily sweep.

---

### PERF-016 — Prisma query logging is enabled globally with no consumer
**Severity: LOW** · Category: CONFIGURATION / OVERHEAD · Evidence state: `STATIC` · Status: OPEN

**Location:** `src/lib/db.ts:9-11`

**Evidence:**
```ts
export const db = globalForPrisma.prisma ?? new PrismaClient({ log: ['query'] })
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db   // ← env guard protects the singleton, not the logging
```
Grep for `$on(` across `src` → **0 matches**: nothing subscribes to the query events. The setting is unconditional, so it also applies to the production standalone build.

**Impact:** Prisma formats query strings for every statement it runs (its own docs warn query logging is comparatively expensive), for a log nobody reads; with 30-40 statements per dashboard request this is measurable overhead on the hot path.

**Recommended fix:** `log: process.env.NODE_ENV === 'production' ? [] : ['warn', 'error']`, or add a real `$on('query')` consumer with a slow-query threshold.

---

### PERF-017 — Offline queue has no size cap and failed items persist forever
**Severity: LOW** · Category: CLIENT / RESOURCE LEAK · Evidence state: `STATIC` · Status: OPEN

**Location:** `src/stores/offline-store.ts:163-176` (`enqueue`, no cap), `:222` (FAILED retained), `:242` (`clearFailed` — manual only), `:107-112` (persist to `localStorage`)

**Evidence:** `updateQueue((q) => [...q, item])` with no `MAX_QUEUE`; on a server-side rejection the item is marked `FAILED` and stays in the persisted array until the user manually clears it. Storage failures are swallowed (`:112`).

**Impact:** repeated offline rejections grow the persisted payload toward the ~5 MB `localStorage` quota (each item stores the full request body); FAILED items are re-shown but never auto-expired.

**Recommended fix:** cap the queue (e.g. 100 items, reject beyond with a clear toast), auto-expire FAILED items after N days or N attempts.

---

### PERF-018 — Dashboard aggregation reads are not atomic (no transaction around ~30 statements)
**Severity: LOW** · Category: CONSISTENCY · Evidence state: `STATIC` · Status: OPEN

**Location:** `src/lib/attention.ts:122-224` — `computeDashboard(db)` is called with the bare client (`src/app/api/dashboard/route.ts:14`), never `db.$transaction`.

**Evidence:** `stockLevel.findMany` (`:123`) and `ledgerEntry.findMany` (`:175`, `:195`) run as separate statements; in `journal_mode=delete` a concurrent write can land between them.

**Impact:** transiently torn KPIs (stock value computed from a snapshot that disagrees with the 14-day flows/activity shown beneath it) — a display-level inconsistency rather than data corruption, but it will become visible exactly when writes are frequent. Wrapping in a read transaction also lengthens lock hold time, so this is a deliberate trade-off, not an automatic win.

**Recommended fix:** accept and document eventual consistency, or derive flows/KPIs from one statement (single CTE) so consistency comes from SQL rather than from a long transaction.

---

## 4. Verified-Healthy Areas

Checked and found sound — recorded so they are not re-litigated:

1. **Route error handling.** 42 of 44 handlers wrap their body in `try/catch`; the two without (`health/route.ts`, `mail/inbox/route.ts`) contain no rejecting `await`. Measured: invalid JSON → 400, unknown route → 404, missing cookie → 401, malformed `limit`/`offset` → clamped 200. **Zero non-200 responses across 1,392 soak requests and 45-burst requests.**
2. **No connection leak.** `src/lib/db.ts:7-12` uses the standard dev-guarded singleton; one `PrismaClient` for the process (this *is* the constraint that makes PERF-016 worth fixing, but it is not a leak).
3. **Parameter clamping on `/api/ledger`.** `route.ts:25-26` — `limit` clamped to `[1,200]`, `offset ≥ 0`; measured `limit=99999&offset=-5` returned exactly the `limit=200` payload. No unbounded response via parameters.
4. **Mail outbox is bounded.** `provider.ts:16-19` and `:87-88` cap the in-memory outbox at `maxStored = 100` with `unshift`/`pop` — no unbounded growth.
5. **Offline replay has real backpressure.** `offline-store.ts:187` re-entrancy guard, `offline-replay.ts:106-110` interval installed **only while the queue is non-empty**, `:86` skips when offline, `:211-218` treats 401 as "auth died, keep queued" instead of retry-storming, `:231-236` guarantees no item is stuck in `SYNCING`.
6. **All 11 views render an explicit error state with a retry path** (grep: `isError` handled in dashboard, products, suppliers, receipts, deliveries, transfers, adjustments, counts, alerts, history, reorder, plus detail dialogs). Data-plane failures degrade to an error card, not a white screen — the gap is *render* errors (PERF-011) and *hangs* (PERF-008).
7. **Boot never wedges.** `auth-store.ts:62-76` catches `/api/auth/me` failures and falls back to the cached user or `anon`; `app-root.tsx:31` guards duplicate `sns:unauthorized` events so parallel failing queries fire the sign-out once.
8. **Query deduplication is in place.** One `QueryClient` for the app (`providers.tsx:11-26`), shared `queryKey`s (`['meta']`, `['products']`, `['dashboard']`) reused across dialogs, `staleTime` default 15 s, debounced search (`search-command.tsx` 300 ms; `history-view.tsx:61-67` 300 ms), `keepPreviousData` to avoid flicker. No duplicate client fetch machinery found.
9. **Relation loading is batched, not N+1.** Measured: `PRODUCT_INCLUDE` = **8 statements for 19 products** (relation loads use `WHERE id IN (…)`), `computeNeeds` = **4 statements**, dashboard stocks shape = 5. The N+1 problems are on the *write* path (PERF-005) and in *repeated* whole-object computation (PERF-004), not in the read includes.
10. **`computeAttention` parallelises its independent counts** (`attention.ts:26-37`, `Promise.all` over 6 queries) instead of awaiting them serially.
11. **Mail dispatch is correctly fire-and-forget on the mutation path that matters**: `receipts/[id]/receive/route.ts:41` uses `triggerGoodsReceiptNote(id).catch(...)`, so a slow SMTP/HTTPS call does not hold the response (the other three routes do not follow this pattern — PERF-009).
12. **`/api/search` is bounded**: `take: 8` with a `contains` filter (`search/route.ts:16-21`) — the one list endpoint that paginates at the database.
13. **No unbounded `take: 1e9`-style queries** were found anywhere (grep across `src`): unbounded reads are *whole-table* reads (PERF-001/006), not unbounded offsets.

---

## 5. Residual Risk / Open Questions

| # | Item | State |
|---|---|---|
| R1 | **Production performance unknown.** All numbers are `next dev`. | `NOT MEASURED` — MEASUREMENT-BLOCKER (PERF-012) |
| R2 | **Write-path latency and lock contention not measured.** `createReceipt`/`receiveReceipt`/`markDeliveryPacked` would have mutated live business documents during a concurrent audit; `SQLITE_BUSY` behaviour therefore untested. | `NOT MEASURED` — static analysis only (PERF-002/005/010) |
| R3 | **Concurrent DB activity during the audit.** LedgerEntry 114 → 142, DeliveryOrder 15 → 17, Transfer 2 → 8 while measuring. Latency samples may include another session's load. | Confounded measurement, declared |
| R4 | **No SLO/TARGET in the repository.** No pass/fail threshold can be asserted; thresholds in PERF-012 are labelled PROPOSAL. | `TARGET = UNKNOWN` |
| R5 | **Bundle figures are from the last build's artifacts**, while the running server serves dev chunks (different hashes). Raw/gzip sizes come from `.next/static/chunks` files written at build time. | Stale-but-authentic build evidence |
| R6 | **Mail path latency not measured** (would dispatch real email through Brevo). | `NOT MEASURED` (PERF-009) |
| R7 | **Out of scope, flagged for other auditors:** `.env` **is tracked in git** (`git ls-files .env` → `.env`, currently modified) and contains a live Brevo API key; `/api/mail/inbox`, `/api/mail/digest`, `/api/mail/low-stock` perform work with **no auth check**. | Hand off to Security |
| R8 | **Multi-instance deployment would break in-process state** (OTP store, mail outbox, dev-only singleton assumptions) before any of the measured limits matter. | Open design question |

**Blockers:** `MEASUREMENT-BLOCKER` (R1, R2, R6). No `PERFORMANCE-BLOCKER` was raised — nothing measured exceeded an existing acceptance criterion, because none exists.

---

## 6. Summary

### 6.1 Findings by severity

| Severity | Count | IDs |
|---|---:|---|
| CRITICAL | 0 | — |
| HIGH | 3 | PERF-001, PERF-002, PERF-003 |
| MEDIUM | 9 | PERF-004 … PERF-012 |
| LOW | 6 | PERF-013 … PERF-018 |
| INFO | 0 | — |
| **Total** | **18** | |

### 6.2 Key measured results

| Metric | Value | State |
|---|---|---|
| `p95 /api/products` | **366.9 ms** (sequential-only p95 57.6 ms) | MEASURED, dev |
| `p95 /api/dashboard` | **692.0 ms** (sequential-only p95 80.1 ms) | MEASURED, dev |
| Sustained read soak (60 s, 3 workers) | 23.2 req/s · p50 82.1 ms · p95 338.7 ms · max 1,398.7 ms · **0 errors** | MEASURED, dev |
| Mixed burst (45 concurrent) | 46.6 req/s · p95 957.1 ms · **0 errors** | MEASURED, dev |
| First-load JS for `/` | 2,208,851 B raw / **595.3 KB gzip** + 176 KB CSS | MEASURED (build artifacts) |
| SQL statements per `computeNeeds` / `PRODUCT_INCLUDE` | 4 / 8 | MEASURED |
| Secondary indexes declared | **0** | MEASURED |
| SQLite `journal_mode` | `delete` (no WAL) | MEASURED |

### 6.3 Highest-value next actions

1. **PERF-002 + PERF-003** — stop scanning the ledger for codes on every write, and add the indexes; these two convert an O(N²) write path into O(1) and remove the 5 s transaction-abort risk.
2. **PERF-001 + PERF-006** — push pagination and filters into SQL; the ledger is the fastest-growing table and currently ships whole.
3. **PERF-004 + PERF-007** — one `computeNeeds` per dashboard request and per-view `next/dynamic`; together they are the cheapest measurable wins on the two slowest paths (692 ms p95 endpoint, 2.16 MiB bundle).

---

*Evidence artifacts: `perf-latency.json`, `perf-round2.json`, `perf-round3.json` and the measurement scripts used to produce them are stored outside the repository in `C:\Users\RUDRA PARIKH\AppData\Local\Temp\opencode\` (no production files were modified by this audit).*
