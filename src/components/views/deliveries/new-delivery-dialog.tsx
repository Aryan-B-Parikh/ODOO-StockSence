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
import { api } from '@/lib/api'
import type { DeliveryDTO, MetaDTO, ProductDTO, ProductListDTO, StockByLocationDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

interface DraftLine {
  key: string
  productId: number | null
  locationId: number | null
  qty: string
}

let seq = 0
const nextKey = () => `line-${++seq}`
const newLine = (): DraftLine => ({ key: nextKey(), productId: null, locationId: null, qty: '' })

type LineState =
  | { kind: 'incomplete' }
  | { kind: 'ok'; available: number; unit?: string }
  | { kind: 'over'; available: number; unit?: string }
  | { kind: 'badqty'; available: number; unit?: string }

/** "New Delivery" dialog — creating an order reserves stock immediately. */
export function NewDeliveryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [customer, setCustomer] = useState('')
  const [customerTouched, setCustomerTouched] = useState(false)
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([newLine()])

  // One fetch of the full catalogue (with stockByLocation) powers product
  // options + per-line availability hints; meta powers the location options.
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

  const lineState = (line: DraftLine): LineState => {
    if (line.productId == null || line.locationId == null) return { kind: 'incomplete' }
    const product = productById.get(line.productId)
    const stock = stockFor(line)
    const available = stock?.available ?? 0
    const unit = product?.unit
    const qty = Number(line.qty)
    if (!Number.isFinite(qty) || qty < 1) return { kind: 'badqty', available, unit }
    if (!Number.isInteger(qty)) return { kind: 'badqty', available, unit }
    if (qty > available) return { kind: 'over', available, unit }
    return { kind: 'ok', available, unit }
  }

  const customerIssue = customer.trim() === '' ? 'Customer name is required' : null
  const valid = customerIssue === null && lines.length > 0 && lines.every((l) => lineState(l).kind === 'ok')

  const create = useMutation({
    mutationFn: () =>
      api.post<{ delivery: DeliveryDTO }>('/api/deliveries', {
        customer: customer.trim(),
        note: note.trim() || undefined,
        lines: lines.map((l) => ({ productId: l.productId!, locationId: l.locationId!, qty: Number(l.qty) })),
      }),
    onSuccess: (res) => {
      toast.success(`Order ${res.delivery.code} created — stock reserved`)
      for (const key of ['deliveries', 'products', 'dashboard']) {
        void qc.invalidateQueries({ queryKey: [key] })
      }
      reset()
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create delivery'),
  })

  const reset = () => {
    setCustomer('')
    setCustomerTouched(false)
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
          <DialogTitle>New delivery order</DialogTitle>
          <DialogDescription>
            Creating an order reserves the units right away — reserved stock can never be promised to another order.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="delivery-customer">Customer</Label>
            <Input
              id="delivery-customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              onBlur={() => setCustomerTouched(true)}
              placeholder="e.g. GreenField Retail"
              aria-invalid={customerIssue !== null && customerTouched}
              required
            />
            {customerIssue && customerTouched && (
              <p className="text-xs font-medium text-red-600">{customerIssue}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delivery-note">Note (optional)</Label>
            <Input
              id="delivery-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reference, dock, instructions…"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Lines</Label>
            <span className="text-xs text-muted-foreground">{lines.length} of max 8</span>
          </div>

          {lines.map((line) => {
            const state = lineState(line)
            const stock = stockFor(line)
            const available = stock?.available ?? 0
            const unit = line.productId != null ? productById.get(line.productId)?.unit : undefined
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
                            {p.sku} · {p.name} — {p.available} {p.unit} avail.
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
                        <SelectValue placeholder={metaQ.isPending ? 'Loading locations…' : 'Pick from location'} />
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
                    <Label htmlFor={`qty-${line.key}`}>Quantity</Label>
                    <Input
                      id={`qty-${line.key}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={state.kind === 'incomplete' ? undefined : Math.max(1, available)}
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
            Create order — reserve stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LineHint({ state, unit, available }: { state: LineState; unit?: string; available: number }) {
  const unitSuffix = unit ? ` ${unit}` : ''
  if (state.kind === 'incomplete') {
    return <p className="text-[11px] text-muted-foreground">Select a product and location to see availability.</p>
  }
  if (state.kind === 'over') {
    return (
      <p className="text-[11px] font-medium text-red-600">
        ⚠ Only {available}
        {unitSuffix} available at this location — reduce the quantity.
      </p>
    )
  }
  return (
    <p className={cn('text-[11px]', state.kind === 'ok' ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
      Available at this location: {available}
      {unitSuffix}
    </p>
  )
}
