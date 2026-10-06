'use client'

import { useState } from 'react'
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  ChevronRight,
  ClipboardCheck,
  LayoutDashboard,
  LockKeyhole,
  MoreHorizontal,
  Package,
  ScanLine,
  ScrollText,
  ShoppingCart,
  Siren,
  SlidersHorizontal,
  Truck,
  Users,
  Moon,
  Sun,
} from 'lucide-react'
import { useTheme } from 'next-themes'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useLockStore } from '@/stores/lock-store'
import { useScanStore } from '@/stores/scan-store'
import { useUIStore, type ViewKey } from '@/stores/ui-store'
import { canAccessView } from './nav'

const OPS_VIEWS: { key: ViewKey; label: string; desc: string; icon: typeof Truck; color: string }[] = [
  { key: 'receipts', label: 'Inbound Receipts', desc: 'Expected & received deliveries', icon: Truck, color: 'text-amber-500 bg-amber-500/10' },
  { key: 'deliveries', label: 'Outbound Deliveries', desc: 'Pick, pack & dispatch orders', icon: ClipboardCheck, color: 'text-emerald-500 bg-emerald-500/10' },
  { key: 'transfers', label: 'Internal Transfers', desc: 'Relocate stock between racks/bins', icon: ArrowLeftRight, color: 'text-teal-500 bg-teal-500/10' },
  { key: 'adjustments', label: 'Stock Adjustments', desc: 'Reconcile counts with audit trail', icon: SlidersHorizontal, color: 'text-orange-500 bg-orange-500/10' },
  { key: 'counts', label: 'Cycle Counts', desc: 'Scheduled & blind inventory counts', icon: ScanLine, color: 'text-cyan-500 bg-cyan-500/10' },
]

const MORE_VIEWS: { key: ViewKey; label: string; desc: string; icon: typeof Siren; color: string }[] = [
  { key: 'alerts', label: 'Alerts & Review Flags', desc: 'Anomaly flags & items needing attention', icon: Siren, color: 'text-rose-500 bg-rose-500/10' },
  { key: 'reorder', label: 'Reorder Intelligence', desc: 'AI & rule-based replenishment suggestions', icon: ShoppingCart, color: 'text-emerald-500 bg-emerald-500/10' },
  { key: 'suppliers', label: 'Suppliers Directory', desc: 'Lead times, minimums & vendor metrics', icon: Building2, color: 'text-stone-400 bg-stone-500/10' },
  { key: 'history', label: 'Movement Ledger', desc: 'Immutable audit trail of every stock change', icon: ScrollText, color: 'text-indigo-400 bg-indigo-500/10' },
  { key: 'users', label: 'Team & Accounts', desc: 'Owner staff & manager provisioning', icon: Users, color: 'text-purple-400 bg-purple-500/10' },
]

function triggerHaptic() {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(12)
    } catch {
      // Ignore vibration error in non-supported environments
    }
  }
}

