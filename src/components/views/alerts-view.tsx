'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronRight, ScrollText, Siren } from 'lucide-react'

import { PageHeader } from '@/components/shell/page-header'
import { fadeUp, staggerContainer } from '@/components/views/dashboard/motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { AttentionDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { ViewKey } from '@/stores/ui-store'
import { useUIStore } from '@/stores/ui-store'

import { AttentionList } from './alerts/attention-list'
import { FlagCard, FlagsEmptyState } from './alerts/flag-card'

type Summary = AttentionDTO['summary']

/** summary chip definition — emoji + tone + the view it navigates to. */
const SUMMARY_CHIPS: {
  key: keyof Summary
  label: string
  emoji: string
  tone: 'red' | 'amber' | 'emerald'
  view: ViewKey
}[] = [
  { key: 'stockouts', label: 'Stockouts', emoji: '🔴', tone: 'red', view: 'reorder' },
  { key: 'belowReorder', label: 'Below reorder', emoji: '🔴', tone: 'red', view: 'reorder' },
  { key: 'pendingApprovalAdjustments', label: 'Pending approvals', emoji: '🟠', tone: 'amber', view: 'adjustments' },
  { key: 'openFlags', label: 'Open flags', emoji: '🟠', tone: 'amber', view: 'alerts' },
  { key: 'delayedReceipts', label: 'Delayed receipts', emoji: '🟠', tone: 'amber', view: 'receipts' },
  { key: 'pendingSuggestions', label: 'Reorder suggestions', emoji: '🟢', tone: 'emerald', view: 'reorder' },
]

const TONE_STYLES: Record<'red' | 'amber' | 'emerald', string> = {
  red: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
}

/**
 * Alerts & Review — severity-ranked exceptions. Section 1: review flags
 * raised by the engine (mark reviewed). Section 2: the Needs Attention
 * action list, identical to the dashboard panel.
 */
export function AlertsView() {
  const setView = useUIStore((s) => s.setView)

  const query = useQuery({
    queryKey: ['attention'],
    queryFn: () => api.get<AttentionDTO>('/api/attention'),
    refetchInterval: 30_000,
  })

  const summary = query.data?.summary
  const flags = query.data?.flags ?? []
  const openFlagCount = flags.filter((f) => f.status === 'OPEN').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts & Review"
        subtitle="Severity-ranked exceptions — unusual adjustment activity, review flags and what needs attention"
        icon={<Siren className="size-5" />}
      />

      {/* Summary chips */}
      {query.isPending && (
        <div className="flex flex-wrap gap-2" aria-busy="true" aria-label="Loading alert summary">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-36 rounded-full" />
          ))}
        </div>
      )}

      {summary && (
        <motion.nav
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="flex flex-wrap items-center gap-2"
          aria-label="Alert summary"
        >
          {SUMMARY_CHIPS.map((chip) => {
            const value = summary[chip.key]
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setView(chip.view)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  value > 0
                    ? cn(TONE_STYLES[chip.tone], 'hover:brightness-95 dark:hover:brightness-110')
                    : 'border-dashed text-muted-foreground hover:bg-accent/50'
                )}
              >
                <span aria-hidden="true">{chip.emoji}</span>
                <span className="font-semibold tabular">{value}</span>
                {chip.label}
                <ChevronRight className="size-3 opacity-60" aria-hidden="true" />
              </button>
            )
          })}
        </motion.nav>
      )}

      {query.isError && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="font-semibold">Alerts unavailable</p>
            <p className="text-sm text-muted-foreground">
              {query.error instanceof Error ? query.error.message : 'Could not load alerts.'}
            </p>
            <button
              type="button"
              className="text-sm text-primary underline-offset-4 hover:underline"
              onClick={() => void query.refetch()}
            >
              Retry
            </button>
          </CardContent>
        </Card>
      )}

      {query.isSuccess && query.data && (
        <>
          {/* Section 1 — review flags */}
          <motion.section variants={fadeUp} initial="hidden" animate="visible" aria-label="Review flags">
            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ScrollText className="size-4 text-primary" aria-hidden="true" />
                  Review flags
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                      openFlagCount > 0
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    )}
                  >
                    {openFlagCount} open
                  </span>
                </CardTitle>
                <CardDescription>
                  Exceptions the engine raised while posting adjustments — mark them reviewed once you&apos;ve
                  looked into the referenced document
                </CardDescription>
              </CardHeader>
              <CardContent>
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="grid gap-3 lg:grid-cols-2"
                >
                  {flags.length === 0 ? (
                    <FlagsEmptyState />
                  ) : (
                    flags.map((flag) => <FlagCard key={flag.id} flag={flag} />)
                  )}
                </motion.div>
              </CardContent>
            </Card>
          </motion.section>

          {/* Section 2 — needs attention */}
          <motion.section variants={fadeUp} initial="hidden" animate="visible" aria-label="Needs attention">
            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Siren className="size-4 text-primary" aria-hidden="true" />
                  Needs Attention
                </CardTitle>
                <CardDescription>Ranked by severity — click an item to jump to its view and act</CardDescription>
              </CardHeader>
              <CardContent>
                <AttentionList attention={query.data} />
              </CardContent>
            </Card>
          </motion.section>
        </>
      )}
    </div>
  )
}
