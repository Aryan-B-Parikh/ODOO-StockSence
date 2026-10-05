'use client'

import { ChevronRight, Mail, Star, Truck } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { SupplierDTO } from '@/lib/types'

/** Manual bar (Progress colors are fixed to primary — we need status colors). */
function ReliabilityBar({ value, className }: { value: number; className?: string }) {
  const width = Math.max(0, Math.min(100, value * 100))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="presentation">
      <div className={cn('h-full rounded-full transition-all', className)} style={{ width: `${width}%` }} />
    </div>
  )
}

/**
 * One supplier in the directory grid — click to open the detail dialog.
 * Lead-time chip: emerald ≤3d · neutral in between · amber >7d.
 * Reliability bar: emerald ≥95% · amber 85–95% · red <85%.
 */
export function SupplierCard({
  supplier,
  onOpen,
}: {
  supplier: SupplierDTO
  onOpen: () => void
}) {
  const leadFast = supplier.leadTimeDays <= 3
  const leadSlow = supplier.leadTimeDays > 7
  const reliabilityHigh = supplier.reliability >= 0.95
  const reliabilityMid = supplier.reliability >= 0.85
  const damageBad = supplier.damageRate > 0.02

  const preview = supplier.products.slice(0, 3)
  const moreCount = supplier.products.length - preview.length

  return (
    <Card
      tabIndex={0}
      role="button"
      aria-label={`Open supplier ${supplier.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="h-full cursor-pointer gap-0 py-0 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
    >
      <CardContent className="flex h-full flex-col p-4">
        {/* Name + contact */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold tracking-tight">{supplier.name}</p>
            {supplier.contact ? (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Mail className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{supplier.contact}</span>
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground/70">No contact on file</p>
            )}
          </div>
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
        </div>

        {/* Lead time + damage rate */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular',
              leadFast
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : leadSlow
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  : 'border-stone-500/30 bg-stone-500/10 text-stone-600 dark:text-stone-300'
            )}
          >
            <Truck className="size-3" aria-hidden="true" />
            {supplier.leadTimeDays} {supplier.leadTimeDays === 1 ? 'day' : 'days'}
          </span>
          <span
            className={cn(
              'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular',
              damageBad
                ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
                : 'border-stone-500/30 bg-stone-500/10 text-stone-600 dark:text-stone-300'
            )}
            title="Share of received goods that arrive damaged"
          >
            {(supplier.damageRate * 100).toFixed(1)}% damage
          </span>
        </div>

        {/* Reliability */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="font-medium text-muted-foreground">On-time reliability</span>
            <span
              className={cn(
                'font-semibold tabular',
                reliabilityHigh
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : reliabilityMid
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
              )}
            >
              {Math.round(supplier.reliability * 100)}%
            </span>
          </div>
          <ReliabilityBar
            value={supplier.reliability}
            className={
              reliabilityHigh
                ? 'bg-emerald-500'
                : reliabilityMid
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }
          />
        </div>

        {/* Product links preview */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
          {supplier.products.length === 0 ? (
            <span className="text-[11px] text-muted-foreground/80">No products linked yet</span>
          ) : (
            <>
              {preview.map((p) => (
                <span
                  key={p.productId}
                  className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium"
                  title={`${p.productName} — preferred supplier for this SKU`}
                >
                  {p.preferred && (
                    <Star className="size-2.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Preferred for this SKU" />
                  )}
                  {p.sku}
                </span>
              ))}
              {moreCount > 0 && (
                <span className="text-[10px] text-muted-foreground">+{moreCount} more</span>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
