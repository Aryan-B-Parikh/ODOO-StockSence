'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, ClipboardCheck, ListOrdered, Loader2, PackageCheck, Route, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { fmtDateTime } from '@/lib/format'
import type { DeliveryDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { DelCodeChip, StateStepper } from './bits'

type DeliveryAction = 'pick' | 'pack' | 'deliver' | 'cancel'

const ACTION_TOAST: Record<DeliveryAction, (code: string) => string> = {
  pick: (code) => `${code} marked picked — units are flagged for picking`,
  pack: (code) => `${code} marked packed — reserved units left the warehouse`,
  deliver: (code) => `${code} marked delivered — order complete`,
  cancel: (code) => `${code} cancelled — reserved stock returned to available`,
}

/** Delivery detail dialog — full pipeline visual, lines, and gated state actions. */
export function DeliveryDetailDialog({
  delivery,
  open,
  onOpenChange,
  onUpdated,
}: {
  delivery: DeliveryDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (delivery: DeliveryDTO) => void
}) {
  const qc = useQueryClient()
  const canPick = useAuthStore((s) => s.user?.permissions.includes('pick') ?? false)
  const canPack = useAuthStore((s) => s.user?.permissions.includes('pack') ?? false)

  const act = useMutation({
    mutationFn: async (action: DeliveryAction) => {
      if (!delivery) throw new Error('No delivery selected')
      return api.post<{ delivery: DeliveryDTO }>(`/api/deliveries/${delivery.id}/${action}`)
    },
    onSuccess: (res, action) => {
      onUpdated(res.delivery)
      toast.success(ACTION_TOAST[action](res.delivery.code))
      for (const key of ['deliveries', 'products', 'dashboard']) {
        void qc.invalidateQueries({ queryKey: [key] })
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Action failed'),
  })

  // ── Pick-path sorting (Phase 2) ───────────────────────────────────────────
  // A picker walks the warehouse in shelf order, not line order. Default ON
  // while picking is in progress (RESERVED/PICKED); the toggle is a per-session
  // local override that resets when a different delivery is opened.
  const [sortOverride, setSortOverride] = useState<{ deliveryId: number; value: boolean } | null>(null)
  const pickPathDefault = delivery?.status === 'RESERVED' || delivery?.status === 'PICKED'
  const pickPath = delivery && sortOverride?.deliveryId === delivery.id ? sortOverride.value : pickPathDefault
  const setPickPath = (value: boolean) => {
    if (delivery) setSortOverride({ deliveryId: delivery.id, value })
  }

  // Numeric, case-insensitive collation → "A1 · S1" < "A1 · S10" < "A2 · S1" sorts naturally.
  const pathCollator = useMemo(() => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }), [])
  const sortedLines = useMemo(() => {
    const list = delivery?.lines ?? []
    if (!pickPath) return list
    return [...list].sort((a, b) => pathCollator.compare(a.locationPath, b.locationPath))
  }, [delivery, pickPath, pathCollator])

  if (!delivery) return null

  const status = delivery.status
  const showPick = status === 'RESERVED' && canPick
  const showPack = (status === 'RESERVED' || status === 'PICKED') && canPack
  const showDeliver = status === 'PACKED'
  const showCancel = (status === 'RESERVED' || status === 'PICKED') && canPick
  const hasActions = showPick || showPack || showDeliver || showCancel
  const pending = act.isPending

  const timestamps = [delivery.createdAt, delivery.pickedAt, delivery.packedAt, delivery.deliveredAt]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <DelCodeChip code={delivery.code} />
            <span className="truncate">{delivery.customer}</span>
          </DialogTitle>
          <DialogDescription>
            Customer delivery order · created {fmtDateTime(delivery.createdAt)} · {delivery.lines.length}{' '}
            {delivery.lines.length === 1 ? 'line' : 'lines'}
          </DialogDescription>
        </DialogHeader>

        {/* Big state-pipeline visual with per-state timestamps */}
        <div className="overflow-x-auto rounded-lg border bg-muted/30 px-2 py-4">
          <div className="flex min-w-[26rem] justify-center">
            <StateStepper status={delivery.status} size="lg" timestamps={timestamps} />
          </div>
        </div>

        {delivery.note && (
          <p className="rounded-lg border-l-2 border-stone-300 bg-muted/40 px-3 py-2 text-sm text-muted-foreground italic">
            “{delivery.note}”
          </p>
        )}

        {/* Lines — pick-path sorted by default while picking (walk the racks in order) */}
        <div className="overflow-hidden rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b bg-muted/40 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-xs font-semibold">Lines</span>
              {pickPath && (
                <span className="truncate text-[11px] font-medium text-teal-700 dark:text-teal-400">
                  shelf-path order
                </span>
              )}
            </div>
            <div
              role="group"
              aria-label="Line sort order"
              className="flex items-center gap-0.5 rounded-lg border bg-background p-0.5"
            >
              <button
                type="button"
                onClick={() => setPickPath(true)}
                aria-pressed={pickPath}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1',
                  pickPath
                    ? 'bg-teal-500/15 text-teal-700 dark:text-teal-400'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Route className="size-3.5" aria-hidden="true" /> Pick path
              </button>
              <button
                type="button"
                onClick={() => setPickPath(false)}
                aria-pressed={!pickPath}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1',
                  !pickPath
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <ListOrdered className="size-3.5" aria-hidden="true" /> Line order
              </button>
            </div>
          </div>
          <Table className={pickPath ? 'min-w-[32rem]' : undefined}>
            <TableHeader>
              <TableRow>
                {pickPath && (
                  <TableHead className="w-12 text-center">
                    Path
                    <span className="sr-only"> — walk order</span>
                  </TableHead>
                )}
                <TableHead>Product</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Picked</TableHead>
                <TableHead className="text-right">Available</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedLines.map((line, i) => {
                const short = line.qty > line.availableAtLocation
                return (
                  <TableRow key={line.id}>
                    {pickPath && (
                      <TableCell className="text-center">
                        <span
                          aria-label={`Stop ${i + 1} on the pick path`}
                          className="inline-flex size-5 items-center justify-center rounded-full border border-teal-500/40 bg-teal-500/10 font-mono text-[10px] font-semibold text-teal-700 tabular dark:text-teal-400"
                        >
                          {i + 1}
                        </span>
                      </TableCell>
                    )}
                    <TableCell>
                      <span className="font-mono text-xs font-medium">{line.sku}</span>
                      <span className="block text-xs text-muted-foreground">{line.productName}</span>
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-xs text-muted-foreground" title={line.locationPath}>
                      {line.locationPath}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {line.qty} {line.unit}
                    </TableCell>
                    <TableCell className="text-right tabular">{line.pickedQty ?? '—'}</TableCell>
                    <TableCell className={cn('text-right tabular', short && 'font-medium text-amber-600')}>
                      {line.availableAtLocation}
                      {short && <span className="ml-1 whitespace-nowrap">⚠ short</span>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {/* State actions — each gated by status AND permission */}
        {hasActions && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {showCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-stone-300 text-stone-600 hover:bg-stone-100 hover:text-stone-700 dark:border-stone-500/40 dark:text-stone-300 dark:hover:bg-stone-500/10"
                    disabled={pending}
                  >
                    <Ban className="size-4" aria-hidden="true" /> Cancel order
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel {delivery.code}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cancelling releases the reserved units back to available — no stock leaves the warehouse and the
                      order can no longer progress.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep order</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-stone-600 text-white hover:bg-stone-700"
                      onClick={() => act.mutate('cancel')}
                    >
                      Cancel order
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {showDeliver && (
              <Button onClick={() => act.mutate('deliver')} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Truck className="size-4" aria-hidden="true" />}
                Mark delivered
              </Button>
            )}

            {showPack && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="bg-amber-700 text-white hover:bg-amber-800" disabled={pending}>
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <PackageCheck className="size-4" aria-hidden="true" />
                    )}
                    Mark packed — stock leaves warehouse
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Pack {delivery.code}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Packing deducts the reserved units from on-hand — they physically leave the warehouse. This can’t
                      be undone, but the order can still be marked delivered afterwards.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Not yet</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-amber-700 text-white hover:bg-amber-800"
                      onClick={() => act.mutate('pack')}
                    >
                      Pack order
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {showPick && (
              <Button onClick={() => act.mutate('pick')} disabled={pending}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ClipboardCheck className="size-4" aria-hidden="true" />
                )}
                Mark picked
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
