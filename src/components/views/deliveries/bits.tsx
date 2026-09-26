'use client'

import { Fragment } from 'react'
import { RotateCcw, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Deliveries — local presentational bits (Task 2-b).
 * Task 2-a owns src/components/shared/* — these are minimal local versions so
 * this view stays self-contained while 2-a lands in parallel.
 */

/** Delivery state pipeline — the fixed order a delivery walks through. */
export const DELIVERY_STEPS = [
  { key: 'RESERVED', label: 'Reserved' },
  { key: 'PICKED', label: 'Picked' },
  { key: 'PACKED', label: 'Packed' },
  { key: 'DELIVERED', label: 'Delivered' },
] as const

/** Mono doc-code chip (stone tone — matches the dashboard DELIVERY chip style). */
export function DelCodeChip({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-md border border-stone-500/30 bg-stone-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-stone-600 dark:text-stone-300',
        className
      )}
    >
      {code}
    </span>
  )
}

/**
 * State-pipeline stepper: 4 dots labeled Reserved→Picked→Packed→Delivered.
 * Filled emerald up to (and including) the current state, the current dot
 * pulses; CANCELLED renders all four dots struck-through in stone.
 */
export function StateStepper({
  status,
  size = 'sm',
  timestamps,
  className,
}: {
  status: string
  size?: 'sm' | 'lg'
  /** Optional per-step timestamps (aligned with DELIVERY_STEPS) for the lg variant. */
  timestamps?: (string | null)[]
  className?: string
}) {
  const cancelled = status === 'CANCELLED'
  const current = cancelled ? -1 : DELIVERY_STEPS.findIndex((s) => s.key === status)
  const lg = size === 'lg'
  const reached = (i: number) => !cancelled && i <= current

  return (
    <div className={cn('relative flex w-fit items-start', className)} role="img" aria-label={`Delivery state: ${status.toLowerCase()}`}>
      {cancelled && (
        <span
          aria-hidden="true"
          className={cn('absolute left-2 right-2 h-px bg-stone-500/70', lg ? 'top-[6px]' : 'top-[4px]')}
        />
      )}
      {DELIVERY_STEPS.map((step, i) => (
        <Fragment key={step.key}>
          {i > 0 && (
            <span
              aria-hidden="true"
              className={cn(
                'h-0.5 rounded-full',
                lg ? 'mt-[5px] w-6' : 'mt-[3px] w-3',
                cancelled ? 'bg-stone-300' : reached(i) ? 'bg-emerald-600/60' : 'bg-muted-foreground/20'
              )}
            />
          )}
          <div className={cn('flex flex-col items-center gap-1', lg ? 'w-24' : 'w-14')}>
            <span
              aria-hidden="true"
              className={cn(
                'rounded-full',
                lg ? 'size-3' : 'size-2',
                cancelled
                  ? 'bg-stone-400'
                  : reached(i)
                    ? 'bg-emerald-600'
                    : 'bg-muted-foreground/25',
                i === current && !cancelled && 'pulse-dot ring-4 ring-emerald-600/15'
              )}
            />
            <span
              className={cn(
                'leading-none font-medium uppercase tracking-wide',
                lg ? 'text-[11px]' : 'text-[9px]',
                cancelled
                  ? 'text-stone-400 line-through decoration-stone-500'
                  : reached(i)
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-muted-foreground'
              )}
            >
              {step.label}
            </span>
            {lg && (
              <span className="text-[10px] leading-tight text-muted-foreground">
                {timestamps?.[i] ? fmtDateTime(timestamps[i]) : '—'}
              </span>
            )}
          </div>
        </Fragment>
      ))}
    </div>
  )
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
