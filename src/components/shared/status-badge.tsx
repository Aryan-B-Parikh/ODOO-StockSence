'use client'

import { cn } from '@/lib/utils'
import { titleCase } from '@/lib/format'

interface StatusStyle {
  className: string
  /** Show a pulsing dot (live/awaiting states). */
  pulse?: boolean
}

/**
 * status → color. Covers every document status in the app:
 * receipts (EXPECTED/RECEIVED/CANCELLED), deliveries (RESERVED/PICKED/PACKED/
 * DELIVERED), transfers (IN_TRANSIT), adjustments (PENDING_APPROVAL/POSTED/
 * REJECTED), counts (OPEN/COMPLETED), reorder suggestions (PENDING/ACCEPTED/
 * DISMISSED), flags (REVIEWED) and product stock status (OK/BELOW_REORDER/
 * STOCKOUT).
 */
const STATUS_STYLES: Record<string, StatusStyle> = {
  // Receipts
  EXPECTED: { className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400', pulse: true },
  RECEIVED: { className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  CANCELLED: { className: 'border-stone-500/30 bg-stone-500/10 text-stone-600 dark:text-stone-300' },
  // Deliveries
  RESERVED: { className: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400' },
  PICKED: { className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  PACKED: { className: 'border-orange-600/30 bg-orange-600/10 text-orange-700 dark:text-orange-400' },
  DELIVERED: { className: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400' },
  // Transfers
  IN_TRANSIT: { className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400', pulse: true },
  // Adjustments
  PENDING_APPROVAL: { className: 'border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-400', pulse: true },
  POSTED: { className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  REJECTED: { className: 'border-stone-500/30 bg-stone-500/10 text-stone-600 dark:text-stone-300' },
  // Cycle counts
  OPEN: { className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  COMPLETED: { className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  // Reorder suggestions
  PENDING: { className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  ACCEPTED: { className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  DISMISSED: { className: 'border-stone-500/30 bg-stone-500/10 text-stone-600 dark:text-stone-300' },
  // Exception flags
  REVIEWED: { className: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400' },
  // Product stock status
  OK: { className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  BELOW_REORDER: { className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  STOCKOUT: { className: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400' },
}

/** Nicer-than-titleCase labels for multi-word statuses. */
const LABELS: Record<string, string> = {
  BELOW_REORDER: 'Below reorder',
  IN_TRANSIT: 'In transit',
  PENDING_APPROVAL: 'Pending approval',
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string
  /** Override the auto-generated label. */
  label?: string
  className?: string
}) {
  const style = STATUS_STYLES[status] ?? {
    className: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
  }
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium',
        style.className,
        className
      )}
    >
      {style.pulse && (
        <span
          aria-hidden="true"
          className={cn('pulse-dot size-1.5 shrink-0 rounded-full bg-current', className)}
        />
      )}
      {label ?? LABELS[status] ?? titleCase(status)}
    </span>
  )
}

/** Product stock status from the computed DTO flags: Stockout > Below reorder > OK. */
export function getProductStatus(p: { stockoutRisk: boolean; belowReorder: boolean }): {
  status: string
  label: string
} {
  if (p.stockoutRisk) return { status: 'STOCKOUT', label: 'Stockout' }
  if (p.belowReorder) return { status: 'BELOW_REORDER', label: 'Below reorder' }
  return { status: 'OK', label: 'OK' }
}
