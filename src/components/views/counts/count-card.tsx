'use client'

import { motion } from 'framer-motion'
import { CalendarClock, CheckCircle2, MapPin, Package, ScanLine } from 'lucide-react'

import { fadeUp } from '@/components/views/dashboard/motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { deltaColor, fmtDate, fmtSignedQty, timeAgo } from '@/lib/format'
import type { CycleCountDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

/** cadence → chip color (mirrors value class: HIGH weekly / MEDIUM monthly / LOW quarterly). */
const CADENCE_STYLES: Record<string, string> = {
  WEEKLY: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  MONTHLY: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  QUARTERLY: 'border-stone-500/30 bg-stone-500/10 text-stone-600 dark:text-stone-300',
}

/** One cycle-count card (used in every tab — content adapts to status). */
export function CountCard({
  count,
  canCount,
  onOpen,
}: {
  count: CycleCountDTO
  canCount: boolean
  onOpen: () => void
}) {
  const isCompleted = count.status === 'COMPLETED'
  const isCancelled = count.status === 'CANCELLED'
  const isClean = isCompleted && (count.totalVariance ?? 0) === 0

  return (
    <motion.div variants={fadeUp}>
      <Card className={cn('gap-3', isCancelled && 'opacity-75')}>
        <CardHeader className="gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="font-mono text-sm">{count.code}</CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn('cursor-help shrink-0', CADENCE_STYLES[count.cadence] ?? CADENCE_STYLES.QUARTERLY)}
                >
                  {count.cadence}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Cadence from value class — HIGH → weekly · MEDIUM → monthly · LOW → quarterly</TooltipContent>
            </Tooltip>
          </div>

          {/* Scope target */}
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {count.scope === 'LOCATION' ? (
              <MapPin className="size-3.5 shrink-0 text-teal-600" aria-hidden="true" />
            ) : (
              <Package className="size-3.5 shrink-0 text-teal-600" aria-hidden="true" />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help truncate font-mono">
                  {count.scope === 'LOCATION' ? count.locationPath : count.productSku}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {count.scope === 'LOCATION'
                  ? `${count.locationPath} — every product on this shelf`
                  : `${count.productSku} — ${count.productName}`}
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden="true" />
              Due {fmtDate(count.dueDate)}
            </span>
            {count.status === 'OPEN' && count.daysOverdue > 0 && (
              <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400">
                overdue {count.daysOverdue}d
              </Badge>
            )}
            <span>
              {count.lines.length} {count.lines.length === 1 ? 'line' : 'lines'}
            </span>
          </div>

          {isCompleted ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {isClean ? (
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" aria-hidden="true" /> Clean
                </Badge>
              ) : (
                <span className={cn('text-xs font-semibold tabular', deltaColor(count.totalVariance))}>
                  Variance {fmtSignedQty(count.totalVariance)}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">
                Completed {count.completedAt ? timeAgo(count.completedAt) : '—'}
              </span>
            </div>
          ) : (
            <p className={cn('line-clamp-2 text-xs text-muted-foreground', !count.note && 'italic')}>
              {isCancelled ? (count.note ?? 'Cancelled') : (count.note ?? 'No note')}
            </p>
          )}

          {count.adjustmentCodes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Adjustments:</span>
              {count.adjustmentCodes.map((code) => (
                <span
                  key={code}
                  className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-700 dark:text-amber-400"
                >
                  {code}
                </span>
              ))}
            </div>
          )}

          {count.status === 'OPEN' && canCount && (
            <Button size="sm" className="w-full" onClick={onOpen}>
              <ScanLine className="size-3.5" aria-hidden="true" />
              Start count
            </Button>
          )}
          {count.status === 'OPEN' && !canCount && (
            <p className="text-[11px] text-muted-foreground">Requires the “count” permission to perform.</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

/** Empty state for a tab with no counts. */
export function CountsEmptyState({ status }: { status: string }) {
  return (
    <div className="col-span-full flex flex-col items-center gap-1.5 rounded-xl border border-dashed py-12 text-center">
      <ScanLine className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">No {status.toLowerCase()} counts</p>
      <p className="text-xs text-muted-foreground">
        {status === 'OPEN'
          ? 'Counts awaiting a physical tally appear here — create one or wait for the schedule.'
          : status === 'COMPLETED'
            ? 'Completed counts and their variances land here.'
            : 'Cancelled counts are kept for the record.'}
      </p>
    </div>
  )
}
