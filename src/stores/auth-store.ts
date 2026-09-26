'use client'

import { create } from 'zustand'
import { api } from '@/lib/api'
import type { SessionUser } from '@/lib/types'

export type AuthStatus = 'loading' | 'authed' | 'anon'

interface AuthState {
  user: SessionUser | null
  status: AuthStatus
  /** Restore the session from the sns_session cookie on mount. */
  init: () => Promise<void>
  /** POST /api/auth/login — throws ApiError on 401 (bad credentials). */
  login: (email: string, password: string) => Promise<SessionUser>
  /** POST /api/auth/logout — always ends up signed-out locally. */
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  init: async () => {
    try {
      const res = await api.get<{ user: SessionUser | null }>('/api/auth/me')
      set({ user: res.user, status: res.user ? 'authed' : 'anon' })
    } catch {
      // API not reachable / not live yet → treat as signed out.
      set({ user: null, status: 'anon' })
    }
  },

  login: async (email, password) => {
    const res = await api.post<{ user: SessionUser }>('/api/auth/login', { email, password })
    set({ user: res.user, status: 'authed' })
    return res.user
  },

  logout: async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // Even if the call fails (e.g. API restarting) sign out locally.
    } finally {
      set({ user: null, status: 'anon' })
    }
  },
}))
