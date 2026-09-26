'use client'

import { ChevronRight, PartyPopper } from 'lucide-react'

import type { AttentionDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { ViewKey } from '@/stores/ui-store'
import { useUIStore } from '@/stores/ui-store'

const SEVERITY_ORDER: Record<AttentionDTO['items'][number]['severity'], number> = {
  red: 0,
  orange: 1,
  green: 2,
}

const SEVERITY_CIRCLE: Record<string, string> = {
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}

/**
 * Needs Attention — the Phase 4 action list (same style as the dashboard
 * panel): severity-ranked items, each click navigates to its view.
 */
export function AttentionList({ attention }: { attention: AttentionDTO }) {
  const setView = useUIStore((s) => s.setView)
  const items = [...attention.items].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  )

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
        <PartyPopper className="size-6 text-emerald-600" aria-hidden="true" />
        <p className="text-sm font-medium">Nothing needs attention — all clear 🎉</p>
        <p className="text-xs text-muted-foreground">
          Stock levels, approvals, receipts and counts are all in a healthy state.
        </p>
      </div>
    )
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.key} className="min-w-0">
          <button
            type="button"
            onClick={() => setView(item.href as ViewKey)}
            className="group flex w-full items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/50"
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-sm',
                SEVERITY_CIRCLE[item.severity] ?? SEVERITY_CIRCLE.green
              )}
            >
              {item.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.title}</span>
              <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">
                {item.detail}
              </span>
            </span>
            <ChevronRight
              className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </button>
        </li>
      ))}
    </ul>
  )
}
