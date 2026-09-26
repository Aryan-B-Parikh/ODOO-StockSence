'use client'

import { AppFooter } from './footer'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { ActiveView } from '@/components/views/view-registry'

/**
 * Authenticated application shell.
 * Desktop: sticky sidebar rail (w-60) + main column. Mobile: topbar with a
 * hamburger that opens a Sheet containing the same navigation.
 * Sticky-footer rule: root is min-h-screen flex flex-col, footer has mt-auto.
 */
export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-6 md:py-6">
            <ActiveView />
          </main>
          <AppFooter />
        </div>
      </div>
    </div>
  )
}
