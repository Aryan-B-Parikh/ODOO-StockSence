'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { ActiveView } from '@/components/views/view-registry'
import { useOfflineAutoReplay } from '@/lib/offline-replay'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useLockStore } from '@/stores/lock-store'
import { useOfflineStore } from '@/stores/offline-store'
import { cn } from '@/lib/utils'
import type { ProductListDTO } from '@/lib/types'

import { AppFooter } from './footer'
import { OfflineBanner } from './offline-banner'
import { PinLockGate } from './pin-lock'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

/**
 * Authenticated application shell.
 * Desktop: sticky sidebar rail (w-60) + main column. Mobile: topbar with a
 * hamburger that opens a Sheet containing the same navigation.
 * Sticky-footer rule: root is min-h-screen flex flex-col, footer has mt-auto.
 *
 * `app-chrome` marks everything that hides when printing a count sheet
 * (see src/styles/print.css) — the sheet itself is portaled to <body>.
 */
export function AppShell() {
  const user = useAuthStore((s) => s.user)
  const locked = useLockStore((s) => s.locked)
  const initLock = useLockStore((s) => s.initLock)

  // Hydrate per-user kiosk-lock state (localStorage: stocksense.lock.<userId>).
  // Re-runs on login/user switch — a fresh user can never inherit a lock.
  useEffect(() => {
    if (user) initLock(user.id)
  }, [user, initLock])

  // Freeze background scrolling while the lock gate covers the screen.
  useEffect(() => {
    document.body.classList.toggle('overflow-hidden', locked)
    return () => document.body.classList.remove('overflow-hidden')
  }, [locked])

  // Offline queue (Phase 2): hydrate the persisted queue on mount + install
  // the auto-replay triggers (window 'online' event + 30s interval while the
  // queue is non-empty). The banner renders under the topbar in normal flow.
  const initOffline = useOfflineStore((s) => s.initOffline)
  useEffect(() => {
    initOffline()
  }, [initOffline])
  useOfflineAutoReplay()

  // Offline cache warmer: dialogs (new adjustment, new receipt, …) query the
  // bare ['products'] / ['meta'] keys, which differ from the view-level keys
  // (['products', search, category]). Prefetch them once per session while
  // online so those dialogs keep their dropdown data when the device is
  // offline (airplane mode) — TanStack then serves the cached copy.
  const queryClient = useQueryClient()
  const simulatedOffline = useOfflineStore((s) => s.simulatedOffline)
  useEffect(() => {
    if (simulatedOffline) return
    void queryClient.prefetchQuery({
      queryKey: ['products'],
      queryFn: () => api.get<ProductListDTO>('/api/products'),
    })
  }, [queryClient, simulatedOffline])

  return (
    <div className={cn('app-chrome flex min-h-screen flex-col bg-background')}>
      <div className="flex flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <OfflineBanner />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-6 md:py-6">
            <ActiveView />
          </main>
          <AppFooter />
        </div>
      </div>
      {locked && <PinLockGate />}
    </div>
  )
}
