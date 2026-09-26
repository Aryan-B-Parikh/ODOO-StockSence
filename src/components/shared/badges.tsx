'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Sparkles } from 'lucide-react'

/** News/market sentiment badge (score -1..1 or a label string). */
export function SentimentBadge({ score, label }: { score: number; label?: string }) {
  const text =
    label ??
    (score > 0.45
      ? 'Bullish'
      : score > 0.15
        ? 'Somewhat Bullish'
        : score > -0.15
          ? 'Neutral'
          : score > -0.45
            ? 'Somewhat Bearish'
            : 'Bearish')
  const tone =
    score > 0.15
      ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/12'
      : score < -0.15
        ? 'bg-red-500/12 text-red-600 dark:text-red-400 hover:bg-red-500/12'
        : 'bg-amber-500/12 text-amber-600 dark:text-amber-400 hover:bg-amber-500/12'
  return (
    <Badge variant="secondary" className={cn('font-medium', tone)}>
      {text}
    </Badge>
  )
}

/** News impact badge. */
export function ImpactBadge({ impact }: { impact: string }) {
  const tone =
    impact === 'HIGH'
      ? 'border-red-500/40 text-red-600 dark:text-red-400'
      : impact === 'MEDIUM'
        ? 'border-amber-500/40 text-amber-600 dark:text-amber-400'
        : 'border-border text-muted-foreground'
  return (
    <Badge variant="outline" className={cn('text-[10px] tracking-wide', tone)}>
      {impact}
    </Badge>
  )
}

/** AI-generated content marker. */
export function AiBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary',
        className,
      )}
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      AI
    </span>
  )
}

/** Analyst rating badge: BUY / HOLD / SELL. */
export function RatingBadge({ rating, className }: { rating: string; className?: string }) {
  const r = rating.toUpperCase()
  const tone =
    r === 'BUY'
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
      : r === 'SELL'
        ? 'bg-red-500/15 text-red-600 dark:text-red-400'
        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold tracking-wide', tone, className)}>
      {r}
    </span>
  )
}

/** Market status / WS connection pill. */
export function LivePill({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide',
        connected
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-emerald-500 pulse-dot' : 'bg-red-500')}
        aria-hidden
      />
      {connected ? 'LIVE' : 'OFFLINE'}
    </span>
  )
}
