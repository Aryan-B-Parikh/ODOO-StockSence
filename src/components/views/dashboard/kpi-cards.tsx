'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, CircleCheck, ClipboardCheck, OctagonX, Package, Truck } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { fmtUSDCompact } from '@/lib/format'
import type { DashboardDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

import { fadeUp, staggerContainer } from './motion'

type Kpis = DashboardDTO['kpis']

interface KpiCardProps {
  label: string
  value: string
  sub?: React.ReactNode
  icon: React.ReactNode
  iconClass: string
  valueClass?: string
}

function KpiCard({ label, value, sub, icon, iconClass, valueClass }: KpiCardProps) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', iconClass)}>{icon}</span>
        </div>
        <div className={cn('mt-2 text-2xl font-semibold tracking-tight tabular', valueClass)}>{value}</div>
        {sub && <div className="mt-1 space-y-0.5 text-[11px] leading-tight text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
}

/** Row 1 — headline KPIs (value, availability, deliveries, receipts, low stock, stockouts). */
export function KpiCards({ kpis }: { kpis: Kpis }) {
  const lowStock = kpis.lowStockCount > 0
  const stockout = kpis.stockoutCount > 0

  return (
    <motion.section
      aria-label="Key metrics"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
    >
      <motion.div variants={fadeUp}>
        <KpiCard
          label="Total Stock Value"
          value={fmtUSDCompact(kpis.totalStockValue)}
          sub={<span>{kpis.skuCount} active SKUs</span>}
          icon={<Package className="size-3.5" />}
          iconClass="bg-emerald-500/10 text-emerald-600"
        />
      </motion.div>

      <motion.div variants={fadeUp}>
        <KpiCard
          label="Available Value"
          value={fmtUSDCompact(kpis.availableValue)}
          sub={
            <>
              <div>Reserved {fmtUSDCompact(kpis.reservedValue)} · Incoming {fmtUSDCompact(kpis.incomingValue)}</div>
              <div>In transit {fmtUSDCompact(kpis.inTransitValue)} · Damaged {fmtUSDCompact(kpis.damagedValue)}</div>
            </>
          }
          icon={<CircleCheck className="size-3.5" />}
          iconClass="bg-teal-500/10 text-teal-600"
        />
      </motion.div>

      <motion.div variants={fadeUp}>
        <KpiCard
          label="Open Deliveries"
          value={String(kpis.openDeliveries)}
          sub={
            <>
              <div>reserved → picked → packed</div>
              <div>{kpis.inTransitTransfers} transfers in transit</div>
            </>
          }
          icon={<ClipboardCheck className="size-3.5" />}
          iconClass="bg-teal-500/10 text-teal-600"
        />
      </motion.div>

      <motion.div variants={fadeUp}>
        <KpiCard
          label="Expected Receipts"
          value={String(kpis.expectedReceipts)}
          sub={<span>{kpis.pendingAdjustments} adjustments pending approval</span>}
          icon={<Truck className="size-3.5" />}
          iconClass="bg-amber-500/10 text-amber-600"
        />
      </motion.div>

      <motion.div variants={fadeUp}>
        <KpiCard
          label="Low Stock"
          value={String(kpis.lowStockCount)}
          sub={<span>below reorder point</span>}
          valueClass={lowStock ? 'text-amber-600 dark:text-amber-400' : undefined}
          icon={<AlertTriangle className="size-3.5" />}
          iconClass={
            lowStock ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'
          }
        />
      </motion.div>

      <motion.div variants={fadeUp}>
        <KpiCard
          label="Stockouts"
          value={String(kpis.stockoutCount)}
          sub={<span>at/below safety stock</span>}
          valueClass={stockout ? 'text-red-600 dark:text-red-400' : undefined}
          icon={<OctagonX className="size-3.5" />}
          iconClass={stockout ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-600'}
        />
      </motion.div>
    </motion.section>
  )
}
