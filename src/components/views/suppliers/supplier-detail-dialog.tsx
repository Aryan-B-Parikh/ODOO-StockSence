'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Loader2, PencilLine, RotateCcw, ShieldAlert, Star, Trash2, Truck,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/shared'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { fmtQty, fmtUSD } from '@/lib/format'
import type { SupplierDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { SupplierFormDialog } from './supplier-form-dialog'

/** Small stat tile (same look as the product detail quantity tiles). */
function StatTile({
  label, value, valueClass, caption,
}: {
  label: string
  value: string
  valueClass?: string
  caption?: string
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold tabular', valueClass)}>{value}</div>
      {caption && <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{caption}</div>}
    </div>
  )
}

/** Draft of one link row while "Edit link terms" is active (strings = NaN-safe inputs). */
interface LinkDraft {
  productId: number
  sku: string
  productName: string
  unit: string
  costPrice: string
  minOrderQty: string
  orderMultiple: string
  preferred: boolean
}

/**
 * Supplier drill-down: vendor stats, every product link with its order
 * economics, and (for managers) an inline editor for the link terms — the
 * cost / MOQ / order-multiple numbers the reorder engine rounds suggestions to.
 */
export function SupplierDetailDialog({
  supplierId,
  open,
  onClose,
}: {
  supplierId: number
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const permissions = useAuthStore((s) => s.user?.permissions)
  const canConfigure = permissions?.includes('configure') ?? false

  const [editTerms, setEditTerms] = useState(false)
  const [drafts, setDrafts] = useState<LinkDraft[]>([])
  const [savingTerms, setSavingTerms] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const query = useQuery({
    queryKey: ['suppliers', 'detail', supplierId],
    queryFn: () => api.get<{ supplier: SupplierDTO }>(`/api/suppliers/${supplierId}`),
    enabled: open,
  })

  const supplier = query.data?.supplier

  // Seed the editable drafts from the live supplier data when edit mode STARTS
  // (seeded from the click handler — a later background refetch must never
  // clobber in-progress edits).
  const startEditTerms = () => {
    if (!supplier) return
    setDrafts(
      supplier.products.map((p) => ({
        productId: p.productId,
        sku: p.sku,
        productName: p.productName,
        unit: p.unit,
        costPrice: String(p.costPrice),
        minOrderQty: String(p.minOrderQty),
        orderMultiple: String(p.orderMultiple),
        preferred: p.preferred,
      }))
    )
    setEditTerms(true)
  }

  const patchDraft = (productId: number, patch: Partial<LinkDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.productId === productId ? { ...d, ...patch } : d)))
  }

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    void queryClient.invalidateQueries({ queryKey: ['reorder'] })
    void queryClient.invalidateQueries({ queryKey: ['meta'] })
    void queryClient.invalidateQueries({ queryKey: ['products'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const onSaveTerms = async () => {
    // Client-side sanity: every number finite, cost ≥ 0, MOQ ≥ 0, multiple > 0.
    for (const d of drafts) {
      const cost = Number(d.costPrice)
      const moq = Number(d.minOrderQty)
      const mult = Number(d.orderMultiple)
      if (!Number.isFinite(cost) || cost < 0) return void toast.error(`Invalid cost price for ${d.sku}`, { description: 'Must be a number ≥ 0.' })
      if (!Number.isFinite(moq) || moq < 0) return void toast.error(`Invalid min order qty for ${d.sku}`, { description: 'Must be a number ≥ 0.' })
      if (!Number.isFinite(mult) || mult <= 0) return void toast.error(`Invalid order multiple for ${d.sku}`, { description: 'Must be a positive number (e.g. 25).' })
    }
    setSavingTerms(true)
    try {
      await api.patch(`/api/suppliers/${supplierId}`, {
        links: drafts.map((d) => ({
          productId: d.productId,
          costPrice: Number(d.costPrice),
          minOrderQty: Number(d.minOrderQty),
          orderMultiple: Number(d.orderMultiple),
          preferred: d.preferred,
        })),
      })
      toast.success('Link terms saved', {
        description: 'Reorder suggestions will use these on next refresh.',
      })
      invalidateAll()
      setEditTerms(false)
    } catch (err) {
      toast.error('Could not save link terms', {
        description: err instanceof Error ? err.message : 'Unexpected error',
      })
    } finally {
      setSavingTerms(false)
    }
  }

  const onDelete = async () => {
    if (!supplier) return
    setDeleting(true)
    try {
      await api.delete(`/api/suppliers/${supplierId}`)
      toast.success(`Supplier ${supplier.name} deleted`, {
        description: 'The vendor was removed from the directory.',
      })
      invalidateAll()
      onClose()
    } catch (err) {
      // 409s from the API carry the exact reason (linked products / receipt history).
      toast.error('Could not delete supplier', {
        description: err instanceof Error ? err.message : 'Unexpected error',
      })
    } finally {
      setDeleting(false)
    }
  }

  const preferredCount = supplier?.products.filter((p) => p.preferred).length ?? 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-h-[88vh] max-w-3xl overflow-y-auto">
        {query.isPending && (
          <div className="space-y-4" aria-busy="true" aria-label="Loading supplier">
            <DialogTitle className="sr-only">Loading supplier</DialogTitle>
            <Skeleton className="h-10 w-1/2" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-48" />
          </div>
        )}

        {query.isError && (
          <>
            <DialogTitle className="sr-only">Couldn't load this supplier</DialogTitle>
            <EmptyState
              icon={Building2}
              title="Couldn't load this supplier"
              description={query.error instanceof Error ? query.error.message : 'Try again in a moment.'}
              action={
                <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                  <RotateCcw className="size-3.5" aria-hidden="true" /> Retry
                </Button>
              }
            />
          </>
        )}

        {supplier && (
          <div className="space-y-5">
            {/* Header */}
            <DialogHeader className="space-y-1.5">
              <DialogTitle asChild>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold tracking-tight">{supplier.name}</span>
                  {preferredCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                      Preferred for {preferredCount} {preferredCount === 1 ? 'SKU' : 'SKUs'}
                    </span>
                  )}
                </div>
              </DialogTitle>
              {supplier.contact ? (
                <p className="text-sm text-muted-foreground">{supplier.contact}</p>
              ) : (
                <p className="text-sm text-muted-foreground/70">No contact on file</p>
              )}
              {supplier.notes && <p className="text-sm italic text-muted-foreground">{supplier.notes}</p>}
            </DialogHeader>

            {/* Stat tiles */}
            <section aria-label="Supplier stats" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile
                label="Lead time"
                value={`${supplier.leadTimeDays} ${supplier.leadTimeDays === 1 ? 'day' : 'days'}`}
                caption="PO → dock"
              />
              <StatTile
                label="Reliability"
                value={`${Math.round(supplier.reliability * 100)}%`}
                valueClass={
                  supplier.reliability >= 0.95
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : supplier.reliability >= 0.85
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
                }
                caption="on-time arrivals"
              />
              <StatTile
                label="Damage rate"
                value={`${(supplier.damageRate * 100).toFixed(1)}%`}
                valueClass={supplier.damageRate > 0.02 ? 'text-red-600 dark:text-red-400' : undefined}
                caption="of received goods"
              />
              <StatTile label="Products linked" value={String(supplier.productCount)} caption="SKUs sourced here" />
              <StatTile label="Preferred for" value={String(preferredCount)} caption="of those SKUs" />
            </section>

            {/* Product links with order economics */}
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <Truck className="size-4 text-primary" aria-hidden="true" /> Product links &amp; order terms
                  </span>
                  {canConfigure && supplier.products.length > 0 && (
                    <div className="flex items-center gap-2">
                      {editTerms ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setEditTerms(false)} disabled={savingTerms}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={() => void onSaveTerms()} disabled={savingTerms}>
                            {savingTerms && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                            {savingTerms ? 'Saving…' : 'Save terms'}
                          </Button>
                        </>
                      ) : (
                        <Button variant="outline" size="sm" onClick={startEditTerms}>
                          <PencilLine className="size-3.5" aria-hidden="true" /> Edit link terms
                        </Button>
                      )}
                    </div>
                  )}
                </CardTitle>
                <CardDescription>
                  MOQ and order multiple round every reorder suggestion for these SKUs — a product has at
                  most one preferred supplier.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                {supplier.products.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No products linked to this supplier yet — link them when creating or editing a product.
                  </p>
                ) : editTerms ? (
                  /* Edit mode: one compact form row per link */
                  <ul className="space-y-2">
                    {drafts.map((d) => (
                      <li
                        key={d.productId}
                        className="grid items-end gap-2 rounded-lg border px-3 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]">
                        <div className="min-w-0">
                          <span className="font-mono text-xs font-medium">{d.sku}</span>
                          <p className="truncate text-[11px] text-muted-foreground" title={d.productName}>
                            {d.productName}
                          </p>
                        </div>
                        <label className="block">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cost / {d.unit}</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="mt-0.5 h-8 tabular"
                            aria-label={`Cost price for ${d.sku}`}
                            value={d.costPrice}
                            onChange={(e) => patchDraft(d.productId, { costPrice: e.target.value })}
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">MOQ</span>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            className="mt-0.5 h-8 tabular"
                            aria-label={`Minimum order qty for ${d.sku}`}
                            value={d.minOrderQty}
                            onChange={(e) => patchDraft(d.productId, { minOrderQty: e.target.value })}
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">× Multiple</span>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            className="mt-0.5 h-8 tabular"
                            aria-label={`Order multiple for ${d.sku}`}
                            value={d.orderMultiple}
                            onChange={(e) => patchDraft(d.productId, { orderMultiple: e.target.value })}
                          />
                        </label>
                        <label className="flex items-center gap-2 pb-1.5 sm:justify-self-end">
                          <Switch
                            checked={d.preferred}
                            onCheckedChange={(v) => patchDraft(d.productId, { preferred: v })}
                            aria-label={`Mark ${supplier.name} as preferred supplier for ${d.sku}`}
                          />
                          <span className="text-[11px] font-medium text-muted-foreground">Preferred</span>
                        </label>
                      </li>
                    ))}
                    <li>
                      <Button size="sm" onClick={() => void onSaveTerms()} disabled={savingTerms} className="w-full sm:w-auto">
                        {savingTerms && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                        {savingTerms ? 'Saving…' : 'Save terms'}
                      </Button>
                    </li>
                  </ul>
                ) : (
                  /* Read mode: compact links table */
                  <div className="overflow-x-auto">
                    <Table className="min-w-[34rem]">
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="pl-3">SKU</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">MOQ</TableHead>
                          <TableHead className="text-right">×Multiple</TableHead>
                          <TableHead className="pr-3 text-right">Preferred</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplier.products.map((p) => (
                          <TableRow key={p.productId}>
                            <TableCell className="pl-3 font-mono text-xs">{p.sku}</TableCell>
                            <TableCell className="max-w-52 truncate text-xs" title={p.productName}>
                              {p.productName}
                            </TableCell>
                            <TableCell className="text-right tabular">{fmtUSD(p.costPrice, 2)}<span className="ml-1 text-[10px] text-muted-foreground">/{p.unit}</span></TableCell>
                            <TableCell className="text-right tabular">{fmtQty(p.minOrderQty)}</TableCell>
                            <TableCell className="text-right tabular">×{fmtQty(p.orderMultiple)}</TableCell>
                            <TableCell className="pr-3 text-right">
                              {p.preferred ? (
                                <Star className="ml-auto size-4 fill-amber-400 text-amber-400" aria-label="Preferred supplier" />
                              ) : (
                                <Star className="ml-auto size-4 text-muted-foreground/30" aria-hidden="true" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Footer actions */}
            {canConfigure && (
              <DialogFooter className="items-center gap-2 sm:justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setEditOpen(true)}>
                    <PencilLine className="size-4" aria-hidden="true" /> Edit supplier
                  </Button>
                  {supplier.productCount === 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={deleting}>
                          {deleting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                          {deleting ? 'Deleting…' : 'Delete supplier'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {supplier.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the vendor from the directory. Suppliers with receipt history
                            are kept for audit integrity — this one has no product links, so it can be
                            deleted only if it has never appeared on a receipt.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep supplier</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => void onDelete()}
                          >
                            Delete supplier
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
                  {supplier.productCount > 0
                    ? 'Remove the product links before this supplier can be deleted.'
                    : 'No product links — deletable unless receipts reference it.'}
                </p>
              </DialogFooter>
            )}
          </div>
        )}
      </DialogContent>

      {/* Edit dialog stacked on top of the detail dialog */}
      {supplier && (
        <SupplierFormDialog open={editOpen} onOpenChange={setEditOpen} supplier={supplier} />
      )}
    </Dialog>
  )
}
