'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Boxes, Plus } from 'lucide-react'

import { fadeUp, staggerContainer } from '@/components/views/dashboard/motion'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { timeAgo } from '@/lib/format'
import type { TransferDTO } from '@/lib/types'

import { EmptyState, TransferStatusBadge, TrfCodeChip, truncateMiddle } from './bits'

/** Loading skeleton for the transfer list. */
export function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading transfers">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl shimmer" />
      ))}
    </div>
  )
}

/** One tab's worth of transfer rows (with per-tab empty state). */
export function TransferRows({
  transfers,
  tabLabel,
  canCreate,
  onSelect,
  onNew,
}: {
  transfers: TransferDTO[]
  tabLabel: string
  canCreate: boolean
  onSelect: (transfer: TransferDTO) => void
  onNew?: () => void
}) {
  if (transfers.length === 0) {
    const isAll = tabLabel === 'All'
    return (
      <EmptyState
        icon={<Boxes className="size-6 text-primary" aria-hidden="true" />}
        title={isAll ? 'No transfers yet — move stock between locations' : `No ${tabLabel.toLowerCase()} transfers right now`}
        hint={
          isAll
            ? 'Shipping moves units from a source location into “in transit” — they only become available at the destination once received.'
            : 'Transfers move here automatically as their state changes.'
        }
        action={
          isAll && canCreate && onNew ? (
            <Button size="sm" onClick={onNew}>
              <Plus className="size-4" aria-hidden="true" /> New Transfer
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
        {transfers.map((transfer) => (
          <TransferRow key={transfer.id} transfer={transfer} onSelect={onSelect} />
        ))}
      </motion.ul>
    </div>
  )
}

function TransferRow({ transfer, onSelect }: { transfer: TransferDTO; onSelect: (t: TransferDTO) => void }) {
  return (
    <motion.li variants={fadeUp}>
      <button
        type="button"
        onClick={() => onSelect(transfer)}
        className="flex w-full flex-col gap-2.5 px-4 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:flex-row sm:items-center sm:gap-4"
        aria-label={`Open transfer ${transfer.code} from ${transfer.fromLocationPath} to ${transfer.toLocationPath} (${transfer.status.toLowerCase()})`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <TrfCodeChip code={transfer.code} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <span className="truncate" title={transfer.fromLocationPath}>
                {truncateMiddle(transfer.fromLocationPath)}
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate" title={transfer.toLocationPath}>
                {truncateMiddle(transfer.toLocationPath)}
              </span>
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {transfer.lines.length} {transfer.lines.length === 1 ? 'line' : 'lines'} · shipped {timeAgo(transfer.shippedAt)}
            </span>
          </span>
        </span>
        <TransferStatusBadge status={transfer.status} />
        <span className="shrink-0 text-xs text-muted-foreground sm:w-16 sm:text-right">
          {transfer.receivedAt ? `received ${timeAgo(transfer.receivedAt)}` : timeAgo(transfer.shippedAt)}
        </span>
      </button>
    </motion.li>
  )
}
