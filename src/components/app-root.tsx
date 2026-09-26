'use client'

import { useEffect } from 'react'
import { LoginView } from '@/components/auth/login-view'
import { AppShell } from '@/components/shell/app-shell'
import { useAuthStore } from '@/stores/auth-store'
import { initUiHashSync } from '@/stores/ui-store'

/**
 * Auth gate — the single client-side entry point of StockSense.
 * loading → boot skeleton · anon → LoginView · authed → AppShell.
 */
export function AppRoot() {
  const status = useAuthStore((s) => s.status)
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    void init()
    return initUiHashSync()
  }, [init])

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
