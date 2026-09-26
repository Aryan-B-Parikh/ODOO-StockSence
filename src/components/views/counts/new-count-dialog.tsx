'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Info, MapPin, Package } from 'lucide-react'
import { useState } from 'react'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import type { CycleCountDTO, MetaDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

function defaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

/**
 * New count dialog — scope a count to one shelf location or one product.
 * The form lives inside DialogContent on purpose: Radix unmounts content
 * when the dialog closes, so every open starts fresh.
 */
export function NewCountDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <NewCountForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function NewCountForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<'LOCATION' | 'PRODUCT'>('LOCATION')
  const [locationId, setLocationId] = useState('')
  const [productId, setProductId] = useState('')
  const [dueDate, setDueDate] = useState(defaultDueDate())
  const [note, setNote] = useState('')

  // Mounted only while the dialog is open — meta is fetched lazily.
  const metaQuery = useQuery({
    queryKey: ['meta'],
    queryFn: () => api.get<MetaDTO>('/api/meta'),
    staleTime: 5 * 60_000,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ count: CycleCountDTO }>('/api/counts', {
        scope,
        locationId: scope === 'LOCATION' && locationId ? Number(locationId) : undefined,
        productId: scope === 'PRODUCT' && productId ? Number(productId) : undefined,
        dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success(
        `Count ${res.count.code} created — due ${new Date(res.count.dueDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })}`
      )
      void queryClient.invalidateQueries({ queryKey: ['counts'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onDone()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  function submit() {
    if (scope === 'LOCATION' && !locationId) {
      toast.error('Pick the location to count.')
      return
    }
    if (scope === 'PRODUCT' && !productId) {
      toast.error('Pick the product to count.')
      return
    }
    createMutation.mutate()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>New cycle count</DialogTitle>
        <DialogDescription>Scope a physical tally to a shelf location or a single product.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Scope</Label>
          <RadioGroup
            value={scope}
            onValueChange={(v) => setScope(v as 'LOCATION' | 'PRODUCT')}
            className="grid gap-2 sm:grid-cols-2"
          >
            <label
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors',
                scope === 'LOCATION' ? 'border-primary/50 bg-primary/5' : 'hover:bg-accent/50'
              )}
            >
              <RadioGroupItem value="LOCATION" className="mt-0.5" />
              <span className="space-y-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <MapPin className="size-3.5 text-teal-600" aria-hidden="true" /> Location
                </span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  Every product on one shelf
                </span>
              </span>
            </label>
            <label
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors',
                scope === 'PRODUCT' ? 'border-primary/50 bg-primary/5' : 'hover:bg-accent/50'
              )}
            >
              <RadioGroupItem value="PRODUCT" className="mt-0.5" />
              <span className="space-y-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Package className="size-3.5 text-teal-600" aria-hidden="true" /> Product
                </span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  One SKU across the warehouse
                </span>
              </span>
            </label>
          </RadioGroup>
        </div>

        {scope === 'LOCATION' ? (
          <div className="space-y-1.5">
            <Label htmlFor="count-location">Location to count</Label>
            {metaQuery.isPending ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger id="count-location" className="w-full" aria-label="Location to count">
                  <SelectValue placeholder="Pick a shelf location…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {metaQuery.data?.locations.map((loc) => (
                    <SelectItem key={loc.id} value={String(loc.id)}>
                      {loc.fullPath}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="count-product">Product to count</Label>
            {metaQuery.isPending ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger id="count-product" className="w-full" aria-label="Product to count">
                  <SelectValue placeholder="Pick a product…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {metaQuery.data?.products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <span className="font-mono">{p.sku}</span> — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="count-due" className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5 text-muted-foreground" aria-hidden="true" /> Due date
          </Label>
          <Input id="count-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-count-note">Note (optional)</Label>
          <Textarea
            id="new-count-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Spot check after the damaged-carton report"
            rows={2}
          />
        </div>

        <p className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          Only a real variance opens an adjustment — clean counts post nothing.
        </p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={createMutation.isPending}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={createMutation.isPending || metaQuery.isPending}>
          {createMutation.isPending && (
            <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          )}
          Create count
        </Button>
      </DialogFooter>
    </>
  )
}
