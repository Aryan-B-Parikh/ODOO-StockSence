/**
 * StockSense — typed API client (client-side fetch helpers).
 * All paths are RELATIVE (same-origin).
 *
 * Session recovery: any 401 from a non-login endpoint dispatches the
 * `sns:unauthorized` window event. AppRoot listens for it and resets the
 * auth state, so a wiped/expired session instantly returns the user to the
 * sign-in screen instead of endless "data not loading" error cards.
 *
 * Offline support (Phase 2 — offline action queue):
 *  - `OfflineError` is thrown whenever the API can't be reached: either a
 *    REAL network drop (fetch rejects with TypeError) or the airplane-mode
 *    SIMULATION (see src/stores/offline-store.ts — the Phase 5 "test the
 *    offline queue" pilot tool).
 *  - The simulated flag is read straight from localStorage, NOT from the
 *    store module: the offline store imports this file (replay engine), so
 *    this direction must stay dependency-free to avoid a circular import.
 *  - HTTP error responses (4xx/5xx) keep throwing ApiError exactly as
 *    before — including the 401 event dispatch.
 */

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

/** localStorage key of the offline store's persisted JSON (single source of truth for both modules). */
export const OFFLINE_QUEUE_STORAGE_KEY = 'stocksense.offline-queue'

/** Thrown when the API is unreachable — really, or via the airplane-mode simulation. */
export class OfflineError extends Error {
  /** true when raised by the simulation (vs a genuine network drop). */
  isSimulated: boolean
  constructor(message: string, opts?: { isSimulated?: boolean; cause?: unknown }) {
    super(message)
    this.name = 'OfflineError'
    this.isSimulated = opts?.isSimulated ?? false
    if (opts?.cause !== undefined) this.cause = opts.cause
  }
}

/**
 * Read the airplane-mode flag from the offline store's persisted JSON
 * (shape `{ simulatedOffline, queue }` — default false when missing/corrupt).
 */
export function isSimulatedOffline(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as { simulatedOffline?: unknown }
    return parsed?.simulatedOffline === true
  } catch {
    return false
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Airplane-mode simulation — behave exactly like a dead network, before
  // any request leaves the device.
  if (isSimulatedOffline()) {
    throw new OfflineError('Offline (airplane-mode simulation) — the request was not sent', { isSimulated: true })
  }
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch (err) {
    // fetch itself rejected (network down / server unreachable) → TypeError.
    // Anything else (e.g. a caller-side abort) keeps its original error.
    if (err instanceof TypeError) {
      throw new OfflineError("Offline — the server can't be reached", { isSimulated: false, cause: err })
    }
    throw err
  }
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // keep statusText
    }
    // Global session-expiry recovery. The login endpoint legitimately
    // returns 401 for wrong credentials — that must NOT sign the app out.
    if (res.status === 401 && !path.startsWith('/api/auth/login') && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sns:unauthorized'))
    }
    throw new ApiError(message, res.status)
  }
  return res.json() as Promise<T>
}

export const api = {
  /** Raw escape hatch — the offline replay engine replays stored method/path/body through this. */
  request<T>(path: string, init?: RequestInit): Promise<T> {
    return request<T>(path, init)
  },
  get<T>(path: string): Promise<T> {
    return request<T>(path)
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined })
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' })
  },
}
