'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ArrowLeftRight, Ban, CheckCircle2, Loader2 } from 'lucide-react'
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
import type { TransferDTO } from '@/lib/types'
import { useAuthStore } from '@/stores/auth-store'

import { TransferStatusBadge, TrfCodeChip } from './bits'

type TransferAction = 'receive' | 'cancel'

const ACTION_TOAST: Record<TransferAction, (code: string) => string> = {
  receive: (code) => `${code} received — in-transit units are now on-hand at the destination`,
  cancel: (code) => `${code} cancelled — in-transit units returned to source on-hand`,
}

/** Transfer detail dialog — routes, lines, and receive/cancel actions. */
export function TransferDetailDialog({
  transfer,
  open,
  onOpenChange,
  onUpdated,
}: {
  transfer: TransferDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (transfer: TransferDTO) => void
}) {
  const qc = useQueryClient()
  const canTransfer = useAuthStore((s) => s.user?.permissions.includes('transfer') ?? false)

  const act = useMutation({
    mutationFn: async (action: TransferAction) => {
      if (!transfer) throw new Error('No transfer selected')
      return api.post<{ transfer: TransferDTO }>(`/api/transfers/${transfer.id}/${action}`)
    },
    onSuccess: (res, action) => {
      onUpdated(res.transfer)
      toast.success(ACTION_TOAST[action](res.transfer.code))
      for (const key of ['transfers', 'products', 'dashboard']) {
        void qc.invalidateQueries({ queryKey: [key] })
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Action failed'),
  })

  if (!transfer) return null

  const inTransit = transfer.status === 'IN_TRANSIT'
  const canAct = inTransit && canTransfer
  const pending = act.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <TrfCodeChip code={transfer.code} />
            Internal transfer
          </DialogTitle>
          <DialogDescription>
            Shipped {fmtDateTime(transfer.shippedAt)}
            {transfer.receivedAt ? ` · received ${fmtDateTime(transfer.receivedAt)}` : ' · in transit'}
          </DialogDescription>
        </DialogHeader>

        {/* Route */}
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">From (source)</p>
              <p className="mt-0.5 truncate text-sm font-medium" title={transfer.fromLocationPath}>
                {transfer.fromLocationPath}
              </p>
            </div>
            <ArrowRight className="size-5 shrink-0 self-start text-primary sm:self-center" aria-hidden="true" />
            <div className="min-w-0 flex-1 sm:text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">To (destination)</p>
              <p className="mt-0.5 truncate text-sm font-medium" title={transfer.toLocationPath}>
                {transfer.toLocationPath}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <TransferStatusBadge status={transfer.status} />
            <span className="text-xs text-muted-foreground">
              {transfer.lines.length} {transfer.lines.length === 1 ? 'line' : 'lines'} ·{' '}
              {transfer.lines.reduce((sum, l) => sum + l.qty, 0)} units
            </span>
          </div>
        </div>

        {transfer.note && (
          <p className="rounded-lg border-l-2 border-teal-400 bg-muted/40 px-3 py-2 text-sm text-muted-foreground italic">
            “{transfer.note}”
          </p>
        )}

        {/* Lines */}
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Available at source now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfer.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <span className="font-mono text-xs font-medium">{line.sku}</span>
                    <span className="block text-xs text-muted-foreground">{line.productName}</span>
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {line.qty} {line.unit}
                  </TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">{line.availableAtSource}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Actions */}
        {canAct && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-stone-300 text-stone-600 hover:bg-stone-100 hover:text-stone-700 dark:border-stone-500/40 dark:text-stone-300 dark:hover:bg-stone-500/10"
                  disabled={pending}
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Ban className="size-4" aria-hidden="true" />
                  )}
                  Cancel &amp; return to source
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel {transfer.code}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The in-transit units will be returned to on-hand at the source location. The destination never sees
                    them.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep transfer</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-stone-600 text-white hover:bg-stone-700"
                    onClick={() => act.mutate('cancel')}
                  >
                    Cancel &amp; return
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-emerald-700 text-white hover:bg-emerald-800" disabled={pending}>
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ArrowLeftRight className="size-4" aria-hidden="true" />
                  )}
                  Receive at destination
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Receive {transfer.code}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Receiving moves the in-transit units to on-hand at the destination — they become available.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Not yet</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-emerald-700 text-white hover:bg-emerald-800"
                    onClick={() => act.mutate('receive')}
                  >
                    <CheckCircle2 className="size-4" aria-hidden="true" /> Receive transfer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
