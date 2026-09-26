'use client'

import { RotateCcw, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Transfers — local presentational bits (Task 2-b).
 * Task 2-a owns src/components/shared/* — these are minimal local versions so
 * this view stays self-contained while 2-a lands in parallel.
 */

/** Mono doc-code chip (teal tone — matches the dashboard TRANSFER chip style). */
export function TrfCodeChip({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-md border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-teal-700 dark:text-teal-400',
        className
      )}
    >
      {code}
    </span>
  )
}

const TRANSFER_STATUS_STYLES: Record<string, { className: string; label: string }> = {
  IN_TRANSIT: { className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400', label: 'In Transit' },
  RECEIVED: { className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', label: 'Received' },
  CANCELLED: { className: 'border-stone-500/30 bg-stone-500/10 text-stone-600 dark:text-stone-300', label: 'Cancelled' },
}

/** Status badge: IN_TRANSIT amber / RECEIVED emerald / CANCELLED stone. */
export function TransferStatusBadge({ status }: { status: string }) {
  const style = TRANSFER_STATUS_STYLES[status] ?? {
    className: 'border-stone-500/30 bg-stone-500/10 text-stone-600',
    label: status,
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        style.className
      )}
    >
      {status === 'IN_TRANSIT' && <span className="size-1.5 rounded-full bg-amber-500 pulse-dot" aria-hidden="true" />}
      {style.label}
    </span>
  )
}

/** Shorten a long location path in the middle, e.g. "WH1 · A · Rack A2 · … · Shelf S2". */
export function truncateMiddle(s: string, max = 26): string {
  if (s.length <= max) return s
  const head = Math.ceil((max - 1) / 2)
  const tail = Math.floor((max - 1) / 2)
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`
}

/** Friendly empty state for a list/tab. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-2xl" aria-hidden="true">
        {icon}
      </div>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

/** Friendly, retry-able error state (mirrors the dashboard error card). */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-red-500/10" aria-hidden="true">
        <WifiOff className="size-5 text-red-600" />
      </div>
      <h3 className="mt-3 text-sm font-semibold">Couldn’t load data</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      <div className="mt-4 flex justify-center">
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="size-4" aria-hidden="true" /> Retry
        </Button>
      </div>
    </div>
  )
}
