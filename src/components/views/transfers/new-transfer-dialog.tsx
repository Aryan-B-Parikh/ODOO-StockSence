'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Loader2, Plus, Trash2 } from 'lucide-react'
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
import { api } from '@/lib/api'
import type { MetaDTO, ProductDTO, ProductListDTO, StockByLocationDTO, TransferDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

interface DraftLine {
  key: string
  productId: number | null
  qty: string
}

let seq = 0
const nextKey = () => `line-${++seq}`
const newLine = (): DraftLine => ({ key: nextKey(), productId: null, qty: '' })

type LineState =
  | { kind: 'awaiting-source' }
  | { kind: 'incomplete' }
  | { kind: 'ok'; available: number; unit?: string }
  | { kind: 'over'; available: number; unit?: string }
  | { kind: 'badqty'; available: number; unit?: string }

/** "New Transfer" dialog — source Available → In transit → destination Available. */
export function NewTransferDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [fromId, setFromId] = useState<number | null>(null)
  const [toId, setToId] = useState<number | null>(null)
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
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations])
  const stockAt = useMemo(() => {
    const m = new Map<string, StockByLocationDTO>()
    for (const p of products) for (const s of p.stockByLocation) m.set(`${p.id}:${s.locationId}`, s)
    return m
  }, [products])

  const stockFor = (line: DraftLine): StockByLocationDTO | undefined =>
    fromId != null && line.productId != null ? stockAt.get(`${line.productId}:${fromId}`) : undefined

  const lineState = (line: DraftLine): LineState => {
    if (fromId == null) return { kind: 'awaiting-source' }
    if (line.productId == null) return { kind: 'incomplete' }
    const product = productById.get(line.productId)
    const available = stockFor(line)?.available ?? 0
    const unit = product?.unit
    const qty = Number(line.qty)
    if (!Number.isFinite(qty) || qty < 1) return { kind: 'badqty', available, unit }
    if (!Number.isInteger(qty)) return { kind: 'badqty', available, unit }
    if (qty > available) return { kind: 'over', available, unit }
    return { kind: 'ok', available, unit }
  }

  const sameLocation = fromId != null && fromId === toId
  const missingRoute = fromId == null || toId == null
  const routeIssue = sameLocation
    ? 'Source and destination must be different locations.'
    : missingRoute
      ? 'Choose a source and a destination location.'
      : null
  const valid =
    routeIssue === null && lines.length > 0 && lines.every((l) => lineState(l).kind === 'ok')

  const create = useMutation({
    mutationFn: () =>
      api.post<{ transfer: TransferDTO }>('/api/transfers', {
        fromLocationId: fromId!,
        toLocationId: toId!,
        note: note.trim() || undefined,
        lines: lines.map((l) => ({ productId: l.productId!, qty: Number(l.qty) })),
      }),
    onSuccess: (res) => {
      toast.success(`Transfer ${res.transfer.code} created — units are in transit to the destination`)
      for (const key of ['transfers', 'products', 'dashboard']) {
        void qc.invalidateQueries({ queryKey: [key] })
      }
      reset()
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create transfer'),
  })

  const reset = () => {
    setFromId(null)
    setToId(null)
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

  const fromLocation = fromId != null ? locationById.get(fromId) : undefined
  const toLocation = toId != null ? locationById.get(toId) : undefined

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New internal transfer</DialogTitle>
          <DialogDescription>
            Shipping moves units from source on-hand into “in transit” at the destination — they only become available
            there once received.
          </DialogDescription>
        </DialogHeader>

        {/* Route selects */}
        <div className="grid items-end gap-2.5 sm:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="transfer-from">From (source)</Label>
            <Select value={fromId != null ? String(fromId) : ''} onValueChange={(v) => setFromId(Number(v))}>
              <SelectTrigger id="transfer-from" className="w-full" disabled={metaQ.isPending}>
                <SelectValue placeholder={metaQ.isPending ? 'Loading…' : 'Source location'} />
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
          <ArrowRight className="mx-auto size-4 shrink-0 pb-2.5 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1.5">
            <Label htmlFor="transfer-to">To (destination)</Label>
            <Select value={toId != null ? String(toId) : ''} onValueChange={(v) => setToId(Number(v))}>
              <SelectTrigger id="transfer-to" className="w-full" disabled={metaQ.isPending}>
                <SelectValue placeholder={metaQ.isPending ? 'Loading…' : 'Destination location'} />
              </SelectTrigger>
              <SelectContent>
                {locations
                  .filter((l) => l.id !== fromId)
                  .map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.fullPath}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {routeIssue && (sameLocation || fromId != null || toId != null) && (
          <p className={cn('text-xs', sameLocation ? 'font-medium text-red-600' : 'text-muted-foreground')}>
            {routeIssue}
          </p>
        )}
        {fromLocation && toLocation && !sameLocation && (
          <p className="text-xs text-muted-foreground">
            Route: <span className="font-medium text-foreground">{fromLocation.fullPath}</span> →{' '}
            <span className="font-medium text-foreground">{toLocation.fullPath}</span>
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="transfer-note">Note (optional)</Label>
          <Input
            id="transfer-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for the move, ticket reference…"
          />
        </div>

        {/* Lines */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Lines</Label>
            <span className="text-xs text-muted-foreground">
              {fromLocation ? `Availability shown at ${fromLocation.code}` : 'Choose a source to see availability'}
            </span>
          </div>

          {lines.map((line) => {
            const state = lineState(line)
            const available = stockFor(line)?.available ?? 0
            const unit = line.productId != null ? productById.get(line.productId)?.unit : undefined
            return (
              <div key={line.key} className="space-y-2.5 rounded-lg border p-3">
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
                      {products.map((p) => {
                        const availHere = fromId != null ? (p.stockByLocation.find((s) => s.locationId === fromId)?.available ?? 0) : 0
                        return (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.sku} · {p.name} — {availHere} {p.unit} at source
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor={`qty-${line.key}`}>Quantity</Label>
                    <Input
                      id={`qty-${line.key}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={state.kind === 'awaiting-source' || state.kind === 'incomplete' ? undefined : Math.max(1, available)}
                      step={1}
                      value={line.qty}
                      onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                      placeholder="0"
                      aria-invalid={state.kind === 'over'}
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

                <LineHint state={state} unit={unit} available={available} />
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
            Ship transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LineHint({ state, unit, available }: { state: LineState; unit?: string; available: number }) {
  const unitSuffix = unit ? ` ${unit}` : ''
  if (state.kind === 'awaiting-source') {
    return <p className="text-[11px] text-muted-foreground">Choose a source location to see availability.</p>
  }
  if (state.kind === 'incomplete') {
    return <p className="text-[11px] text-muted-foreground">Select a product to see availability at the source.</p>
  }
  if (state.kind === 'over') {
    return (
      <p className="text-[11px] font-medium text-red-600">
        ⚠ Only {available}
        {unitSuffix} available at the source — reduce the quantity.
      </p>
    )
  }
  return (
    <p className={cn('text-[11px]', state.kind === 'ok' ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
      Available at source: {available}
      {unitSuffix}
    </p>
  )
}
