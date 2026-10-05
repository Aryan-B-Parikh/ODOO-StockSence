'use client'

import { cn } from '@/lib/utils'

export type QtyTone = 'default' | 'muted' | 'good' | 'warn' | 'bad' | 'accent'

const TONE_CLASS: Record<QtyTone, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground/70',
  good: 'text-emerald-700 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-red-600 dark:text-red-400',
  accent: 'text-primary',
}

/**
 * Compact tabular quantity display for tables and stat cards.
 * Zero values render dimmed by default so real quantities pop.
 */
export function QuantityPill({
  value,
  tone = 'default',
  className,
  zeroMuted = true,
}: {
  value: number | null | undefined
  tone?: QtyTone
  className?: string
  /** Dim explicit zeros (default true). */
  zeroMuted?: boolean
}) {
  const isZero = value === 0
  const effectiveTone: QtyTone = isZero && zeroMuted && tone === 'default' ? 'muted' : tone
  const display =
    value == null || !isFinite(value)
      ? '—'
      : (Math.abs(value % 1) > 0 ? Number(value.toFixed(2)) : value).toLocaleString('en-US', {
          maximumFractionDigits: 2,
        })
  return (
    <span className={cn('tabular font-medium', TONE_CLASS[effectiveTone], className)}>{display}</span>
  )
}
