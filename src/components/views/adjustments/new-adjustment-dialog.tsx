'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { fmtQty } from '@/lib/format'
import type { AdjustmentDTO, MetaDTO, ProductDTO, ProductListDTO, StockByLocationDTO } from '@/lib/types'

interface DraftLine {
  key: string
  productId: number | null
  locationId: number | null
  countedQty: string
}

interface CreateAdjustmentResponse {
  adjustment: AdjustmentDTO
  explanation: string
  flagsCreated: { type: string; message: string }[]
  severity: string
}

let seq = 0
const nextKey = () => `line-${++seq}`
const newLine = (): DraftLine => ({ key: nextKey(), productId: null, locationId: null, countedQty: '' })

/** "New Adjustment" dialog — count variances routed by the severity engine. */
export function NewAdjustmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [reasonTouched, setReasonTouched] = useState(false)
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([newLine()])

  const productsQ = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get<ProductListDTO>('/api/products'),
    enabled: open,
  })
  const metaQ = useQuery({
    queryKey: ['meta'],
    queryFn: () => api.get<MetaDTO>('/api/meta'),
    enabled: open,
  })

  const products = useMemo(() => productsQ.data?.products ?? [], [productsQ.data])
  const productById = useMemo(() => new Map(products.map((p: ProductDTO) => [p.id, p])), [products])
  const locations = useMemo(
    () => [...(metaQ.data?.locations ?? [])].sort((a, b) => a.fullPath.localeCompare(b.fullPath)),
    [metaQ.data]
  )
  const stockAt = useMemo(() => {
    const m = new Map<string, StockByLocationDTO>()
    for (const p of products) for (const s of p.stockByLocation) m.set(`${p.id}:${s.locationId}`, s)
    return m
  }, [products])

  const stockFor = (line: DraftLine): StockByLocationDTO | undefined =>
    line.productId != null && line.locationId != null ? stockAt.get(`${line.productId}:${line.locationId}`) : undefined

  const lineValid = (line: DraftLine): boolean => {
    if (line.productId == null || line.locationId == null) return false
    const qty = Number(line.countedQty)
    return Number.isFinite(qty) && Number.isInteger(qty) && qty >= 0
  }

  const reasonIssue = reason.trim() === '' ? 'A reason is required (it lands in the audit ledger)' : null
  const valid = reasonIssue === null && lines.length > 0 && lines.every(lineValid)

  const create = useMutation({
    mutationFn: () =>
      api.post<CreateAdjustmentResponse>('/api/adjustments', {
        reason: reason.trim(),
        note: note.trim() || undefined,
        lines: lines.map((l) => ({
          productId: l.productId!,
          locationId: l.locationId!,
          countedQty: Number(l.countedQty),
        })),
      }),
    onSuccess: (res) => {
      // The engine's explanation is the star — show it verbatim with the severity.
      const description = `${res.adjustment.code} · Severity: ${res.severity}${res.flagsCreated.length > 0 ? ' · review flag opened' : ''}`
      if (res.severity === 'HIGH') {
        toast.warning(res.explanation, { description })
      } else if (res.severity === 'MEDIUM') {
        toast.warning(res.explanation, { description })
      } else {
        toast.success(res.explanation, { description })
      }
      for (const key of ['adjustments', 'products', 'dashboard']) {
        void qc.invalidateQueries({ queryKey: [key] })
      }
      reset()
      onOpenChange(false)
    },
    // 422 = CRITICAL block (would set negative stock) — show the engine's message.
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create adjustment'),
  })

  const reset = () => {
    setReason('')
    setReasonTouched(false)
    setNote('')
    setLines([newLine()])
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const addLine = () => setLines((prev) => [...prev, newLine()])
  const removeLine = (key: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev))

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New stock adjustment</DialogTitle>
          <DialogDescription>
            Enter what you physically counted. Small mismatches post automatically; anything over 15% of stock is held
            for manager approval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="adj-reason">Reason</Label>
          <Textarea
            id="adj-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setReasonTouched(true)}
            placeholder="e.g. Damage found during cycle count of Rack B1"
            rows={2}
            aria-invalid={reasonIssue !== null && reasonTouched}
            required
          />
          {reasonIssue && reasonTouched && <p className="text-xs font-medium text-red-600">{reasonIssue}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adj-note">Note (optional)</Label>
          <Input
            id="adj-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Extra context for the audit trail…"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Lines</Label>
            <span className="text-xs text-muted-foreground">{lines.length} of max 8</span>
          </div>

          {lines.map((line) => {
            const stock = stockFor(line)
            const unit = line.productId != null ? productById.get(line.productId)?.unit : undefined
            const counted = Number(line.countedQty)
            const showDelta =
              stock != null && lineValid(line) && Number.isFinite(counted) && counted !== stock.onHand
            return (
              <div key={line.key} className="space-y-2.5 rounded-lg border p-3">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`product-${line.key}`}>Product</Label>
                    <Select
                      value={line.productId != null ? String(line.productId) : ''}
                      onValueChange={(v) => updateLine(line.key, { productId: Number(v) })}
                    >
                      <SelectTrigger id={`product-${line.key}`} className="w-full" disabled={productsQ.isPending}>
                        <SelectValue placeholder={productsQ.isPending ? 'Loading products…' : 'Choose product'} />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.sku} · {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`location-${line.key}`}>Location</Label>
                    <Select
                      value={line.locationId != null ? String(line.locationId) : ''}
                      onValueChange={(v) => updateLine(line.key, { locationId: Number(v) })}
                    >
                      <SelectTrigger id={`location-${line.key}`} className="w-full" disabled={metaQ.isPending}>
                        <SelectValue placeholder={metaQ.isPending ? 'Loading locations…' : 'Counted at location'} />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((l) => (
                          <SelectItem key={l.id} value={String(l.id)}>
                            {l.fullPath}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor={`counted-${line.key}`}>Counted quantity</Label>
                    <Input
                      id={`counted-${line.key}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={line.countedQty}
                      onChange={(e) => updateLine(line.key, { countedQty: e.target.value })}
                      placeholder="What you counted"
                      aria-invalid={line.countedQty !== '' && !lineValid(line)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length === 1}
                    aria-label="Remove line"
                    className="text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  {line.productId == null || line.locationId == null
                    ? 'Select a product and location to see the system quantity.'
                    : stock == null
                      ? `System qty: 0${unit ? ` ${unit}` : ''} (no stock record here — counting stock in adds it)`
                      : showDelta
                        ? (
                          <>
                            System qty: {fmtQty(stock.onHand, unit)} → counted becomes{' '}
                            <span className={counted > stock.onHand ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'font-medium text-red-600'}>
                              {fmtQty(counted, unit)}
                            </span>
                          </>
                        ) : (
                          `System qty: ${fmtQty(stock.onHand, unit)}${line.countedQty !== '' ? ' — matches the count' : ''}`
                        )}
                </p>
              </div>
            )
          })}

          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed"
            onClick={addLine}
            disabled={lines.length >= 8}
          >
            <Plus className="size-4" aria-hidden="true" /> Add line
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!valid || create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Log adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
