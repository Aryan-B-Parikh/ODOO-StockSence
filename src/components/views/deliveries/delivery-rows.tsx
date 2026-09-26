'use client'

import { motion } from 'framer-motion'
import { PackageOpen, Plus } from 'lucide-react'

import { fadeUp, staggerContainer } from '@/components/views/dashboard/motion'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { timeAgo } from '@/lib/format'
import type { DeliveryDTO } from '@/lib/types'

import { DelCodeChip, EmptyState, StateStepper } from './bits'

/** Loading skeleton for the delivery list. */
export function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading deliveries">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl shimmer" />
      ))}
    </div>
  )
}

/** One tab's worth of delivery rows (with per-tab empty state). */
export function DeliveryRows({
  deliveries,
  tabLabel,
  canCreate,
  onSelect,
  onNew,
}: {
  deliveries: DeliveryDTO[]
  tabLabel: string
  canCreate: boolean
  onSelect: (delivery: DeliveryDTO) => void
  onNew?: () => void
}) {
  if (deliveries.length === 0) {
    const isAll = tabLabel === 'All'
    return (
      <EmptyState
        icon={<PackageOpen className="size-6 text-primary" aria-hidden="true" />}
        title={isAll ? 'No delivery orders yet — create one to reserve stock' : `No ${tabLabel.toLowerCase()} orders right now`}
        hint={
          isAll
            ? 'Creating an order reserves the units immediately — they can never be promised to anyone else.'
            : 'Orders move here automatically as their state changes.'
        }
        action={
          isAll && canCreate && onNew ? (
            <Button size="sm" onClick={onNew}>
              <Plus className="size-4" aria-hidden="true" /> New Delivery
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
        {deliveries.map((delivery) => (
          <DeliveryRow key={delivery.id} delivery={delivery} onSelect={onSelect} />
        ))}
      </motion.ul>
    </div>
  )
}

function DeliveryRow({ delivery, onSelect }: { delivery: DeliveryDTO; onSelect: (d: DeliveryDTO) => void }) {
  const totalQty = delivery.lines.reduce((sum, l) => sum + l.qty, 0)
  return (
    <motion.li variants={fadeUp}>
      <button
        type="button"
        onClick={() => onSelect(delivery)}
        className="flex w-full flex-col gap-2.5 px-4 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:flex-row sm:items-center sm:gap-4"
        aria-label={`Open delivery ${delivery.code} for ${delivery.customer} (${delivery.status.toLowerCase()})`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <DelCodeChip code={delivery.code} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{delivery.customer}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {delivery.lines.length} {delivery.lines.length === 1 ? 'line' : 'lines'} · {totalQty} units
            </span>
          </span>
        </span>
        <StateStepper status={delivery.status} size="sm" />
        <span className="shrink-0 text-xs text-muted-foreground sm:w-16 sm:text-right">{timeAgo(delivery.createdAt)}</span>
      </button>
    </motion.li>
  )
}
