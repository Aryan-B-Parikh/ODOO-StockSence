'use client'

import { useQuery } from '@tanstack/react-query'
import { Boxes, History, MapPin, PackageSearch, RotateCcw, Star, TrendingUp, Warehouse } from 'lucide-react'

import { DocCodeChip, EmptyState, getProductStatus, QuantityPill, StatusBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { deltaColor, fmtPct, fmtQty, fmtSignedQty, fmtUSD, timeAgo, titleCase } from '@/lib/format'
import { generateQrSvg } from '@/lib/qr-matrix'
import type { LedgerListDTO, ProductDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'

/** Small stat tile used in the quantity cards row. */
function QtyTile({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular">
        <QuantityPill value={value} className="text-base" />
        {value !== 0 && unit ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">{unit}</span> : null}
      </div>
    </div>
  )
}

/** Manual bar (Progress colors are fixed to primary — we need status colors). */
function RatioBar({ pct, className }: { pct: number; className?: string }) {
  const width = Math.max(0, Math.min(100, pct))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="presentation">
      <div className={cn('h-full rounded-full transition-all', className)} style={{ width: `${width}%` }} />
    </div>
  )
}

/**
 * Full product drill-down: split quantities across every state, reorder
 * profile with the supplier-aware formula, stock by location, supplier
 * links and the product's recent ledger movements.
 */
export function ProductDetailDialog({
  productId,
  open,
  onClose,
}: {
  productId: number
  open: boolean
  onClose: () => void
}) {
  const setView = useUIStore((s) => s.setView)

  const productQuery = useQuery({
    queryKey: ['products', 'detail', productId],
    queryFn: () => api.get<{ product: ProductDTO }>(`/api/products/${productId}`),
    enabled: open,
  })
  const ledgerQuery = useQuery({
    queryKey: ['ledger', 'product', productId],
    queryFn: () => api.get<LedgerListDTO>(`/api/ledger?productId=${productId}&limit=10`),
    enabled: open,
  })

  const product = productQuery.data?.product
  const entries = ledgerQuery.data?.entries ?? []
  const status = product ? getProductStatus(product) : null
  const projected = product ? product.onHand + product.incoming - product.reserved : 0
  const preferred = product?.suppliers.find((s) => s.preferred) ?? product?.suppliers[0]

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-h-[88vh] max-w-3xl overflow-y-auto">
        {productQuery.isPending && (
          <div className="space-y-4" aria-busy="true" aria-label="Loading product">
            <DialogTitle className="sr-only">Loading product</DialogTitle>
            <Skeleton className="h-16 w-2/3" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        )}

        {productQuery.isError && (
          <>
            <DialogTitle className="sr-only">Couldn't load this product</DialogTitle>
            <EmptyState
            icon={PackageSearch}
            title="Couldn't load this product"
            description={productQuery.error instanceof Error ? productQuery.error.message : 'Try again in a moment.'}
            action={
              <Button variant="outline" size="sm" onClick={() => void productQuery.refetch()}>
                <RotateCcw className="size-3.5" aria-hidden="true" /> Retry
              </Button>
            }
          />
          </>
        )}

        {product && status && (
          <div className="space-y-5">
            {/* Header with SKU QR badge */}
            <DialogHeader className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <DialogTitle asChild>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs font-medium">
                        {product.sku}
                      </span>
                      <span className="text-lg font-semibold tracking-tight">{product.name}</span>
                    </div>
                  </DialogTitle>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={status.status} label={status.label} />
                    <span className="rounded-md border border-stone-500/30 bg-stone-500/10 px-2 py-0.5 text-xs font-medium text-stone-600 dark:text-stone-300">
                      {product.category}
                    </span>
                    <span className="rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-400">
                      {product.valueClass} value
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmtUSD(product.unitCost, 2)} / {product.unit}
                    </span>
                  </div>
                  {product.notes && (
                    <p className="text-sm italic text-muted-foreground">{product.notes}</p>
                  )}
                </div>

                {/* Scannable Product SKU QR Badge */}
                <div
                  className="size-14 shrink-0 rounded-lg border bg-white p-1 shadow-xs ring-1 ring-border/50"
                  role="img"
                  aria-label={`QR Code for SKU ${product.sku}`}
                  title={`Scan to open SKU: ${product.sku}`}
                  dangerouslySetInnerHTML={{
                    __html: generateQrSvg(product.sku, { margin: 1 }),
                  }}
                />
              </div>
            </DialogHeader>

            {/* Quantity cards — Available is the hero card */}
            <section aria-label="Quantities" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="col-span-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-3 sm:col-span-3 lg:col-span-2 lg:row-span-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  <Boxes className="size-3" aria-hidden="true" /> Available
                </div>
                <div className="mt-1 text-3xl font-semibold tabular text-emerald-700 dark:text-emerald-400">
                  {fmtQty(product.available, product.unit)}
                </div>
                <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                  on-hand − reserved — what can be promised
                </p>
              </div>
              <QtyTile label="On-hand" value={product.onHand} unit={product.unit} />
              <QtyTile label="Reserved" value={product.reserved} unit={product.unit} />
              <QtyTile label="Incoming" value={product.incoming} unit={product.unit} />
              <QtyTile label="In transit" value={product.inTransit} unit={product.unit} />
              <QtyTile label="Damaged" value={product.damaged} unit={product.unit} />
            </section>

            {/* Reorder profile */}
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="size-4 text-primary" aria-hidden="true" /> Reorder profile
                  </span>
                  <StatusBadge status={status.status} label={status.label} />
                </CardTitle>
                <CardDescription>
                  Projected available = on-hand + incoming − reserved, compared against the reorder point
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 px-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-2xl font-semibold tabular">{fmtQty(product.reorderPoint, product.unit)}</div>
                  <div className="text-xs font-medium text-muted-foreground">Reorder point</div>
                  <p className="text-[11px] leading-tight text-muted-foreground">
                    {fmtQty(product.dailyUsage, product.unit)}/day × {preferred ? `${preferred.leadTimeDays}-day lead` : 'lead time'}
                    {product.safetyStock > 0 ? ` + ${fmtQty(product.safetyStock, product.unit)} safety` : ''}
                  </p>
                </div>
                <div className="space-y-1">
                  <div
                    className={cn(
                      'text-2xl font-semibold tabular',
                      status.status === 'STOCKOUT'
                        ? 'text-red-600 dark:text-red-400'
                        : status.status === 'BELOW_REORDER'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                    )}
                  >
                    {fmtQty(projected, product.unit)}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">Projected available</div>
                  <p className="text-[11px] leading-tight text-muted-foreground">
                    {fmtQty(product.onHand, product.unit)} on-hand + {fmtQty(product.incoming, product.unit)} incoming −{' '}
                    {fmtQty(product.reserved, product.unit)} reserved
                  </p>
                </div>
                <div className="flex flex-col justify-center gap-1.5">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">vs reorder point</span>
                    <span className="font-semibold tabular">
                      {product.reorderPoint > 0 ? Math.round((projected / product.reorderPoint) * 100) : 100}%
                    </span>
                  </div>
                  <RatioBar
                    pct={product.reorderPoint > 0 ? (projected / product.reorderPoint) * 100 : 100}
                    className={
                      status.status === 'STOCKOUT'
                        ? 'bg-red-500'
                        : status.status === 'BELOW_REORDER'
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>safety {fmtQty(product.safetyStock, product.unit)}</span>
                    <span>reorder {fmtQty(product.reorderPoint, product.unit)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stock by location */}
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="size-4 text-primary" aria-hidden="true" /> Stock by location
                </CardTitle>
                <CardDescription>Split quantities per shelf — available = on-hand − reserved</CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                {product.stockByLocation.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No stock recorded at any location yet.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="pl-3">Location</TableHead>
                          <TableHead className="text-right">On-hand</TableHead>
                          <TableHead className="text-right">Reserved</TableHead>
                          <TableHead className="text-right">Available</TableHead>
                          <TableHead className="text-right">Incoming</TableHead>
                          <TableHead className="text-right">In transit</TableHead>
                          <TableHead className="pr-3 text-right">Damaged</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {product.stockByLocation.map((s) => (
                          <TableRow key={s.locationId}>
                            <TableCell className="pl-3 font-mono text-xs">{s.fullPath}</TableCell>
                            <TableCell className="text-right"><QuantityPill value={s.onHand} /></TableCell>
                            <TableCell className="text-right"><QuantityPill value={s.reserved} /></TableCell>
                            <TableCell className="text-right font-semibold"><QuantityPill value={s.available} tone="accent" zeroMuted={false} /></TableCell>
                            <TableCell className="text-right"><QuantityPill value={s.incoming} tone={s.incoming > 0 ? 'warn' : 'default'} /></TableCell>
                            <TableCell className="text-right"><QuantityPill value={s.inTransit} /></TableCell>
                            <TableCell className="pr-3 text-right"><QuantityPill value={s.damaged} tone={s.damaged > 0 ? 'bad' : 'default'} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Suppliers */}
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Warehouse className="size-4 text-primary" aria-hidden="true" /> Suppliers
                </CardTitle>
                <CardDescription>Preferred supplier drives the reorder-point lead time</CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                {product.suppliers.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No supplier linked to this SKU yet.</p>
                ) : (
                  <ul className="max-h-60 space-y-2 overflow-y-auto pr-1">
                    {product.suppliers.map((s) => (
                      <li
                        key={s.supplierId}
                        className={cn(
                          'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm',
                          s.preferred && 'border-primary/30 bg-primary/5'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5 font-medium">
                          {s.preferred ? (
                            <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Preferred supplier" />
                          ) : (
                            <Star className="size-3.5 shrink-0 text-muted-foreground/40" aria-hidden="true" />
                          )}
                          <span className="truncate">{s.name}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{s.leadTimeDays}-day lead</span>
                        <span className="text-xs tabular text-muted-foreground">{fmtUSD(s.costPrice, 2)} / {product.unit}</span>
                        <span className="text-xs tabular text-muted-foreground">min {fmtQty(s.minOrderQty)} · ×{s.orderMultiple} multiple</span>
                        <span
                          className={cn(
                            'ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium',
                            s.reliability >= 0.95
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : s.reliability >= 0.9
                                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                : 'bg-red-500/10 text-red-700 dark:text-red-400'
                          )}
                        >
                          {fmtPct(s.reliability * 100)} reliable
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Recent ledger */}
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="size-4 text-primary" aria-hidden="true" /> Recent movements
                </CardTitle>
                <CardDescription>Last {Math.min(10, Math.max(entries.length, 1))} ledger entries for this SKU</CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                {ledgerQuery.isPending ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-9" />
                    ))}
                  </div>
                ) : entries.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No movements recorded yet.</p>
                ) : (
                  <ul className="max-h-72 divide-y overflow-y-auto pr-1">
                    {entries.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 py-2" title={e.code}>
                        <DocCodeChip docType={e.docType} code={e.docCode} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">{titleCase(e.field)}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{e.locationPath}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={cn('text-xs font-semibold tabular', deltaColor(e.diff))}>
                            {fmtSignedQty(e.diff, e.unit)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{timeAgo(e.createdAt)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    onClose()
                    setView('history')
                  }}
                >
                  Full move history
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
