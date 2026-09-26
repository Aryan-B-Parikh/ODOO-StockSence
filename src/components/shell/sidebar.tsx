'use client'

import { LogOut } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ROLE_LABELS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'

import { NAV_SECTIONS, type NavItem } from './nav'

/** Desktop rail — sticky, w-60, hidden on mobile (mobile uses the topbar Sheet). */
export function Sidebar() {
  return (
    <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col border-r bg-sidebar">
      <SidebarContent />
    </aside>
  )
}

/**
 * Sidebar innards — also rendered inside the mobile navigation Sheet.
 * `onNavigate` fires after a nav item is picked (used to close the sheet).
 */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = async () => {
    await logout()
    toast('Signed out', { description: 'Your session has been cleared.' })
  }

  const initials =
    user?.name
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() ?? '··'
  const roleLabel = user ? (ROLE_LABELS[user.role] ?? user.role) : ''

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-base text-primary-foreground">
          📦
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">StockSense</div>
          <div className="text-[10px] text-muted-foreground">Warehouse Intelligence</div>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Primary" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <SidebarLink key={item.key} item={item} onNavigate={onNavigate} />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User card */}
      <div className="shrink-0 border-t p-3">
        <div className="flex items-center gap-2.5">
          <div
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs font-medium">{user?.name ?? 'Signed out'}</div>
            <div className="truncate text-[11px] text-muted-foreground">{roleLabel}</div>
          </div>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                  onClick={() => void handleLogout()}
                  aria-label="Sign out"
                >
                  <LogOut className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Sign out</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  )
}

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const active = view === item.key
  const Icon = item.icon

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          setView(item.key)
          onNavigate?.()
        }}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
          active
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-foreground/70 hover:bg-accent hover:text-foreground'
        )}
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary"
          />
        )}
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{item.label}</span>
      </button>
    </li>
  )
}
