'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

import { OfflineError } from '@/lib/api'
import { useOfflineStore } from '@/stores/offline-store'

/**
 * Client-side offline-queue conveniences (the queue + replay loop themselves
 * live in src/stores/offline-store.ts):
 *
 *  - `enqueueableMutation` — wraps a submit handler so an OfflineError (real
 *    network drop OR the airplane-mode simulation) parks the action in the
 *    device queue instead of failing. ApiError / other errors rethrow, so the
 *    existing error handling is untouched — the online path is exactly what
 *    it was before (the queue is strictly additive: "every shortcut has a
 *    manual fallback").
 *
 *  - `useOfflineAutoReplay` — installs the auto-replay triggers for the
 *    session: the window 'online' event plus a 30s interval that only runs
 *    while the queue is non-empty. Called once from the app shell.
 */

/**
 * Wrapper result:
 *  - `{ synced: true,  queued: false, data }` — the request reached the server.
 *  - `{ synced: false, queued: true,  data: undefined }` — saved on the device;
 *    callers should close their dialog and skip toasts/invalidations.
 */
export type EnqueueableResult<T> =
  | { synced: true; queued: false; data: T }
  | { synced: false; queued: true; data: undefined }

/**
 * Try the real API call; on OfflineError, queue it for replay.
 *
 * ```ts
 * const submitMutation = useMutation({
 *   mutationFn: (payload) =>
 *     enqueueableMutation({
 *       label: `Count ${count.code} submission (${payload.lines.length} lines)`,
 *       method: 'POST',
 *       path: `/api/counts/${count.id}/submit`,
 *       body: payload,
 *       submit: () => api.post(`/api/counts/${count.id}/submit`, payload),
 *     }),
 *   onSuccess: (res) => {
 *     if (res.queued) return closeDialog()   // saved offline — replay handles the rest
 *     …existing success path (res.data)…
 *   },
 *   onError: (e) => toast.error(e.message),  // ApiError path unchanged
 * })
 * ```
 */
export async function enqueueableMutation<T>(opts: {
  label: string
  method: 'POST' | 'PATCH'
  path: string
  body: unknown
  /** The real API call (bind it to the same path/body). */
  submit: () => Promise<T>
}): Promise<EnqueueableResult<T>> {
  try {
    const data = await opts.submit()
    return { synced: true, queued: false, data }
  } catch (err) {
    if (err instanceof OfflineError) {
      useOfflineStore.getState().enqueue({
        label: opts.label,
        method: opts.method,
        path: opts.path,
        body: opts.body,
      })
      toast.warning('Saved offline — will sync when reconnected', { description: opts.label })
      return { synced: false, queued: true, data: undefined }
    }
    throw err
  }
}

/** Shared guard for every auto-replay trigger (mount / 'online' / interval). */
function attemptAutoReplay() {
  const s = useOfflineStore.getState()
  if (s.simulatedOffline) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  if (!s.queue.some((a) => a.status === 'QUEUED')) return
  void s.replay()
}

/**
 * Session-wide auto-replay wiring — call ONCE from the app shell.
 * Triggers: window 'online' event, plus a 30s interval installed only while
 * the queue is non-empty (and a drain attempt right after mount, so a page
 * reload with a persisted queue syncs immediately).
 */
export function useOfflineAutoReplay() {
  const hasQueued = useOfflineStore((s) => s.queue.length > 0)

  useEffect(() => {
    attemptAutoReplay()
    window.addEventListener('online', attemptAutoReplay)
    return () => window.removeEventListener('online', attemptAutoReplay)
  }, [])

  useEffect(() => {
    if (!hasQueued) return
    const interval = window.setInterval(attemptAutoReplay, 30_000)
    return () => window.clearInterval(interval)
  }, [hasQueued])
}