export function MobileBottomNav() {
  const currentView = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const openScan = useScanStore((s) => s.openScan)
  const lock = useLockStore((s) => s.lock)
  const hasPin = useLockStore((s) => s.hasPin)

  const [opsOpen, setOpsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  const user = useAuthStore((s) => s.user)
  const visibleOpsViews = OPS_VIEWS.filter((v) => canAccessView(user ?? undefined, v.key))
  const visibleMoreViews = MORE_VIEWS.filter((v) => canAccessView(user ?? undefined, v.key))

  const isOpsActive = visibleOpsViews.some((v) => v.key === currentView)
  const isMoreActive = visibleMoreViews.some((v) => v.key === currentView)

  const handleSelect = (key: ViewKey) => {
    triggerHaptic()
    setView(key)
    setOpsOpen(false)
    setMoreOpen(false)
  }

  const handleScan = () => {
    triggerHaptic()
    openScan()
  }

  return (
    <>
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 block border-t border-border/70 bg-background/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom,10px)] md:hidden shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
      >
        <div className="grid h-16 grid-cols-5 items-center px-1">
          {/* 1. Dashboard */}
          <button
            type="button"
            onClick={() => handleSelect('dashboard')}
            aria-current={currentView === 'dashboard' ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-1.5 transition-colors',
              currentView === 'dashboard'
                ? 'text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <div className={cn('relative rounded-xl p-1', currentView === 'dashboard' && 'bg-primary/10')}>
              <LayoutDashboard className="size-5" />
            </div>
            <span className="text-[11px] leading-none">Home</span>
          </button>

          {/* 2. Operations Sheet trigger */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic()
              setOpsOpen(true)
            }}
            aria-current={isOpsActive ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-1.5 transition-colors',
              isOpsActive ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <div className={cn('relative rounded-xl p-1', isOpsActive && 'bg-primary/10')}>
              <Boxes className="size-5" />
              {isOpsActive && (
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-background" />
              )}
            </div>
            <span className="text-[11px] leading-none">Ops</span>
          </button>

          {/* 3. Center Scanner Button (Elevated) */}
          <div className="flex flex-col items-center justify-center">
            <button
              type="button"
              onClick={handleScan}
              className="group relative -top-3.5 flex size-13 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-700 to-teal-600 text-white shadow-lg shadow-emerald-500/35 transition-transform active:scale-95"
              aria-label="Scan barcode or QR code"
            >
              <ScanLine className="size-6 stroke-[2.2] transition-transform group-hover:scale-110" />
              <span className="absolute inset-0 rounded-2xl ring-2 ring-white/25" />
            </button>
            <span className="-mt-2.5 text-[10px] font-semibold text-primary">
              SCAN
            </span>
          </div>

          {/* 4. Products Inventory */}
          <button
            type="button"
            onClick={() => handleSelect('products')}
            aria-current={currentView === 'products' ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-1.5 transition-colors',
              currentView === 'products'
                ? 'text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <div className={cn('relative rounded-xl p-1', currentView === 'products' && 'bg-primary/10')}>
              <Package className="size-5" />
            </div>
            <span className="text-[11px] leading-none">Stock</span>
          </button>

          {/* 5. More Actions */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic()
              setMoreOpen(true)
            }}
            aria-current={isMoreActive ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-1.5 transition-colors',
              isMoreActive ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <div className={cn('relative rounded-xl p-1', isMoreActive && 'bg-primary/10')}>
              <MoreHorizontal className="size-5" />
              {isMoreActive && (
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-background" />
              )}
            </div>
            <span className="text-[11px] leading-none">More</span>
          </button>
        </div>
      </nav>

      {/* Operations Bottom Sheet */}
      <Sheet open={opsOpen} onOpenChange={setOpsOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl border-t border-border/80 px-4 pb-8 pt-5">
          <SheetHeader className="pb-3 text-left">
            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
            <SheetTitle className="text-base font-semibold">Warehouse Operations</SheetTitle>
          </SheetHeader>
          <div className="grid gap-2">
            {visibleOpsViews.map((item) => {
              const Icon = item.icon
              const active = currentView === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelect(item.key)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-colors',
                    active
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border/60 bg-card/60 hover:bg-muted/50 text-foreground'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('flex size-10 items-center justify-center rounded-xl', item.color)}>
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-snug">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground/60" />
                </button>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* More / Intelligence Bottom Sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl border-t border-border/80 px-4 pb-8 pt-5">
          <SheetHeader className="pb-3 text-left">
            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/20" />
            <SheetTitle className="text-base font-semibold">Intelligence & Management</SheetTitle>
          </SheetHeader>
          <div className="grid gap-2">
            {visibleMoreViews.map((item) => {
              const Icon = item.icon
              const active = currentView === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelect(item.key)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-colors',
                    active
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border/60 bg-card/60 hover:bg-muted/50 text-foreground'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('flex size-10 items-center justify-center rounded-xl', item.color)}>
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-snug">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground/60" />
                </button>
              )
            })}

            {/* Kiosk Lock & Theme Controls */}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic()
                  setMoreOpen(false)
                  if (hasPin) lock()
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/60 p-3 text-xs font-medium hover:bg-muted/50"
              >
                <LockKeyhole className="size-4 text-amber-500" />
                <span>Kiosk Lock</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic()
                  setTheme(theme === 'dark' ? 'light' : 'dark')
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/60 p-3 text-xs font-medium hover:bg-muted/50"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="size-4 text-amber-400" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="size-4 text-slate-400" />
                    <span>Dark Mode</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
