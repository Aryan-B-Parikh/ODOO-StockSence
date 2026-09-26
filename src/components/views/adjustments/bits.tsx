'use client'

import { RotateCcw, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { AdjustmentDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Adjustments — local presentational bits (Task 2-b).
 * Task 2-a owns src/components/shared/* — these are minimal local versions so
 * this view stays self-contained while 2-a lands in parallel.
 */

/** Mono doc-code chip (amber tone — matches the dashboard ADJUSTMENT chip style). */
export function AdjCodeChip({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-700 dark:text-amber-400',
        className
      )}
    >
      {code}
    </span>
  )
}

const SEVERITY_STYLES: Record<string, { className: string; label: string }> = {
  LOW: { className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', label: 'Low' },
  MEDIUM: { className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400', label: 'Medium' },
  HIGH: { className: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400', label: 'High — needs approval' },
}

/** Severity badge: LOW emerald / MEDIUM amber / HIGH red ("High — needs approval"). */
export function SeverityBadge({ severity }: { severity: string }) {
  const style = SEVERITY_STYLES[severity] ?? { className: 'border-stone-500/30 bg-stone-500/10 text-stone-600', label: severity }
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', style.className)}>
      {style.label}
    </span>
  )
}

const ADJ_STATUS_STYLES: Record<string, { className: string; label: string }> = {
  PENDING_APPROVAL: { className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400', label: 'Awaiting approval' },
  POSTED: { className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', label: 'Posted' },
  REJECTED: { className: 'border-stone-500/30 bg-stone-500/10 text-stone-600 dark:text-stone-300', label: 'Rejected' },
}

/** Status badge: PENDING_APPROVAL amber (pulsing) / POSTED emerald / REJECTED stone. */
export function AdjStatusBadge({ status }: { status: string }) {
  const style = ADJ_STATUS_STYLES[status] ?? { className: 'border-stone-500/30 bg-stone-500/10 text-stone-600', label: status }
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium', style.className)}>
      {status === 'PENDING_APPROVAL' && <span className="size-1.5 rounded-full bg-amber-500 pulse-dot" aria-hidden="true" />}
      {style.label}
    </span>
  )
}

/** Severity + status explanation for the detail banner (mirrors the engine's routing rules). */
export function adjustmentExplanation(adj: AdjustmentDTO): { tone: 'amber' | 'emerald' | 'stone'; text: string } {
  if (adj.status === 'PENDING_APPROVAL') {
    return {
      tone: 'amber',
      text: 'Held for manager approval — over 15% of stock; posts only once approved. Nothing changes until then.',
    }
  }
  if (adj.status === 'REJECTED') {
    return { tone: 'stone', text: 'Rejected by a manager — system quantities were left unchanged.' }
  }
  // POSTED
  if (adj.severity === 'HIGH') {
    return { tone: 'emerald', text: 'Approved and posted — removes over 15% of stock; the change is now in the ledger.' }
  }
  if (adj.severity === 'MEDIUM') {
    return { tone: 'emerald', text: 'Posted and flagged for review — adjusts between 2% and 15% of stock at the location.' }
  }
  return { tone: 'emerald', text: 'Logged automatically — a one-off mismatch under 2% of stock; no action was needed.' }
}

const BANNER_TONES: Record<'amber' | 'emerald' | 'stone', string> = {
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  stone: 'border-stone-500/30 bg-stone-500/10 text-stone-700 dark:text-stone-300',
}

/** Severity/status explanation banner for the detail dialog. */
export function ExplanationBanner({ adj }: { adj: AdjustmentDTO }) {
  const { tone, text } = adjustmentExplanation(adj)
  return (
    <div className={cn('rounded-lg border px-3 py-2 text-xs font-medium', BANNER_TONES[tone])} role="status">
      {text}
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
