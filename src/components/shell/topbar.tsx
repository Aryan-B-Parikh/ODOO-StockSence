'use client'

import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { LockKeyhole, Menu, RefreshCw, ScanLine, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useLockStore } from '@/stores/lock-store'
import { useOfflineStore } from '@/stores/offline-store'
import { useScanStore } from '@/stores/scan-store'
import { useUIStore } from '@/stores/ui-store'

import { NAV_BY_VIEW } from './nav'
import { SetPinDialog } from './pin-lock'
import { ScanDialog } from './scan-dialog'
import { SearchCommand } from './search-command'
import { SidebarContent } from './sidebar'

/** Sticky application topbar — view title, global search, refresh, kiosk lock, mobile nav. */
export function Topbar() {
  const view = useUIStore((s) => s.view)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [setPinOpen, setSetPinOpen] = useState(false)
  const queryClient = useQueryClient()
  const fetchingCount = useIsFetching()

  const hasPin = useLockStore((s) => s.hasPin)
  const lock = useLockStore((s) => s.lock)

  // Offline queue (Phase 2) — airplane-mode simulation toggle + queue depth badge.
  const simulatedOffline = useOfflineStore((s) => s.simulatedOffline)
  const queueCount = useOfflineStore((s) => s.queue.length)
  const setSimulatedOffline = useOfflineStore((s) => s.setSimulatedOffline)

  // Scan dialog (Phase 2) — barcode/QR scan input with a manual fallback.
  const openScan = useScanStore((s) => s.openScan)

  const meta = NAV_BY_VIEW[view]

  const refresh = async () => {
    await queryClient.invalidateQueries()
    toast.success('Data refreshed')
  }

  /** Lock now when a PIN exists, otherwise walk through the Set-PIN dialog first. */
  const lockScreen = useCallback(() => {
    if (hasPin) lock()
    else setSetPinOpen(true)
  }, [hasPin, lock])

  // Ctrl/Cmd+L locks the kiosk. preventDefault overrides the browser address-bar
  // shortcut while focus is inside the document (fine for the demo tablet).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        lockScreen()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lockScreen])

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

      {/* Barcode/QR scan input — camera decode + guaranteed manual fallback (also "S") */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="relative size-9 shrink-0"
              onClick={() => openScan()}
              aria-label="Scan barcode / QR code"
            >
              <ScanLine className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Scan barcode / QR (S)</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Airplane-mode simulation toggle — amber when on, amber badge = queued actions */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                'relative size-9 shrink-0',
                simulatedOffline &&
                  'border-amber-500/50 bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300'
              )}
              onClick={() => setSimulatedOffline(!simulatedOffline)}
              aria-label="Simulate offline (airplane mode)"
              aria-pressed={simulatedOffline}
            >
              <WifiOff className="size-4" />
              {queueCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] leading-none font-bold text-amber-950"
                  aria-hidden="true"
                >
                  {queueCount > 9 ? '9+' : queueCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Simulate offline (airplane mode) — queued actions sync on reconnect
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              onClick={lockScreen}
              aria-label="Lock screen (kiosk mode)"
            >
              <LockKeyhole className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Lock screen (kiosk mode) — Ctrl+L</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Button
        variant="outline"
        size="icon"
        className="size-9 shrink-0"
        onClick={() => void refresh()}
        aria-label="Refresh data"
      >
        <RefreshCw className={cn('size-4', fetchingCount > 0 && 'animate-spin')} />
      </Button>

      {/* First-time flow: set a PIN, then the screen locks */}
      <SetPinDialog open={setPinOpen} onOpenChange={setSetPinOpen} onPinSet={lock} />

      {/* Global scan dialog (store-driven — shared with the transfer scan-to-scan fields) */}
      <ScanDialog />

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
