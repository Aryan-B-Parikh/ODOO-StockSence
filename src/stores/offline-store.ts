'use client'

import { create } from 'zustand'
import { toast } from 'sonner'

import { OFFLINE_QUEUE_STORAGE_KEY, ApiError, OfflineError, api } from '@/lib/api'
import { getQueryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Offline action queue (Phase 2 — "actions queue on the device and sync
 * automatically when back online"; the airplane-mode simulation is the
 * Phase 5 pilot-testing tool for it).
 *
 * Warehouse staff keep working through network dead zones: submit handlers
 * wrapped with `enqueueableMutation` (src/lib/offline-replay.ts) catch
 * OfflineError and park the action here instead of failing. This store
 * persists everything to localStorage under `stocksense.offline-queue` as
 * `{ simulatedOffline, queue }` (manual persistence, lock-store pattern —
 * saved on every mutation, hydrated by `initOffline()` from the app shell).
 *
 * The REPLAY ENGINE lives here too (`replay()`): the queue and its sync loop
 * are one domain concept, and this keeps the dependency direction strict —
 * offline-replay.ts (UI-side helpers) → this store → api.ts / query-client.
 *
 * Replay semantics:
 *  - FIFO over QUEUED items only; no-op while offline.
 *  - 2xx        → removed from the queue.
 *  - ApiError   → FAILED with the server's message. The server re-validated
 *                 the action against CURRENT stock and rejected it (e.g.
 *                 "insufficient available") — that is correct behavior: we
 *                 surface it, never silently retry.
 *  - OfflineError → back to QUEUED, loop stops (the 30s interval / 'online'
 *                 event will pick it up again).
 */

export type QueuedActionStatus = 'QUEUED' | 'SYNCING' | 'FAILED'

export interface QueuedAction {
  id: string
  /** Human description, e.g. "Count CNT-42 submission (2 lines)". */
  label: string
  method: 'POST' | 'PATCH'
  path: string
  body: unknown
  /** ISO timestamp. */
  queuedAt: string
  status: QueuedActionStatus
  attempts: number
  /** Rejection reason — only set when status is FAILED. */
  error?: string
}

export interface EnqueueInput {
  label: string
  method: 'POST' | 'PATCH'
  path: string
  body: unknown
}

/** Persisted shape (flat, like lock-store). */
interface PersistedOffline {
  simulatedOffline: boolean
  queue: QueuedAction[]
}

/** New-style UUID when available; time-based fallback for non-secure contexts. */
function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `qa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function isValidAction(a: unknown): a is QueuedAction {
  if (a == null || typeof a !== 'object') return false
  const q = a as Partial<QueuedAction>
  return (
    typeof q.id === 'string' &&
    typeof q.label === 'string' &&
    (q.method === 'POST' || q.method === 'PATCH') &&
    typeof q.path === 'string' &&
    typeof q.queuedAt === 'string' &&
    (q.status === 'QUEUED' || q.status === 'SYNCING' || q.status === 'FAILED')
  )
}

function readPersisted(): PersistedOffline {
  if (typeof window === 'undefined') return { simulatedOffline: false, queue: [] }
  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY)
    if (!raw) return { simulatedOffline: false, queue: [] }
    const parsed = JSON.parse(raw) as Partial<PersistedOffline>
    const queue = (Array.isArray(parsed.queue) ? parsed.queue : [])
      .filter(isValidAction)
      // A page closed mid-replay can leave an item stuck in SYNCING —
      // restoring it as QUEUED lets the next replay attempt it again.
      .map((a) => ({
        ...a,
        status: a.status === 'SYNCING' ? ('QUEUED' as const) : a.status,
        attempts: typeof a.attempts === 'number' ? a.attempts : 0,
      }))
    return { simulatedOffline: parsed.simulatedOffline === true, queue }
  } catch {
    return { simulatedOffline: false, queue: [] }
  }
}

function persist(data: PersistedOffline) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Storage blocked/full — the queue still lives for this page session.
  }
}

/** Re-entrancy guard: auto-replay triggers can fire in quick succession. */
let replayInFlight = false

interface OfflineState {
  /** Airplane-mode simulation — blocks every request (see src/lib/api.ts). */
  simulatedOffline: boolean
  queue: QueuedAction[]
  /** Hydrate state from localStorage. Called once from the app shell mount. */
  initOffline: () => void
  /** Toggle the simulation (persisted). Turning it OFF drains the queue immediately. */
  setSimulatedOffline: (v: boolean) => void
  /** Park an action for later replay; returns the stored item. */
  enqueue: (action: EnqueueInput) => QueuedAction
  /** Replay QUEUED actions in FIFO order (no-op while offline). */
  replay: () => Promise<void>
  /** Remove a single item (user "Discard" on a failed action). */
  remove: (id: string) => void
  /** Drop every FAILED item. */
  clearFailed: () => void
}

export const useOfflineStore = create<OfflineState>((set, get) => {
  /** Mutate the queue and persist in one step. */
  const updateQueue = (fn: (queue: QueuedAction[]) => QueuedAction[]) => {
    const queue = fn(get().queue)
    set({ queue })
    persist({ simulatedOffline: get().simulatedOffline, queue })
  }

  return {
    simulatedOffline: false,
    queue: [],

    initOffline: () => {
      const stored = readPersisted()
      set({ simulatedOffline: stored.simulatedOffline, queue: stored.queue })
    },

    setSimulatedOffline: (v) => {
      set({ simulatedOffline: v })
      persist({ simulatedOffline: v, queue: get().queue })
      if (!v) {
        // Airplane mode off → try to drain the queue right away.
        void get().replay()
      }
    },

    enqueue: (action) => {
      const item: QueuedAction = {
        id: newId(),
        label: action.label,
        method: action.method,
        path: action.path,
        body: action.body,
        queuedAt: new Date().toISOString(),
        status: 'QUEUED',
        attempts: 0,
      }
      updateQueue((q) => [...q, item])
      return item
    },

    replay: async () => {
      // Nothing to do while the device (or the simulation) is offline.
      if (get().simulatedOffline) return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      // Never replay while unauthenticated — queued actions need the session
      // cookie; replaying them signed-out would 401-fail them permanently.
      // (auth-store imports only api.ts, so this direction can't cycle.)
      if (!useAuthStore.getState().user) return
      if (!get().queue.some((a) => a.status === 'QUEUED')) return
      if (replayInFlight) return
      replayInFlight = true
      try {
        let synced = 0
        // FIFO snapshot of what is queued right now; items enqueued during
        // the loop are picked up by the next trigger.
        const pending = get().queue.filter((a) => a.status === 'QUEUED')
        for (const action of pending) {
          updateQueue((q) =>
            q.map((a) => (a.id === action.id ? { ...a, status: 'SYNCING', attempts: a.attempts + 1 } : a))
          )
          try {
            await api.request(action.path, {
              method: action.method,
              body: action.body === undefined ? undefined : JSON.stringify(action.body),
            })
            updateQueue((q) => q.filter((a) => a.id !== action.id))
            synced += 1
          } catch (err) {
            if (err instanceof OfflineError) {
              // Still offline — put it back and stop; auto-retry continues.
              updateQueue((q) => q.map((a) => (a.id === action.id ? { ...a, status: 'QUEUED' } : a)))
              break
            }
            if (err instanceof ApiError && err.status === 401) {
              // Session died mid-replay: the ACTION wasn't rejected — the auth
              // was. Return the item to QUEUED (not FAILED) and stop; the
              // global 401 recovery bounces to sign-in and the auto-replay
              // triggers drain the queue again after re-login.
              updateQueue((q) => q.map((a) => (a.id === action.id ? { ...a, status: 'QUEUED' } : a)))
              break
            }
            // ApiError (server re-validated and rejected — e.g. stale stock,
            // "insufficient available") or anything unexpected: FAILED, surfaced.
            const message = err instanceof Error ? err.message : 'Unknown error'
            updateQueue((q) => q.map((a) => (a.id === action.id ? { ...a, status: 'FAILED', error: message } : a)))
            toast.error(`Queued action failed: ${action.label}`, { description: message, duration: 10_000 })
          }
        }
        if (synced > 0) {
          toast.success(`${synced} offline ${synced === 1 ? 'action' : 'actions'} synced`)
          const qc = getQueryClient()
          if (qc) void qc.invalidateQueries()
        }
      } finally {
        replayInFlight = false
        // Safety net: never leave an item stuck in SYNCING.
        if (get().queue.some((a) => a.status === 'SYNCING')) {
          updateQueue((q) => q.map((a) => (a.status === 'SYNCING' ? { ...a, status: 'QUEUED' } : a)))
        }
      }
    },

    remove: (id) => updateQueue((q) => q.filter((a) => a.id !== id)),

    clearFailed: () => updateQueue((q) => q.filter((a) => a.status !== 'FAILED')),
  }
})
