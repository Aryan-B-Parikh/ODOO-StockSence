'use client'

import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { Menu, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'

import { NAV_BY_VIEW } from './nav'
import { SearchCommand } from './search-command'
import { SidebarContent } from './sidebar'

/** Sticky application topbar — view title, global search, refresh, mobile nav. */
export function Topbar() {
  const view = useUIStore((s) => s.view)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const queryClient = useQueryClient()
  const fetchingCount = useIsFetching()

  const meta = NAV_BY_VIEW[view]

  const refresh = async () => {
    await queryClient.invalidateQueries()
    toast.success('Data refreshed')
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="size-9 md:hidden"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2.5">
          <h2 className="truncate text-sm font-semibold md:text-base">{meta?.label ?? 'StockSense'}</h2>
          <p className="hidden truncate text-xs text-muted-foreground lg:block">{meta?.subtitle}</p>
        </div>
      </div>

      <SearchCommand />

      <Button
        variant="outline"
        size="icon"
        className="size-9 shrink-0"
        onClick={() => void refresh()}
        aria-label="Refresh data"
      >
        <RefreshCw className={cn('size-4', fetchingCount > 0 && 'animate-spin')} />
      </Button>

      {/* Mobile navigation */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation menu</SheetTitle>
          </SheetHeader>
          <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  )
}
