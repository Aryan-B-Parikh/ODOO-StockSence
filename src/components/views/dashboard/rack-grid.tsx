'use client'

import { motion } from 'framer-motion'
import { QrCode, Warehouse } from 'lucide-react'

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

/**
 * Deterministic "QR sticker" placeholder — the scannable label every rack
 * carries (Phase 2: QR codes map to the zone/rack/shelf hierarchy). Rendered
 * as a pseudo-random but stable dot matrix seeded from the rack code, framed
 * with quiet-zone corners like a real label.
 */
function QrSticker({ seed }: { seed: string }) {
  // FNV-1a hash → deterministic 12×12 dot matrix
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  const cells: boolean[] = []
  let a = h >>> 0
  for (let i = 0; i < 144; i++) {
    a = (Math.imul(a ^ (a >>> 15), 1 | a) | 0) >>> 0
    cells.push(((a ^ (a >>> 13)) & 1) === 1)
  }
  const isFinder = (r: number, c: number) =>
    (r < 3 && c < 3) || (r < 3 && c > 8) || (r > 8 && c < 3)
  return (
    <div
      className="grid size-9 shrink-0 grid-cols-12 gap-px rounded-[4px] bg-foreground p-[3px] shadow-sm"
      role="img"
      aria-label={`QR location label ${seed}`}
      title={`Scan-to-open: ${seed}`}
    >
      {cells.map((on, i) => {
        const r = Math.floor(i / 12)
        const c = i % 12
        const lit = isFinder(r, c) ? (r === 1 && c > 0 && c < 11) || (c === 1) || (r === 10 && c < 3) ? false : true : on
        return <span key={i} className={lit ? 'bg-background' : 'bg-foreground'} aria-hidden="true" />
      })}
    </div>
  )
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
          <CardDescription className="flex items-center gap-1.5">
            <QrCode className="size-3" aria-hidden="true" />
            On-hand value density across racks — every rack carries a QR label mapping to its zone/rack/shelf hierarchy
          </CardDescription>
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
                  className="group rounded-lg border bg-card p-3 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <QrSticker seed={`${rack.zoneName}/${rack.rackCode}`} />
                      <div className="min-w-0">
                        <span className="block text-lg font-semibold leading-none tracking-tight">{rack.rackCode}</span>
                        <span className="mt-1 block truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {rack.zoneName}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-semibold tabular">{fmtUSDCompact(rack.onHandValue)}</span>
                  </div>
                  <div className="mt-2.5 truncate text-[11px] text-muted-foreground">
                    {rack.locationCount} {rack.locationCount === 1 ? 'location' : 'locations'} ·{' '}
                    <span className="font-mono">{rack.zoneName.slice(-2)}-{rack.rackCode}-S#</span>
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
