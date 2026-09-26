'use client'

import { motion } from 'framer-motion'
import { Warehouse } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtUSDCompact } from '@/lib/format'
import type { DashboardDTO } from '@/lib/types'

import { fadeUp, staggerContainer } from './motion'

type Rack = DashboardDTO['racks'][number]

/** Emerald gradient whose intensity scales with the rack's share of max value. */
function fillStyle(rack: Rack): React.CSSProperties {
  const pct = Math.min(100, Math.max(rack.fillPct, 2))
  const intensity = 0.35 + 0.65 * (rack.fillPct / 100)
  return {
    width: `${pct}%`,
    background: `linear-gradient(90deg, rgba(52, 211, 153, ${(0.45 * intensity + 0.15).toFixed(3)}), rgba(5, 150, 105, ${(0.35 + 0.6 * intensity).toFixed(3)}))`,
  }
}

/** Row 4 — warehouse floor-plan-lite: a tile per rack with value + fill bar. */
export function RackGrid({ racks }: { racks: DashboardDTO['racks'] }) {
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="visible" aria-label="Rack floor plan">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Warehouse className="size-4 text-primary" aria-hidden="true" />
            Rack Floor Plan
          </CardTitle>
          <CardDescription>On-hand value density across racks — bar intensity relative to the fullest rack</CardDescription>
        </CardHeader>
        <CardContent>
          {racks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No racks holding stock yet.</p>
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
            >
              {racks.map((rack) => (
                <motion.div
                  key={`${rack.zoneName}-${rack.rackCode}`}
                  variants={fadeUp}
                  className="rounded-lg border bg-card p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold tracking-tight">{rack.rackCode}</span>
                    <span className="text-sm font-semibold tabular">{fmtUSDCompact(rack.onHandValue)}</span>
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {rack.zoneName} · {rack.locationCount} {rack.locationCount === 1 ? 'location' : 'locations'}
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full transition-[width]" style={fillStyle(rack)} />
                  </div>
                  <div className="mt-1 text-right text-[10px] text-muted-foreground tabular">
                    {rack.fillPct}% of max rack value
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.section>
  )
}
