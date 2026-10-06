'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { ActiveView } from '@/components/views/view-registry'
import { useOfflineAutoReplay } from '@/lib/offline-replay'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useLockStore } from '@/stores/lock-store'
import { useOfflineStore } from '@/stores/offline-store'
import { useUIStore, type ViewKey } from '@/stores/ui-store'
import { cn } from '@/lib/utils'
import type { ProductListDTO } from '@/lib/types'

import { AppFooter } from './footer'
import { NAV_BY_VIEW, canAccessView } from './nav'
import { MobileBottomNav } from './mobile-bottom-nav'
import { MobileInstallBanner } from './mobile-install-banner'
import { OfflineBanner } from './offline-banner'
import { PinLockGate } from './pin-lock'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

/** Mirrors `metadata.title` in src/app/layout.tsx (client code cannot import it). */
const DEFAULT_TITLE = 'StockSense — Warehouse Inventory Intelligence'

/**
 * Selector already used by scan-dialog.tsx — Radix marks an open Dialog /
 * AlertDialog with `data-state="open"` on its content element.
 */
const OPEN_MODAL_SELECTOR = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

/**
 * Authenticated application shell.
 * Desktop: sticky sidebar rail (w-60) + main column.
 * Mobile: topbar + mobile bottom tab bar (Home, Ops, elevated Scan, Stock, More).
 * Sticky-footer rule: root is min-h-screen flex flex-col, footer has mt-auto.
 *
 * `app-chrome` marks everything that hides when printing a count sheet
 * (see src/styles/print.css) — the sheet itself is portaled to <body>.
 *
 * ACCESSIBILITY — this is a hash-view SPA (`#view=<key>`), not a router app, so
 * none of the usual route-transition hooks fire. The three things a router would
 * normally do for us — move focus to the new page, update the document title,
 * announce the change — are therefore done here, in an effect keyed on `view`.
 */
export function AppShell() {
  const user = useAuthStore((s) => s.user)
  const locked = useLockStore((s) => s.locked)
  const initLock = useLockStore((s) => s.initLock)
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)

  // Guard restricted views: if user lacks permission for the active view, redirect to dashboard.
  useEffect(() => {
    if (!user) return
    if (!canAccessView(user, view)) {
      toast.error('Access restricted', {
        description: `Your role (${user.role}) does not have permission to access ${NAV_BY_VIEW[view]?.label ?? view}.`,
      })
      setView('dashboard')
    }
  }, [user, view, setView])

  const mainRef = useRef<HTMLElement>(null)
  const prevView = useRef<ViewKey | null>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)

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

  /**
   * Navigation side effects. Deliberately skipped when:
   *  - it is the first run of the effect (moving focus on mount would steal it
   *    from whatever a keyboard user tabs to first), or
   *  - a Radix modal already owns focus. `openProduct()` switches to the
   *    Products view *and* opens the detail dialog in one store update (used by
   *    the search command and the scan dialog), so `main` must not yank focus
   *    out of the dialog that just opened.
   * Restoring the default title on unmount keeps the login page from being
   * labelled with the last visited view after sign-out.
   */
  useEffect(() => {
    const label = NAV_BY_VIEW[view]?.label ?? 'Dashboard'
    document.title = `${label} — StockSense`

    if (prevView.current === null || prevView.current === view) {
      prevView.current = view
      return
    }
    prevView.current = view

    const active = document.activeElement
    const inModal = active instanceof Element && active.closest(OPEN_MODAL_SELECTOR) !== null
    if (inModal || document.querySelector(OPEN_MODAL_SELECTOR)) return

    mainRef.current?.focus()
    // Written straight to the DOM rather than through state: the live region
    // is a persistent node, and assistive tech announces *mutations* to it —
    // updating React state here would be a redundant re-render for text that
    // has no visual representation anyway.
    if (statusRef.current) statusRef.current.textContent = `Navigated to ${label}`
  }, [view])

  useEffect(() => {
    return () => {
      document.title = DEFAULT_TITLE
    }
  }, [])

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
      {/*
        Skip link — first focusable element in the shell. Positioned off-screen
        rather than `sr-only` + `focus:not-sr-only`, because both utilities set
        `position` and which one wins depends on Tailwind's internal sort order.
      */}
      <a
        href="#main-content"
        className="fixed -top-24 left-3 z-[100] rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg ring-2 ring-ring transition-[top] motion-reduce:transition-none hover:underline focus:top-3 focus:outline-none"
        onClick={(e) => {
          e.preventDefault() // keep `#view=<key>` intact for deep links
          const main = mainRef.current
          if (!main) return
          main.focus()
          main.scrollIntoView({ block: 'start' })
        }}
      >
        Skip to main content
      </a>

      {/*
        Route-change announcement. Left empty in JSX on purpose: React must not
        manage its children, or it would wipe the text on the next re-render.
        The node exists in the DOM *before* the text changes or assistive tech
        will not observe the mutation.
      */}
      <p ref={statusRef} role="status" aria-live="polite" className="sr-only" />

      <div className="flex flex-1">
        <Sidebar />
        <div className="bottom-nav-space flex min-w-0 flex-1 flex-col">
          <Topbar />
          <MobileInstallBanner />
          <OfflineBanner />
          <main
            id="main-content"
            ref={mainRef}
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-8 outline-none md:px-6 md:py-6"
          >
            <ActiveView />
          </main>
          <AppFooter />
          <MobileBottomNav />
        </div>
      </div>
      {locked && <PinLockGate />}
    </div>
  )
}
