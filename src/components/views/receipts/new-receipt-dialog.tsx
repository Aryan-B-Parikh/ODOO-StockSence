'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Loader2, Plus, Trash2, Truck } from 'lucide-react'
import { useMemo } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { fmtQty } from '@/lib/format'
import type { MetaDTO, ReceiptDTO } from '@/lib/types'

const lineSchema = z.object({
  productId: z.string().min(1, 'Pick a product'),
  locationId: z.string().min(1, 'Pick a location'),
  expectedQty: z.number({ error: 'Qty is required' }).positive('Must be > 0'),
})

const createSchema = z.object({
  supplierId: z.string(),
  expectedAt: z.string().min(1, 'Expected date is required'),
  note: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'Add at least one line'),
})

type CreateValues = z.infer<typeof createSchema>
type LineValues = CreateValues['lines'][number]

function plusThreeDays(): string {
  return new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
}

const emptyLine = (): LineValues => ({ productId: '', locationId: '', expectedQty: NaN })

/**
 * "New Receipt" dialog (permission: receive) — creates an EXPECTED document.
 * The engine raises 'incoming' immediately; stock only becomes available
 * once the receipt is received.
 */
export function NewReceiptDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const metaQuery = useQuery({
    queryKey: ['meta'],
    queryFn: () => api.get<MetaDTO>('/api/meta'),
    enabled: open,
    staleTime: 60_000,
  })
  const meta = metaQuery.data

  // Products grouped by category; locations grouped by zone.
  const productGroups = useMemo(() => {
    const map = new Map<string, NonNullable<MetaDTO['products']>>()
    for (const p of meta?.products ?? []) {
      const list = map.get(p.category) ?? []
      list.push(p)
      map.set(p.category, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [meta])

  const locationGroups = useMemo(() => {
    const map = new Map<string, NonNullable<MetaDTO['locations']>>()
    for (const l of meta?.locations ?? []) {
      const list = map.get(l.zoneName) ?? []
      list.push(l)
      map.set(l.zoneName, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [meta])

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      supplierId: '',
      expectedAt: plusThreeDays(),
      note: '',
      lines: [emptyLine()],
    },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' })
  const watchedLines = useWatch({ control: form.control, name: 'lines' })

  const onSubmit = async (values: CreateValues) => {
    try {
      const res = await api.post<{ receipt: ReceiptDTO }>('/api/receipts', {
        supplierId: values.supplierId ? Number(values.supplierId) : null,
        expectedAt: values.expectedAt,
        note: values.note?.trim() || null,
        lines: values.lines.map((l) => ({
          productId: Number(l.productId),
          locationId: Number(l.locationId),
          expectedQty: l.expectedQty,
        })),
      })
      toast.success(`Receipt ${res.receipt.code} created`, {
        description: 'Stock now shows as incoming — it becomes available once the receipt is received.',
      })
      void queryClient.invalidateQueries({ queryKey: ['receipts'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['meta'] })
      void queryClient.invalidateQueries({ queryKey: ['attention'] })
      form.reset({ supplierId: '', expectedAt: plusThreeDays(), note: '', lines: [emptyLine()] })
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not create receipt', {
        description: err instanceof Error ? err.message : 'Unexpected error',
      })
    }
  }

  const productById = useMemo(
    () => new Map((meta?.products ?? []).map((p) => [String(p.id), p])),
    [meta]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-5 text-primary" aria-hidden="true" /> New receipt
          </DialogTitle>
          <DialogDescription>Record inbound goods you expect to arrive — one line per product and shelf.</DialogDescription>
        </DialogHeader>

        <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Creating an expectation raises <strong className="font-semibold">incoming</strong> — stock shows as available
          only once received.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="No supplier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(meta?.suppliers ?? []).map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name} · {s.leadTimeDays}d lead
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expectedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Dynamic lines */}
            <fieldset className="space-y-2" disabled={metaQuery.isPending}>
              <legend className="mb-1 text-sm font-medium">Lines</legend>
              {metaQuery.isPending ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Loading products & locations…</p>
              ) : (
                fields.map((field, index) => {
                  const selected = watchedLines?.[index]?.productId
                  const product = selected ? productById.get(selected) : undefined
                  return (
                    <div key={field.id} className="space-y-2 rounded-lg border p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.productId`}
                          render={({ field: f }) => (
                            <FormItem className="min-w-0">
                              <FormLabel className={index > 0 ? 'sr-only' : undefined}>Product</FormLabel>
                              <Select onValueChange={f.onChange} value={f.value}>
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select product" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {productGroups.map(([category, products]) => (
                                    <SelectGroup key={category}>
                                      <SelectLabel>{category}</SelectLabel>
                                      {products.map((p) => (
                                        <SelectItem key={p.id} value={String(p.id)}>
                                          <span className="font-mono text-xs">{p.sku}</span> — {p.name} ({p.unit})
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`lines.${index}.locationId`}
                          render={({ field: f }) => (
                            <FormItem className="min-w-0">
                              <FormLabel className={index > 0 ? 'sr-only' : undefined}>
                                Destination location
                              </FormLabel>
                              <Select onValueChange={f.onChange} value={f.value}>
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select shelf" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {locationGroups.map(([zone, locations]) => (
                                    <SelectGroup key={zone}>
                                      <SelectLabel>{zone}</SelectLabel>
                                      {locations.map((l) => (
                                        <SelectItem key={l.id} value={String(l.id)}>
                                          Rack {l.rackCode} · Shelf {l.code}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.expectedQty`}
                          render={({ field: f }) => (
                            <FormItem className="flex-1 space-y-1">
                              <Label className={index > 0 ? 'sr-only' : 'text-sm font-medium'} htmlFor={`qty-${field.id}`}>
                                Expected qty
                              </Label>
                              <FormControl>
                                <Input
                                  id={`qty-${field.id}`}
                                  type="number"
                                  min="0"
                                  step="any"
                                  inputMode="numeric"
                                  placeholder="0"
                                  className="tabular"
                                  value={Number.isNaN(f.value) ? '' : f.value}
                                  onChange={(e) =>
                                    f.onChange(e.target.value === '' ? NaN : Number(e.target.value))
                                  }
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove line ${index + 1}`}
                          disabled={fields.length === 1}
                          onClick={() => remove(index)}
                          className="text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                      {product && (
                        <p className="text-[11px] text-muted-foreground">
                          Currently on-hand {fmtQty(product.onHand, product.unit)} · available{' '}
                          {fmtQty(product.available, product.unit)} — incoming adds on top of this.
                        </p>
                      )}
                    </div>
                  )
                })
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append(emptyLine())}
              >
                <Plus className="size-3.5" aria-hidden="true" /> Add line
              </Button>
              {form.formState.errors.lines?.root && (
                <p className="text-xs text-destructive">{form.formState.errors.lines.root.message}</p>
              )}
              {form.formState.errors.lines?.message && (
                <p className="text-xs text-destructive">{form.formState.errors.lines.message}</p>
              )}
            </fieldset>

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="PO reference, carrier, handling notes…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting || metaQuery.isPending}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Truck className="size-4" aria-hidden="true" />
                )}
                {form.formState.isSubmitting ? 'Creating…' : 'Create receipt'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
