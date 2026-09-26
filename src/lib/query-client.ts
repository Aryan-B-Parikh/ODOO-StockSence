import type { QueryClient } from '@tanstack/react-query'

/**
 * StockSense — module-level QueryClient ref.
 *
 * Why this exists: the offline queue's replay engine lives in the Zustand
 * store (`src/stores/offline-store.ts`), OUTSIDE the React tree, but after a
 * successful full replay it must refresh every query on screen. React hooks
 * can't be called from a store action, so instead:
 *
 *   1. `src/app/providers.tsx` calls `registerQueryClient(client)` once when
 *      it creates the app-wide QueryClient (a one-line, additive edit).
 *   2. Anything outside the tree calls `getQueryClient()` (null before the
 *      providers mount — callers must handle that).
 *
 * This is deliberately the least invasive option: no context plumbing, no
 * replay callbacks through props, and a hard single dependency direction
 * (store → this module; providers → this module).
 */

let client: QueryClient | null = null

/** Record the app-wide client. Idempotent — providers calls this once on mount. */
export function registerQueryClient(c: QueryClient): void {
  client = c
}

/** The app-wide client, or null before Providers has mounted. */
export function getQueryClient(): QueryClient | null {
  return client
}
