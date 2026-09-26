'use client'

import { cn } from '@/lib/utils'
import { fmtPct } from '@/lib/format'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

interface ChangeBadgeProps {
  value: number // percent change
  className?: string
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

/** Pill badge showing +/- percent change, emerald for up / red for down. */
export function ChangeBadge({ value, className, size = 'md', showIcon = true }: ChangeBadgeProps) {
  const up = value > 0.005
  const down = value < -0.005
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md font-medium tabular',
        up && 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
        down && 'bg-red-500/12 text-red-600 dark:text-red-400',
        !up && !down && 'bg-muted text-muted-foreground',
        size === 'sm' && 'px-1.5 py-0.5 text-[11px]',
        size === 'md' && 'px-2 py-0.5 text-xs',
        size === 'lg' && 'px-2.5 py-1 text-sm',
        className,
      )}
    >
      {showIcon && <Icon className="h-3 w-3" aria-hidden />}
      {fmtPct(value)}
    </span>
  )
}

/** Plain colored +/- value (no pill), e.g. +$123.45 */
export function SignedValue({ value, className, dp = 2 }: { value: number; className?: string; dp?: number }) {
  const up = value > 0.0005
  const down = value < -0.0005
  return (
    <span
      className={cn(
        'tabular',
        up && 'text-emerald-600 dark:text-emerald-400',
        down && 'text-red-600 dark:text-red-400',
        !up && !down && 'text-muted-foreground',
        className,
      )}
    >
      {up ? '+' : ''}
      {value < 0 ? '-' : ''}$
      {Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}
    </span>
  )
}
