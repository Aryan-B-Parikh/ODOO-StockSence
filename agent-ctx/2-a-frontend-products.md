# Task 2-a — frontend-products (Products + Receipts views)

Full work record: see `/home/z/my-project/worklog.md` (Task ID: 2-a section at the end).

## Quick summary
- **Products view** (`src/components/views/products-view.tsx` + `products/`): summary strip (SKUs / stock value / below-reorder amber / stockouts red from `response.summary` — always full-catalogue), filters (debounced search + category Select hit the API with `['products', search, category]`; "Below reorder" / "Stockout risk" Toggle chips filter client-side on the computed DTO flags for instant feedback), 11-column Table (SKU+name, category chip, unit cost, on-hand, reserved, **available bold**, incoming, in-transit, damaged, reorder pt., StatusBadge OK emerald / Below reorder amber / Stockout red) with horizontal scroll on mobile, keyboard-accessible rows (Enter/Space open detail).
- **ProductDetailDialog** (`products/product-detail-dialog.tsx`): `['products','detail',id]` + `['ledger','product',id]` queries; hero emerald "Available" card (caption "on-hand − reserved — what can be promised") + 5 qty tiles; reorder profile card with the supplier-aware formula caption (`12 kg/day × 5-day lead + 15 kg safety`), projected available (onHand+incoming−reserved), colored ratio bar vs reorder point; stock-by-location table; supplier list (preferred star, lead days, cost, MOQ, multiple, reliability %); compact recent-ledger list (DocCodeChip + field + signed delta + timeAgo) + "Full move history" link. Driven by `useUIStore().productDetailId` — the global search (⌘K) opens it directly from any view.
- **NewProductDialog** (`products/new-product-dialog.tsx`, perm `configure`): RHF+zod, category Select from list response, valueClass Select with hints, optional preferred supplier from `['meta']` → POST /api/products → toast → invalidates products/meta/dashboard/search.
- **Receipts view** (`src/components/views/receipts-view.tsx` + `receipts/`): `['receipts']` 20s refetch; Tabs All/Expected/Received/Cancelled with live counts + "Delayed only" red Toggle chip (daysLate > 0); responsive card grid (DocCodeChip, StatusBadge with pulse dot on EXPECTED, "4d late" red badge, supplier, expected/received dates, first-2-SKU preview "+n more", note).
- **ReceiptDetailDialog** (`receipts/receipt-detail-dialog.tsx`): lines table with colored variance; inline receive form for EXPECTED + perm `receive` (per-line receivedQty prefilled = expectedQty, damagedQty, note; client validation damaged ≤ received) → POST receive → toast `Receipt RCPT-xxxx received — stock is now available` → invalidates receipts/products/dashboard/ledger/meta/attention → dialog live-updates to RECEIVED state (receipt prop comes from the query cache). "Cancel receipt" with AlertDialog confirm. Permission-missing hint otherwise.
- **NewReceiptDialog** (`receipts/new-receipt-dialog.tsx`, perm `receive`): RHF+zod `useFieldArray`, product Select grouped by category (SKU + unit), location Select grouped by zone, expectedAt default +3 days, amber explainer "Creating an expectation raises incoming — stock shows as available only once received", per-line on-hand/available hint → POST /api/receipts → toast with new code.

## Shared components created for ALL agents (`src/components/shared/`, barrel `index.ts`)
- `StatusBadge({status,label})` — every app status → color map (EXPECTED amber+pulse, RECEIVED/POSTED/OK emerald, CANCELLED/REJECTED/DISMISSED stone, RESERVED/REVIEWED teal, PICKED/PACKED/OPEN/PENDING amber-orange, IN_TRANSIT amber+pulse, PENDING_APPROVAL amber-600+pulse, STOCKOUT red, …). `getProductStatus(p)` → {status,label}.
- `SeverityBadge({severity,label})` — LOW emerald · MEDIUM amber · HIGH red · CRITICAL solid dark red.
- `DocCodeChip({docType, code})` + exported `DOC_STYLES` — mono chip per docType (matches dashboard activity-list palette).
- `EmptyState({icon,title,description,action})` — dashed friendly empty/error card with optional retry action.
- `QuantityPill({value,tone,zeroMuted})` — tabular qty, zeros dimmed, tones good/warn/bad/accent.
- Reuse: `import { StatusBadge, DocCodeChip, EmptyState, SeverityBadge, QuantityPill, getProductStatus } from '@/components/shared'`.

## Conventions for Task 2-b / 2-c
- Query keys now in use: `['products', search, category]`, `['products','detail',id]` (prefix-invalidated by `['products']`), `['receipts']`, `['meta']`, `['ledger','product',id]`, plus `['dashboard']`, `['search',q]` from 1-b. Invalidation after any stock mutation: invalidate `receipts`/`products`/`dashboard`/`ledger`/`meta`/`attention`.
- Number-input pattern with RHF that passes the react-compiler lint rule: use FormField + `value={Number.isNaN(field.value) ? '' : field.value}` + `onChange={(e) => field.onChange(e.target.value === '' ? NaN : Number(e.target.value))}` (do NOT use `form.watch()` — use `useWatch`).
- Selects with string values; convert with `Number()` on submit. `useFieldArray` + `useWatch` for dynamic line rows.
- Zod v4 custom number error: `z.number({ error: 'Qty is required' })`.

## Verification (agent-browser, isolated session `t2a`)
- Login (manager) → Products: summary 19 SKUs/$9.8K/3 below/1 stockout, table renders 19 rows, Steel Rods row OK.
- Product detail: AVAILABLE 60 kg hero, reorder profile `12 kg/day × 5-day lead + 15 kg safety`, projected 60/75 = 80% bar, 2-location stock table, Metro Steel supplier w/ star, 10 ledger entries.
- Receipts: tabs All 6/Expected 2/Received 4/Cancelled 0, delayed chip; RCPT-1005 shows "4 days late".
- New Receipt dialog: product groups by category ✓, locations grouped by zone ✓, qty + live on-hand hint ✓, add/remove lines ✓, supplier select ✓ → created RCPT-1007 (toast + live tab counts + card).
- Receive flow on RCPT-1007: 23 received + 2 damaged + note → toast "Receipt RCPT-1007 received — stock is now available" → dialog live-updated to RECEIVED with −2 pcs variance; API verified goggles 149 onHand/2 damaged (engine: good = received − damaged).
- **DB re-seeded afterwards** (`bun prisma/seed.ts`) → verified pristine: 6 receipts RCPT-1001..1006, goggles 128/0, 88 ledger, delayed receipt back. ⚠️ Sessions were wiped by the re-seed — log in again if you hit 401s.
- `bun run lint`: 0 errors 0 warnings · `bunx tsc --noEmit`: 0 errors in my files · dev.log clean (no runtime/compile errors from my views; only 401s from pre-re-seed stale cookies of other agents' sessions).
