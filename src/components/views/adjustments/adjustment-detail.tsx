'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Ban, CheckCircle2, Loader2 } from 'lucide-react'
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
import { deltaColor, fmtDateTime, fmtSignedQty } from '@/lib/format'
import type { AdjustmentDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { AdjCodeChip, AdjStatusBadge, ExplanationBanner, SeverityBadge } from './bits'

type AdjAction = 'approve' | 'reject'

const ACTION_TOAST: Record<AdjAction, (code: string) => string> = {
  approve: (code) => `${code} approved — stock change posted to the ledger`,
  reject: (code) => `${code} rejected — no stock was changed`,
}

/** Adjustment detail dialog — reason, severity routing, counted deltas, approve/reject. */
export function AdjustmentDetailDialog({
  adjustment,
  open,
  onOpenChange,
  onUpdated,
}: {
  adjustment: AdjustmentDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (adjustment: AdjustmentDTO) => void
}) {
  const qc = useQueryClient()
  const canApprove = useAuthStore((s) => s.user?.permissions.includes('approve-adjustment') ?? false)

  const act = useMutation({
    mutationFn: async (action: AdjAction) => {
      if (!adjustment) throw new Error('No adjustment selected')
      return api.post<{ adjustment: AdjustmentDTO }>(`/api/adjustments/${adjustment.id}/${action}`)
    },
    onSuccess: (res, action) => {
      onUpdated(res.adjustment)
      toast.success(ACTION_TOAST[action](res.adjustment.code))
      for (const key of ['adjustments', 'products', 'dashboard']) {
        void qc.invalidateQueries({ queryKey: [key] })
      }
    },
    // Also surfaces the 422 "stock has changed since creation" message from approve.
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Action failed'),
  })

  if (!adjustment) return null

  const pendingApproval = adjustment.status === 'PENDING_APPROVAL'
  const canAct = pendingApproval && canApprove
  const pending = act.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <AdjCodeChip code={adjustment.code} />
            <span className="min-w-0 flex-1 truncate">{adjustment.reason}</span>
          </DialogTitle>
          <DialogDescription>
            Stock adjustment · created {fmtDateTime(adjustment.createdAt)}
            {adjustment.createdByName ? ` by ${adjustment.createdByName}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={adjustment.severity} />
          <AdjStatusBadge status={adjustment.status} />
          {adjustment.approvedByName && (
            <span className="text-xs text-muted-foreground">
              {adjustment.status === 'REJECTED' ? 'Rejected' : 'Approved'} by {adjustment.approvedByName}
            </span>
          )}
        </div>

        {/* Severity + status explanation */}
        <ExplanationBanner adj={adjustment} />

        {adjustment.note && (
          <p className="rounded-lg border-l-2 border-amber-400 bg-muted/40 px-3 py-2 text-sm text-muted-foreground italic">
            “{adjustment.note}”
          </p>
        )}

        {/* Lines: system → counted with signed delta */}
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">System → Counted</TableHead>
                <TableHead className="text-right">Delta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustment.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <span className="font-mono text-xs font-medium">{line.sku}</span>
                    <span className="block text-xs text-muted-foreground">{line.productName}</span>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-xs text-muted-foreground" title={line.locationPath}>
                    {line.locationPath}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    <span className="text-muted-foreground">{line.systemQty}</span>
                    <ArrowRight className="mx-1 inline size-3 text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium">{line.countedQty}</span>
                  </TableCell>
                  <TableCell className={cn('text-right font-semibold tabular', deltaColor(line.delta))}>
                    {line.delta === 0 ? '±0' : fmtSignedQty(line.delta, line.unit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {adjustment.postedAt && (
          <p className="text-xs text-muted-foreground">Posted to the ledger {fmtDateTime(adjustment.postedAt)}</p>
        )}

        {/* Approval actions — PENDING_APPROVAL + 'approve-adjustment' permission */}
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
                  Reject
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reject {adjustment.code}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Rejecting discards the counted values — system quantities stay exactly as they are.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep pending</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-stone-600 text-white hover:bg-stone-700"
                    onClick={() => act.mutate('reject')}
                  >
                    Reject adjustment
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={pending}>
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  )}
                  Approve &amp; post
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Approve {adjustment.code}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Approving posts this stock change to the ledger immediately. If stock has moved since the count,
                    approval will be blocked and the reason shown.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Not yet</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => act.mutate('approve')}
                  >
                    Approve &amp; post
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
