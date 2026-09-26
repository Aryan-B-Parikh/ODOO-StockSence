# Task 1-b — frontend-shell (App shell, Login, Dashboard)

Full work record: see `/home/z/my-project/worklog.md` (Task ID: 1-b section at the end).

## Quick summary
- Auth gate (`src/components/app-root.tsx`): loading → boot skeleton · anon → LoginView · authed → AppShell.
- Stores: `src/stores/auth-store.ts` (init/login/logout vs /api/auth/*), `src/stores/ui-store.ts` (ViewKey × 10, setView, openProduct, metaPanelOpen, #view=xxx hash sync).
- Shell: `src/components/shell/{app-shell,sidebar,topbar,footer,search-command,page-header}.tsx` + `nav.ts` (single source of nav truth). Sticky footer (min-h-screen flex-col + mt-auto), mobile hamburger → Sheet with same nav, ⌘K global product search (Popover+Command, debounced /api/search).
- Dashboard: `src/components/views/dashboard-view.tsx` + `dashboard/{kpi-cards,attention-panel,charts-row,rack-grid,activity-list,states,motion}` — 30s refetch, skeleton, retryable error card, Recharts donut + 14-day flows, rack fill bars, severity-ranked Needs Attention.

## Stub files that MUST be replaced by Task 2 agents (whole file, keep named export)
- Task 2-a: `src/components/views/products-view.tsx` (ProductsView), `receipts-view.tsx` (ReceiptsView)
- Task 2-b: `src/components/views/deliveries-view.tsx` (DeliveriesView), `transfers-view.tsx` (TransfersView), `adjustments-view.tsx` (AdjustmentsView)
- Task 2-c: `src/components/views/counts-view.tsx` (CountsView), `history-view.tsx` (HistoryView), `alerts-view.tsx` (AlertsView), `reorder-view.tsx` (ReorderView)

Registry: `src/components/views/view-registry.tsx` — needs NO edits when stubs are replaced (named exports preserved).

## Conventions established
- `<PageHeader title subtitle icon actions>` from '@/components/shell/page-header' starts every view (stubs already use it).
- Views render standalone inside shell `<main>`; wrap top level in `space-y-6`.
- docType chip colors + severity palette: see `dashboard/activity-list.tsx` DOC_STYLES.
- Motion variants: '@/components/views/dashboard/motion' (fadeUp, staggerContainer).
- Query keys in use: ['dashboard'], ['search', q]. Topbar refresh invalidates ALL queries.
- Backend status at handover: /api/auth/login returns 500 (Task 1-a bug, their route.ts line 22) — frontend degrades gracefully; integration-test login after 1-a lands.

## Verification
- `bun run lint`: 0 errors · tsc: 0 errors in frontend files · `GET /` 200 with correct title/boot screen.
EOF
