'use client'

import { create } from 'zustand'
import { api, OfflineError } from '@/lib/api'
import type { SessionUser } from '@/lib/types'

export type AuthStatus = 'loading' | 'authed' | 'anon'

/**
 * localStorage key for the last successfully-authenticated user. Used ONLY
 * for optimistic session restore when the API is unreachable (offline /
 * airplane-mode simulation / dev-server restart): a warehouse device that
 * loses connectivity must NOT sign its user out mid-shift. If the session
 * turns out to be dead once back online, the global 401 recovery
 * (`sns:unauthorized`, see src/lib/api.ts + app-root) returns them to the
 * sign-in screen — never a dead end.
 */
const LAST_USER_KEY = 'stocksense.lastUser'

function persistLastUser(user: SessionUser | null) {
  try {
    if (user) localStorage.setItem(LAST_USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(LAST_USER_KEY)
  } catch {
    // localStorage unavailable (private mode…) — optimistic restore is off.
  }
}

function readLastUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionUser
    return parsed && typeof parsed.id === 'number' && typeof parsed.email === 'string' ? parsed : null
  } catch {
    return null
  }
}

interface AuthState {
  user: SessionUser | null
  status: AuthStatus
  /** Restore the session from the sns_session cookie on mount. */
  init: () => Promise<void>
  /** POST /api/auth/login — throws ApiError on 401 (bad credentials). */
  login: (email: string, password: string) => Promise<SessionUser>
  /** POST /api/auth/logout — always ends up signed-out locally. */
  logout: () => Promise<void>
  /** Local-only sign-out used by the global 401 recovery (session died mid-use). */
  expireSession: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  init: async () => {
    try {
      const res = await api.get<{ user: SessionUser | null }>('/api/auth/me')
      persistLastUser(res.user)
      set({ user: res.user, status: res.user ? 'authed' : 'anon' })
    } catch (e) {
      if (e instanceof OfflineError) {
        // API unreachable (offline / airplane-mode simulation / server boot):
        // optimistically keep the last known user signed in rather than
        // bouncing them to the login wall mid-shift. If the cookie session
        // is actually dead, the first online API call fires the global 401
        // recovery and lands on sign-in with a clear toast.
        const last = readLastUser()
        if (last) {
          set({ user: last, status: 'authed' })
          return
        }
      }
      // No known user (or API explicitly said signed-out) → login wall.
      set({ user: null, status: 'anon' })
    }
  },

  login: async (email, password) => {
    const res = await api.post<{ user: SessionUser }>('/api/auth/login', { email, password })
    persistLastUser(res.user)
    set({ user: res.user, status: 'authed' })
    return res.user
  },

  logout: async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // Even if the call fails (e.g. API restarting) sign out locally.
    } finally {
      persistLastUser(null)
      set({ user: null, status: 'anon' })
    }
  },

  expireSession: () => {
    persistLastUser(null)
    set({ user: null, status: 'anon' })
  },
}))
