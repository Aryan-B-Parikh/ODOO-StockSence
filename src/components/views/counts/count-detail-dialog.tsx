'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Printer, ScanLine } from 'lucide-react'
import { useState } from 'react'
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
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { deltaColor, fmtSignedQty } from '@/lib/format'
import { enqueueableMutation } from '@/lib/offline-replay'
import type { CycleCountDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { useCountSheetPrint } from './count-sheet-print'

interface CountSubmitResponse {
  count: CycleCountDTO
  adjustment: { code: string; severity: string; status: string; explanation: string } | null
}

/**
 * Detail dialog for an OPEN count — enter the physical tally per line,
 * then submit. The engine turns any real variance into an adjustment
 * (through the severity engine); a clean count posts nothing.
 *
 * The form state lives inside DialogContent on purpose: Radix unmounts the
 * content when the dialog closes, so every open starts with a fresh form.
 */
export function CountDetailDialog({
  count,
  open,
  onOpenChange,
}: {
  count: CycleCountDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {count && <CountForm key={count.id} count={count} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function CountForm({ count, onDone }: { count: CycleCountDTO; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<number, string>>({})
  const [note, setNote] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [blindCount, setBlindCount] = useState(false)
  const sheetPrint = useCountSheetPrint()

  const permissions = useAuthStore((s) => s.user?.permissions ?? [])
  const canCount = permissions.includes('count')

  const submitMutation = useMutation({
    // Offline-aware (Phase 2): an OfflineError (airplane-mode simulation or a
    // real network drop) parks the submission in the device queue instead of
    // failing — the replay engine syncs it and refreshes data on reconnect.
    mutationFn: (payload: { lines: { lineId: number; countedQty: number }[]; note?: string }) =>
      enqueueableMutation({
        label: `Count ${count.code} submission (${payload.lines.length} ${
          payload.lines.length === 1 ? 'line' : 'lines'
        })`,
        method: 'POST',
        path: `/api/counts/${count.id}/submit`,
        body: payload,
        submit: () => api.post<CountSubmitResponse>(`/api/counts/${count.id}/submit`, payload),
      }),
    onSuccess: (res) => {
      if (res.queued) {
        // Saved offline — no server response yet: close the dialog, skip
        // the toasts/invalidations (the replay engine refreshes after sync).
        onDone()
        return
      }
      const { adjustment } = res.data
      if (adjustment) {
        toast.warning(
          `⚠ Variance found — adjustment ${adjustment.code} created (${adjustment.severity}): ${adjustment.explanation}`,
          { duration: 10_000 }
        )
      } else {
        toast.success('Count clean — no adjustment opened')
      }
      void queryClient.invalidateQueries({ queryKey: ['counts'] })
      void queryClient.invalidateQueries({ queryKey: ['adjustments'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onDone()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.post<{ count: CycleCountDTO }>(`/api/counts/${count.id}/cancel`),
    onSuccess: (res) => {
      toast.success(`Count ${res.count.code} cancelled — kept for the record`)
      void queryClient.invalidateQueries({ queryKey: ['counts'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setCancelOpen(false)
      onDone()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  function submit() {
    const lines = count.lines.map((line) => ({
      lineId: line.id,
      countedQty: values[line.id] !== undefined && values[line.id] !== '' ? Number(values[line.id]) : NaN,
    }))
    if (lines.some((l) => !isFinite(l.countedQty) || l.countedQty < 0)) {
      toast.error('Enter a counted quantity for every line first (0 or more).')
      return
    }
    submitMutation.mutate({ lines, note: note.trim() || undefined })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          <ScanLine className="size-4 text-primary" aria-hidden="true" />
          <span className="font-mono">{count.code}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {count.scope === 'LOCATION' ? count.locationPath : `${count.productSku} — ${count.productName}`}
          </span>
        </DialogTitle>
        <DialogDescription>
          Tally each line physically on the shelf and enter what you actually count. Only a real variance opens
          an adjustment — clean counts post nothing.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[45vh] overflow-y-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Product</TableHead>
              <TableHead className="text-right">System</TableHead>
              <TableHead className="text-right">Counted</TableHead>
              <TableHead className="text-right">Variance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {count.lines.map((line) => {
              const raw = values[line.id] ?? ''
              const counted = raw === '' ? null : Number(raw)
              const variance = counted === null || !isFinite(counted) ? null : counted - line.systemQty
              return (
                <TableRow key={line.id}>
                  <TableCell>
                    <div className="font-mono text-xs font-medium">{line.sku}</div>
                    <div className="text-[11px] text-muted-foreground">{line.productName}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular">
                    {line.systemQty.toLocaleString('en-US')} {line.unit}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      inputMode="numeric"
                      value={raw}
                      placeholder={String(line.systemQty)}
                      onChange={(e) => setValues((prev) => ({ ...prev, [line.id]: e.target.value }))}
                      className="ml-auto h-8 w-24 text-right font-mono text-xs tabular"
                      aria-label={`Counted quantity for ${line.sku}`}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold tabular">
                    {variance === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={deltaColor(variance)}>{fmtSignedQty(variance, line.unit)}</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {count.lines.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  This count has no lines.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paper tally sheet (Phase 5 pilot) — staff carry these on the floor */}
      {canCount && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Printer className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">Paper tally sheet</span>
            </div>
            <div className="flex items-start gap-2">
              <Switch
                id="blind-count-switch"
                checked={blindCount}
                onCheckedChange={setBlindCount}
                className="mt-0.5"
                aria-describedby="blind-count-hint"
              />
              <div className="leading-tight">
                <Label htmlFor="blind-count-switch" className="cursor-pointer text-xs font-medium">
                  Blind count — hide system quantities
                </Label>
                <p id="blind-count-hint" className="text-[11px] text-muted-foreground">
                  Blind counts reduce counter bias — the sheet is printed without the System column.
                </p>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void sheetPrint.print(count, { hideSystemQty: blindCount })}
            disabled={sheetPrint.printing}
          >
            <Printer className="size-3.5" aria-hidden="true" />
            Print sheet
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="count-note" className="text-xs font-medium text-muted-foreground">
          Note (optional)
        </label>
        <Textarea
          id="count-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Second tally after recount of shelf B"
          rows={2}
        />
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button
          type="button"
          variant="outline"
          onClick={() => setCancelOpen(true)}
          disabled={cancelMutation.isPending}
        >
          Cancel count
        </Button>
        <Button type="button" onClick={submit} disabled={submitMutation.isPending}>
          {submitMutation.isPending && (
            <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          )}
          Submit count
        </Button>
      </DialogFooter>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel count {count.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              The count and its lines are discarded as a cancelled record — no stock is touched and nothing posts
              to the ledger.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep count</AlertDialogCancel>
            <AlertDialogAction
              className="bg-stone-600 text-white hover:bg-stone-700"
              onClick={(e) => {
                e.preventDefault()
                cancelMutation.mutate()
              }}
            >
              {cancelMutation.isPending ? 'Cancelling…' : 'Cancel count'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Print sheet portal — lives on document.body, escapes this dialog */}
      {sheetPrint.portal}
    </>
  )
}

/** Skeleton grid shown while the counts list loads. */
export function CountsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading counts">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-48 rounded-xl" />
      ))}
    </div>
  )
}
