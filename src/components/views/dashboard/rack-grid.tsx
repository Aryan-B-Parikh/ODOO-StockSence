'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronDown, Printer, QrCode, Warehouse } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'
import { fmtUSDCompact } from '@/lib/format'
import { generateQrMatrix } from '@/lib/qr-matrix'
import type { DashboardDTO, MetaDTO } from '@/lib/types'

import { fadeUp, staggerContainer } from './motion'
import { groupLocationsByRack, useRackLabelPrint } from './rack-label-print'

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
 * from the shared FNV-1a dot-matrix generator (src/lib/qr-matrix.ts) so the
 * on-screen sticker and the printed label are pixel-for-pixel identical.
 */
function QrSticker({ seed }: { seed: string }) {
  const cells = generateQrMatrix(seed)
  return (
    <div
      className="grid size-9 shrink-0 grid-cols-12 gap-px rounded-[4px] bg-foreground p-[3px] shadow-sm"
      role="img"
      aria-label={`QR location label ${seed}`}
      title={`Scan-to-open: ${seed}`}
    >
      {cells.map((lit, i) => (
        <span key={i} className={lit ? 'bg-background' : 'bg-foreground'} aria-hidden="true" />
      ))}
    </div>
  )
}

/**
 * "Print labels" dropdown — printable QR stickers for the zone/rack/shelf
 * hierarchy (Phase 2): one label per shelf location, all racks or per rack.
 */
function LabelsMenu() {
  const { print, portal, printing } = useRackLabelPrint()
  const { data: meta } = useQuery({
    queryKey: ['meta'],
    queryFn: () => api.get<MetaDTO>('/api/meta'),
    staleTime: 60_000,
  })
  const rackGroups = meta ? groupLocationsByRack(meta.locations) : []

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5" aria-label="Print QR rack labels">
            <Printer className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Labels</span>
            <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Print QR location labels</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => void print({ kind: 'ALL' })}>
            <QrCode className="size-4" aria-hidden="true" />
            <div className="flex min-w-0 flex-col">
              <span className="font-medium">All racks</span>
              <span className="text-xs text-muted-foreground">
                {meta ? `${meta.locations.length} shelf labels` : 'loading…'}
              </span>
            </div>
          </DropdownMenuItem>
          {rackGroups.length > 0 && <DropdownMenuSeparator />}
          {rackGroups.map((g) => (
            <DropdownMenuItem key={g.rackCode} onSelect={() => void print({ kind: 'RACK', rackCode: g.rackCode })}>
              <Warehouse className="size-4" aria-hidden="true" />
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">Rack {g.rackCode}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {g.zoneName} · {g.count} {g.count === 1 ? 'label' : 'labels'}
                </span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {portal}
      <span className="sr-only" role="status">
        {printing ? 'Preparing label sheet for printing' : ''}
      </span>
    </>
  )
}

/** Row 4 — warehouse floor-plan-lite: a tile per rack with value + fill bar. */
export function RackGrid({ racks }: { racks: DashboardDTO['racks'] }) {
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="visible" aria-label="Rack floor plan">
      <Card className="gap-4">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Warehouse className="size-4 text-primary" aria-hidden="true" />
                Rack Floor Plan
              </CardTitle>
              <CardDescription className="flex items-center gap-1.5">
                <QrCode className="size-3" aria-hidden="true" />
                On-hand value density across racks — every rack carries a QR label mapping to its
                zone/rack/shelf hierarchy
              </CardDescription>
            </div>
            <LabelsMenu />
          </div>
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
                  className="lift group rounded-lg border bg-card p-3 hover:border-primary/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="transition-transform duration-200 group-hover:scale-110">
                        <QrSticker seed={`${rack.zoneName}/${rack.rackCode}`} />
                      </span>
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
