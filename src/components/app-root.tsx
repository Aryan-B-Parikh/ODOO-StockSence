'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { LoginView } from '@/components/auth/login-view'
import { AppShell } from '@/components/shell/app-shell'
import { useAuthStore } from '@/stores/auth-store'
import { initUiHashSync } from '@/stores/ui-store'

/**
 * Auth gate — the single client-side entry point of StockSense.
 * loading → boot skeleton · anon → LoginView · authed → AppShell.
 *
 * Also wires the global session-expiry recovery: any API 401 (outside the
 * login endpoint) dispatches `sns:unauthorized` (see src/lib/api.ts) — here
 * we reset the auth state and return the user to the sign-in screen with a
 * clear toast, so a wiped/expired session never strands them in error cards.
 */
export function AppRoot() {
  const status = useAuthStore((s) => s.status)
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    void init()
    return initUiHashSync()
  }, [init])

  useEffect(() => {
    const onUnauthorized = () => {
      const { user, expireSession } = useAuthStore.getState()
      // Only act once per expiry — parallel failing queries each fire the event.
      if (!user) return
      expireSession()
      toast.error('Session expired', {
        description: 'Your session is no longer valid — please sign in again.',
      })
    }
    window.addEventListener('sns:unauthorized', onUnauthorized)
    return () => window.removeEventListener('sns:unauthorized', onUnauthorized)
  }, [])

  if (status === 'loading') return <BootScreen />
  if (status === 'anon') return <LoginView />
  return <AppShell />
}

function BootScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center">
      <div className="text-5xl" aria-hidden="true">
        📦
      </div>
      <div className="text-lg font-semibold tracking-tight">StockSense</div>
      <p className="animate-pulse text-xs text-muted-foreground">checking session…</p>
    </main>
  )
}
