# Task 6-a — full-stack-developer — Offline action queue (Phase 2)

> Work record mirror for sub-agent context. The canonical record lives at the end of `/home/z/my-project/worklog.md` (Task ID: 6-a). See the worklog for the full project context, seeded-data snapshot, and conventions; previous agents' records are in this directory and in the worklog.

## What was built

Offline action queue (Phase 2 of the implementation plan): mutations queue on the device when disconnected (real network drop OR the airplane-mode simulation used for Phase 5 pilot testing) and replay automatically on reconnect. Every shortcut keeps its manual/online path — the queue is strictly additive.

### Files CREATED
- `src/lib/query-client.ts` — module-level QueryClient ref (`registerQueryClient`/`getQueryClient`); providers.tsx registers the app client (least-invasive way for store-side replay to invalidate queries).
- `src/stores/offline-store.ts` — Zustand store + manual localStorage persistence (`stocksense.offline-queue`, flat `{simulatedOffline, queue}`, lock-store pattern). State: `simulatedOffline`, `queue: QueuedAction[]` (id crypto.randomUUID, label, method POST|PATCH, path, body, queuedAt ISO, status QUEUED|SYNCING|FAILED, attempts, error?). Actions: initOffline / setSimulatedOffline (OFF with non-empty queue → immediate drain) / enqueue (returns item) / replay (the engine: FIFO, SYNCING→attempts+1, 2xx→removed, ApiError→FAILED+toast "Queued action failed: <label> — <reason>" surfaced never retried, OfflineError→back to QUEUED+stop; after ≥1 sync → ONE "N offline actions synced" toast + invalidateQueries; re-entrancy guard + no-stuck-SYNCING safety) / remove / clearFailed.
- `src/lib/offline-replay.ts` — `enqueueableMutation({label, method, path, body, submit})` wrapper (OfflineError → enqueue + amber "Saved offline — will sync when reconnected" toast + `{queued:true}` result; ApiError rethrows → existing onError unchanged) + `useOfflineAutoReplay()` hook (window 'online' + 30s interval only while queue non-empty + mount drain for reloads with a persisted queue).
- `src/components/shell/offline-banner.tsx` — amber banner (in normal flow under the topbar, pushes content, aria-live) + queue Sheet (side right): airplane-mode Switch, per-item label / method+path mono chip / timeAgo / attempts / status badge (QUEUED amber, SYNCING pulse, FAILED red + error + Discard), empty state, bulk "Clear failed", "Sync now" disabled while simulated offline (tooltip explains).

### Files EDITED (surgical)
- `src/lib/api.ts` — added `OfflineError` (isSimulated flag), `OFFLINE_QUEUE_STORAGE_KEY` + `isSimulatedOffline()` (parses the store's persisted JSON directly from localStorage — no store import, no cycle), request() throws simulated OfflineError before fetch + converts fetch TypeError into real-drop OfflineError; 4xx/5xx → ApiError and the 401 `sns:unauthorized` dispatch are 100% untouched; added `api.request(path, init)` escape hatch for the replay engine.
- `src/app/providers.tsx` — registers the QueryClient (one additive line inside the existing useState initializer).
- `src/components/shell/topbar.tsx` — WifiOff toggle next to the Lock button (amber when on, aria-pressed, tooltip) + queued-count badge (caps at 9+).
- `src/components/shell/app-shell.tsx` — initOffline() on mount, useOfflineAutoReplay(), `<OfflineBanner/>` between Topbar and main.
- `src/components/views/counts/count-detail-dialog.tsx` — submit mutationFn wrapped in enqueueableMutation; onSuccess: `if (res.queued) { onDone(); return }` (no toasts/invalidations when queued); synced path byte-identical.
- `src/components/views/adjustments/new-adjustment-dialog.tsx` — same wrap for POST /api/adjustments.

### Dependency chain (no cycles)
`offline-replay.ts → offline-store.ts → api.ts / query-client.ts`; api.ts reads the simulated flag straight from localStorage. `providers.tsx → query-client.ts`.

## Verification (all green)
- `bun run lint` 0 errors · `bunx tsc --noEmit` 0 errors in src (only pre-existing examples/+skills/).
- curl: manager login 200, GET /api/counts 200.
- agent-browser E2E: airplane ON → banner + disabled Sync now → CNT-42 offline submit → amber toast + banner count 1 + topbar badge → queue sheet QUEUED item → airplane OFF → auto-replay → "1 offline action synced" → CNT-42 COMPLETED (server curl + UI refetch). Same for CNT-43 with the sheet open during replay (stays open, drains to empty). FAILED path via the contract-sanctioned synthetic enqueue (bogus path in localStorage → reload → hydration → mount replay → 404 → FAILED + toast + banner "Clear failed (1)" + sheet error/Discard/attempts) — per-item Discard AND bulk Clear failed verified. Real-network-drop path: fetch overridden to reject TypeError (no airplane) → adjustment queued + Sync now graceful no-op while broken. Layout: banner directly under sticky topbar (top=56) in flow; sticky footer intact; 390px mobile: banner wraps, no horizontal overflow, sheet full-width. Zero page errors; dev.log clean.
- DB drift (NOT re-seeded, main agent decides): CNT-42 + CNT-43 OPEN→COMPLETED (clean counts, zero ledger/stock impact) + ADJ-912 POSTED LOW zero-variance record (zero ledger entries, zero stock impact). Stock + ledger byte-identical to pristine.

## Notes for future agents
- Queue more flows by wrapping any mutationFn with `enqueueableMutation` — one call, nothing else changes (online path identical).
- FAILED items are never auto-retried; only Discard / Clear failed remove them.
- Reloading while airplane mode is ON lands on the login screen (PRE-EXISTING auth-store init behavior); the queue survives in localStorage and replays after re-login.
