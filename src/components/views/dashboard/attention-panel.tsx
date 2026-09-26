'use client'

import { motion } from 'framer-motion'
import { ChevronRight, PartyPopper, Siren } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AttentionDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { ViewKey } from '@/stores/ui-store'
import { useUIStore } from '@/stores/ui-store'

import { fadeUp } from './motion'

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

/** Severity-tinted left rail + hover wash for attention items. */
const SEVERITY_RAIL: Record<string, string> = {
  red: 'before:bg-red-500/70 hover:border-red-500/30 hover:bg-red-500/[0.04] dark:hover:bg-red-500/[0.06]',
  orange: 'before:bg-orange-500/70 hover:border-orange-500/30 hover:bg-orange-500/[0.04] dark:hover:bg-orange-500/[0.06]',
  green: 'before:bg-emerald-500/70 hover:border-emerald-500/30 hover:bg-emerald-500/[0.04] dark:hover:bg-emerald-500/[0.06]',
}

/** Phase 4 action list — severity-ranked items, each links to its view. */
export function AttentionPanel({ attention }: { attention: AttentionDTO }) {
  const setView = useUIStore((s) => s.setView)
  const items = [...attention.items].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  const hasRed = items.some((i) => i.severity === 'red')
  const hasOrange = items.some((i) => i.severity === 'orange')
  const badgeClass = hasRed
    ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
    : hasOrange
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'

  return (
    <motion.section variants={fadeUp} initial="hidden" animate="visible" aria-label="Needs attention">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Siren className="size-4 text-primary" aria-hidden="true" />
            Needs Attention
          </CardTitle>
          <CardDescription>Ranked by severity — click an item to jump to its view and act</CardDescription>
          <CardAction>
            <Badge variant="outline" className={badgeClass}>
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
              <PartyPopper className="size-6 text-emerald-600" aria-hidden="true" />
              <p className="text-sm font-medium">All clear — nothing needs attention 🎉</p>
              <p className="text-xs text-muted-foreground">
                Stock levels, approvals, receipts and counts are all in a healthy state.
              </p>
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <li key={item.key} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setView(item.href as ViewKey)}
                    className={cn(
                      'group relative flex w-full items-start gap-3 overflow-hidden rounded-lg border bg-card p-3 pl-4 text-left transition-all before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:content-[""] hover:shadow-sm',
                      SEVERITY_RAIL[item.severity] ?? SEVERITY_RAIL.green
                    )}
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
          )}
        </CardContent>
      </Card>
    </motion.section>
  )
}
