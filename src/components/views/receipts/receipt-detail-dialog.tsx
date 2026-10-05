'use client'

import { useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays, CircleCheck, Loader2, PackageOpen, ShieldAlert, StickyNote, XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DocCodeChip, StatusBadge } from '@/components/shared'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { deltaColor, fmtDate, fmtQty, fmtSignedQty, timeAgo } from '@/lib/format'
import type { ReceiptDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

interface LineInput {
  receivedQty: string
  damagedQty: string
}

function initialLineInputs(receipt: ReceiptDTO): Record<number, LineInput> {
  return Object.fromEntries(
    receipt.lines.map((l) => [l.id, { receivedQty: String(l.expectedQty), damagedQty: '' }])
  )
}

/**
 * Receipt detail: lines with expected vs received (variance), plus the inline
 * receive form for EXPECTED receipts (permission: receive) and cancel with
 * confirmation. Receiving converts incoming → on-hand (good) / damaged.
 */
export function ReceiptDetailDialog({
  receipt,
  open,
  onClose,
}: {
  receipt: ReceiptDTO
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const permissions = useAuthStore((s) => s.user?.permissions)
  const canReceive = permissions?.includes('receive') ?? false

  const [lineInputs, setLineInputs] = useState<Record<number, LineInput>>(() => initialLineInputs(receipt))
  const [note, setNote] = useState('')
  const [receiving, setReceiving] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const isExpected = receipt.status === 'EXPECTED'
  const isLate = receipt.status === 'EXPECTED' && receipt.daysLate > 0

  const setLineInput = (lineId: number, patch: Partial<LineInput>) => {
    setLineInputs((prev) => ({
      ...prev,
      [lineId]: {
        ...(prev[lineId] ?? { receivedQty: '', damagedQty: '' }),
        ...patch,
      },
    }))
  }

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['receipts'] })
    void queryClient.invalidateQueries({ queryKey: ['products'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    void queryClient.invalidateQueries({ queryKey: ['ledger'] })
    void queryClient.invalidateQueries({ queryKey: ['meta'] })
    void queryClient.invalidateQueries({ queryKey: ['attention'] })
  }

  const onReceive = async () => {
    // Validate: every line needs a received qty; damaged ≤ received.
    for (const line of receipt.lines) {
      const input = lineInputs[line.id]
      const received = Number(input?.receivedQty)
      const damaged = Number(input?.damagedQty === '' ? 0 : input?.damagedQty)
      if (input == null || input.receivedQty.trim() === '' || !Number.isFinite(received) || received < 0) {
        toast.error(`Enter a received quantity for ${line.sku}`)
        return
      }
      if (!Number.isFinite(damaged) || damaged < 0) {
        toast.error(`Damaged quantity for ${line.sku} must be ≥ 0`)
        return
      }
      if (damaged > received) {
        toast.error(`Damaged units for ${line.sku} can't exceed the received quantity`)
        return
      }
    }

    setReceiving(true)
    try {
      await api.post(`/api/receipts/${receipt.id}/receive`, {
        lines: receipt.lines.map((line) => {
          const input = lineInputs[line.id]
          return {
            lineId: line.id,
            receivedQty: Number(input.receivedQty),
            damagedQty: Number(input.damagedQty === '' ? 0 : input.damagedQty),
          }
        }),
        note: note.trim() || undefined,
      })
      toast.success(`Receipt ${receipt.code} received — stock is now available`)
      invalidateAll()
      // Keep the dialog open: it now shows the RECEIVED state with variances.
    } catch (err) {
      toast.error('Could not receive stock', {
        description: err instanceof Error ? err.message : 'Unexpected error',
      })
    } finally {
      setReceiving(false)
    }
  }

  const onCancel = async () => {
    setCancelling(true)
    try {
      await api.post(`/api/receipts/${receipt.id}/cancel`)
      toast.success(`Receipt ${receipt.code} cancelled`, {
        description: 'The incoming expectation was released — expected stock will not arrive.',
      })
      invalidateAll()
    } catch (err) {
      toast.error('Could not cancel receipt', {
        description: err instanceof Error ? err.message : 'Unexpected error',
      })
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[90vh] overflow-y-auto"
        style={{ width: 'min(42rem, calc(100vw - 2rem))', maxWidth: 'none' }}
      >
        <DialogHeader className="space-y-2">
          <DialogTitle asChild>
            <div className="flex flex-wrap items-center gap-2">
              <DocCodeChip docType="RECEIPT" code={receipt.code} className="px-2 py-1 text-xs" />
              <StatusBadge status={receipt.status} />
              {isLate && (
                <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400">
                  {receipt.daysLate} days late
                </span>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="text-sm font-medium text-foreground">
            {receipt.supplierName ?? 'No supplier'} · {receipt.warehouseName}
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" aria-hidden="true" /> Expected {fmtDate(receipt.expectedAt)}
            </span>
            {receipt.receivedAt && (
              <span className="inline-flex items-center gap-1">
                <CircleCheck className="size-3 text-emerald-600" aria-hidden="true" /> Received {fmtDate(receipt.receivedAt)}
              </span>
            )}
            <span>Created {timeAgo(receipt.createdAt)}</span>
          </div>
          {receipt.note && (
            <p className="flex items-start gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
              <StickyNote className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              <span className="italic">{receipt.note}</span>
            </p>
          )}
        </DialogHeader>

        {/* Lines — stacked cards on mobile, table on sm+ */}
        <section aria-label="Receipt lines" className="min-w-0">
          <ul className="space-y-2 md:hidden">
            {receipt.lines.map((line) => {
              const variance =
                line.receivedQty != null ? line.receivedQty - line.expectedQty : null
              return (
                <li key={line.id} className="rounded-lg border px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-medium">{line.sku}</div>
                      <div className="truncate text-[11px] text-muted-foreground" title={line.productName}>
                        {line.productName}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{line.locationPath}</div>
                    </div>
                    {variance != null ? (
                      <span className={cn('shrink-0 text-xs font-semibold tabular', deltaColor(variance))}>
                        {fmtSignedQty(variance, line.unit)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[11px] text-muted-foreground/60">pending</span>
                    )}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expected</dt>
                      <dd className="tabular">{fmtQty(line.expectedQty, line.unit)}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Received</dt>
                      <dd className="tabular">
                        {line.receivedQty != null ? (
                          <span>
                            {fmtQty(line.receivedQty, line.unit)}
                            {line.damagedQty != null && line.damagedQty > 0 && (
                              <span className="ml-1 text-[10px] font-normal text-red-600 dark:text-red-400">
                                incl. {fmtQty(line.damagedQty, line.unit)} damaged
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </li>
              )
            })}
          </ul>
          <div className="hidden min-w-0 overflow-hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="pl-3">Product</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="pr-3 text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipt.lines.map((line) => {
                  const variance =
                    line.receivedQty != null ? line.receivedQty - line.expectedQty : null
                  return (
                    <TableRow key={line.id}>
                      <TableCell className="pl-3">
                        <div className="font-mono text-xs font-medium">{line.sku}</div>
                        <div className="max-w-48 truncate text-[11px] text-muted-foreground" title={line.productName}>
                          {line.productName}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {line.locationPath}
                      </TableCell>
                      <TableCell className="text-right tabular">{fmtQty(line.expectedQty, line.unit)}</TableCell>
                      <TableCell className="text-right tabular">
                        {line.receivedQty != null ? (
                          <span>
                            {fmtQty(line.receivedQty, line.unit)}
                            {line.damagedQty != null && line.damagedQty > 0 && (
                              <span className="block text-[10px] text-red-600 dark:text-red-400">
                                incl. {fmtQty(line.damagedQty, line.unit)} damaged
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-3 text-right">
                        {variance != null ? (
                          <span className={cn('text-xs font-semibold tabular', deltaColor(variance))}>
                            {fmtSignedQty(variance, line.unit)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">pending</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Inline receive form */}
        {isExpected && canReceive && (
          <section
            aria-label="Receive stock"
            className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-3"
          >
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <PackageOpen className="size-4 text-primary" aria-hidden="true" /> Receive stock
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Enter what actually arrived. Good units become available; damaged units are separated out and never
                become available.
              </p>
            </div>

            <div className="space-y-2">
              <div className="hidden items-center gap-2 px-0.5 sm:flex">
                <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Line
                </span>
                <span className="w-24 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Received
                </span>
                <span className="w-24 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Damaged
                </span>
              </div>
              {receipt.lines.map((line) => (
                <div
                  key={line.id}
                  className="flex flex-col gap-2 rounded-md border bg-card px-2.5 py-2 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-medium">{line.sku}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      expected {fmtQty(line.expectedQty, line.unit)} · {line.locationPath}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 sm:w-24 sm:flex-none">
                      <Label htmlFor={`recv-${line.id}`} className="sr-only">
                        Received quantity for {line.sku}
                      </Label>
                      <Input
                        id={`recv-${line.id}`}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="numeric"
                        className="h-8 tabular"
                        value={lineInputs[line.id]?.receivedQty ?? ''}
                        onChange={(e) => setLineInput(line.id, { receivedQty: e.target.value })}
                      />
                    </div>
                    <div className="flex-1 sm:w-24 sm:flex-none">
                      <Label htmlFor={`dmg-${line.id}`} className="sr-only">
                        Damaged quantity for {line.sku}
                      </Label>
                      <Input
                        id={`dmg-${line.id}`}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="numeric"
                        placeholder="0"
                        className="h-8 tabular"
                        value={lineInputs[line.id]?.damagedQty ?? ''}
                        onChange={(e) => setLineInput(line.id, { damagedQty: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <Label htmlFor="receive-note" className="text-xs font-medium">
                Note (optional)
              </Label>
              <Input
                id="receive-note"
                placeholder="e.g. 2 cartons crushed — carrier notified"
                className="mt-1"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                A ledger entry is written for every quantity change — nothing moves untracked.
              </p>
              <Button onClick={() => void onReceive()} disabled={receiving}>
                {receiving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <PackageOpen className="size-4" aria-hidden="true" />
                )}
                {receiving ? 'Receiving…' : 'Receive stock'}
              </Button>
            </div>
          </section>
        )}

        {isExpected && !canReceive && (
          <p className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
            You don't have permission to receive stock — ask a warehouse operator.
          </p>
        )}

        <Separator />

        <DialogFooter className="sm:justify-between">
          {isExpected && canReceive ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={cancelling}>
                  <XCircle className="size-4" aria-hidden="true" />
                  {cancelling ? 'Cancelling…' : 'Cancel receipt'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel receipt {receipt.code}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This releases the incoming expectation of{' '}
                    {receipt.lines.length === 1
                      ? `${fmtQty(receipt.lines[0].expectedQty, receipt.lines[0].unit)} of ${receipt.lines[0].sku}`
                      : `${receipt.lines.length} lines`}
                    . The stock will never arrive and the cancellation is written to the ledger.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep expecting</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void onCancel()}
                  >
                    Cancel receipt
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span />
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
