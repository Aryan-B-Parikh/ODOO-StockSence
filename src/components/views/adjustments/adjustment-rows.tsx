'use client'

import { motion } from 'framer-motion'
import { ClipboardPen, Plus } from 'lucide-react'

import { fadeUp, staggerContainer } from '@/components/views/dashboard/motion'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { timeAgo } from '@/lib/format'
import type { AdjustmentDTO } from '@/lib/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { AdjCodeChip, AdjStatusBadge, EmptyState, SeverityBadge } from './bits'

/** Loading skeleton for the adjustment list. */
export function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading adjustments">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl shimmer" />
      ))}
    </div>
  )
}

/** One tab's worth of adjustment rows (with per-tab empty state). */
export function AdjustmentRows({
  adjustments,
  tabLabel,
  canCreate,
  onSelect,
  onNew,
}: {
  adjustments: AdjustmentDTO[]
  tabLabel: string
  canCreate: boolean
  onSelect: (adjustment: AdjustmentDTO) => void
  onNew?: () => void
}) {
  if (adjustments.length === 0) {
    const isAll = tabLabel === 'All'
    return (
      <EmptyState
        icon={<ClipboardPen className="size-6 text-primary" aria-hidden="true" />}
        title={isAll ? 'No adjustments yet — log one when a count finds a mismatch' : `Nothing ${tabLabel.toLowerCase()} right now`}
        hint={
          isAll
            ? 'Small mismatches post automatically; anything over 15% of stock is held for manager approval.'
            : 'Adjustments move here as they are created, approved or rejected.'
        }
        action={
          isAll && canCreate && onNew ? (
            <Button size="sm" onClick={onNew}>
              <Plus className="size-4" aria-hidden="true" /> New Adjustment
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <motion.ul
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="max-h-[70vh] divide-y overflow-y-auto"
      >
        {adjustments.map((adj) => (
          <AdjustmentRow key={adj.id} adj={adj} onSelect={onSelect} />
        ))}
      </motion.ul>
    </div>
  )
}

function AdjustmentRow({ adj, onSelect }: { adj: AdjustmentDTO; onSelect: (a: AdjustmentDTO) => void }) {
  return (
    <motion.li variants={fadeUp}>
      <button
        type="button"
        onClick={() => onSelect(adj)}
        className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] md:flex-row md:items-center md:gap-3"
        aria-label={`Open adjustment ${adj.code}: ${adj.reason}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <AdjCodeChip code={adj.code} />
          <span className="min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block max-w-72 truncate text-sm font-medium">{adj.reason}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-72 text-balance">
                {adj.reason}
              </TooltipContent>
            </Tooltip>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {adj.createdByName ?? 'Unknown'} · {adj.lines.length} {adj.lines.length === 1 ? 'line' : 'lines'} ·{' '}
              {timeAgo(adj.createdAt)}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5 md:gap-2">
          <SeverityBadge severity={adj.severity} />
          <AdjStatusBadge status={adj.status} />
        </span>
      </button>
    </motion.li>
  )
}
