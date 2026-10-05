'use client'

import { motion } from 'framer-motion'
import { Gauge, ShieldCheck, TrendingUp, ClipboardCheck, Siren, Timer, Ban } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardDTO } from '@/lib/types'
import { fadeUp, staggerContainer } from '@/components/views/dashboard/motion'

type Metrics = DashboardDTO['metrics']

/**
 * Phase 5 — pilot success metrics ("Success Metrics to Track" from the plan).
 * Every number is derived from data recorded since Phase 0; baselines captured
 * before the related phase ship make the improvement measurable, not assumed.
 */
export function MetricsPanel({ metrics }: { metrics: Metrics }) {
  const items: {
    key: string
    icon: React.ComponentType<{ className?: string }>
    tone: 'good' | 'warn' | 'bad' | 'neutral'
    title: string
    value: string
    sub: string
    progress?: number
    progressTone?: 'good' | 'warn' | 'bad'
  }[] = [
    {
      key: 'accuracy',
      icon: Gauge,
      tone: metrics.inventoryAccuracy.pct >= 95 ? 'good' : metrics.inventoryAccuracy.pct >= 85 ? 'warn' : 'bad',
      title: 'Inventory accuracy',
      value: `${metrics.inventoryAccuracy.pct}%`,
      sub: `${metrics.inventoryAccuracy.label} — ${metrics.inventoryAccuracy.countedLines} lines counted, ${metrics.inventoryAccuracy.varianceLines} with variance`,
      progress: metrics.inventoryAccuracy.pct,
      progressTone: metrics.inventoryAccuracy.pct >= 95 ? 'good' : 'warn',
    },
    {
      key: 'stockouts',
      icon: Siren,
      tone: metrics.stockoutIncidents.current > 0 ? 'bad' : 'good',
      title: 'Stockout incidents',
      value: String(metrics.stockoutIncidents.current),
      sub: metrics.stockoutIncidents.current > 0 ? `${metrics.stockoutIncidents.skus.join(' · ')} — at/below safety stock` : 'No SKUs at or below safety stock',
    },
    {
      key: 'overselling',
      icon: ShieldCheck,
      tone: 'good',
      title: 'Overselling prevented',
      value: metrics.oversellingPrevented.blockedAttempts.toLocaleString('en-US'),
      sub: metrics.oversellingPrevented.label,
    },
    {
      key: 'acceptance',
      icon: TrendingUp,
      tone: 'neutral',
      title: 'Reorder acceptance',
      value: `${metrics.reorderAcceptance.pct}%`,
      sub: `${metrics.reorderAcceptance.label} — ${metrics.reorderAcceptance.accepted} accepted · ${metrics.reorderAcceptance.dismissed} dismissed`,
      progress: metrics.reorderAcceptance.pct,
      progressTone: 'good',
    },
    {
      key: 'cycle',
      icon: ClipboardCheck,
      tone: metrics.cycleVarianceRate.pct <= 25 ? 'good' : 'warn',
      title: 'Cycle-count variance rate',
      value: `${metrics.cycleVarianceRate.pct}%`,
      sub: `${metrics.cycleVarianceRate.label} — ${metrics.cycleVarianceRate.withVariance}/${metrics.cycleVarianceRate.counts} counts`,
    },
    {
      key: 'alert-time',
      icon: Timer,
      tone: metrics.alertToAction.avgHours != null && metrics.alertToAction.avgHours > 48 ? 'warn' : 'neutral',
      title: 'Alert-to-action time',
      value: metrics.alertToAction.avgHours != null ? `${metrics.alertToAction.avgHours}h` : '—',
      sub: `${metrics.alertToAction.label} — ${metrics.alertToAction.sampled} open items`,
    },
  ]

  void Ban

  return (
    <motion.section variants={staggerContainer} initial="hidden" animate="show" aria-label="Pilot success metrics">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <TrendingUp className="size-4" aria-hidden="true" />
            </span>
            Pilot success metrics
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Phase 5 · ledger-derived
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Baselined when tracked, measured since — every figure is computed from the immutable ledger, counts and
            reservations the system has been recording since day one.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const Icon = item.icon
              return (
                <motion.div key={item.key} variants={fadeUp} className="min-w-0">
                  <div className="lift flex h-full flex-col gap-2 rounded-lg border bg-card p-3.5 hover:border-primary/30">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          'flex size-7 shrink-0 items-center justify-center rounded-md ' +
                          (item.tone === 'good'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : item.tone === 'warn'
                              ? 'bg-amber-500/10 text-amber-600'
                              : item.tone === 'bad'
                                ? 'bg-red-500/10 text-red-600'
                                : 'bg-muted text-muted-foreground')
                        }
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <p id={`metric-${item.key}-title`} className="truncate text-xs font-medium text-muted-foreground">{item.title}</p>
                    </div>
                    <p
                      className={
                        'text-2xl font-semibold tabular-nums tracking-tight ' +
                        (item.tone === 'bad' ? 'text-red-600' : item.tone === 'good' ? 'text-emerald-600' : 'text-foreground')
                      }
                    >
                      {item.value}
                    </p>
                    {item.progress != null && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-labelledby={`metric-${item.key}-title`} aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}>
                        <div
                          className={
                            'h-full rounded-full ' +
                            (item.progressTone === 'good' ? 'bg-emerald-500' : item.progressTone === 'warn' ? 'bg-amber-500' : 'bg-red-500')
                          }
                          style={{ width: `${Math.min(100, Math.max(2, item.progress))}%` }}
                        />
                      </div>
                    )}
                    <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{item.sub}</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </motion.section>
  )
}
