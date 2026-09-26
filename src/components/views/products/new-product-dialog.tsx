'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, PackagePlus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import type { MetaDTO, ProductDTO } from '@/lib/types'

const createSchema = z.object({
  sku: z.string().min(1, 'SKU is required').max(40, 'Keep it under 40 characters'),
  name: z.string().min(1, 'Name is required'),
  category: z.string().min(1, 'Pick a category'),
  unit: z.string().min(1, 'Unit is required (e.g. kg, pcs)'),
  unitCost: z.number({ error: 'Unit cost is required' }).min(0, 'Must be ≥ 0'),
  reorderPoint: z.number({ error: 'Required' }).min(0, 'Must be ≥ 0'),
  dailyUsage: z.number({ error: 'Required' }).min(0, 'Must be ≥ 0'),
  safetyStock: z.number({ error: 'Required' }).min(0, 'Must be ≥ 0'),
  valueClass: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  notes: z.string().optional(),
  supplierId: z.string().optional(),
})

type CreateValues = z.infer<typeof createSchema>

const VALUE_CLASS_HINT: Record<CreateValues['valueClass'], string> = {
  HIGH: 'High-value — counted more often, variances escalated',
  MEDIUM: 'Standard value — routine controls',
  LOW: 'Low-value — minimal controls',
}

/** "New Product" dialog (permission: configure) — POST /api/products. */
export function NewProductDialog({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: string[]
}) {
  const queryClient = useQueryClient()

  const metaQuery = useQuery({
    queryKey: ['meta'],
    queryFn: () => api.get<MetaDTO>('/api/meta'),
    enabled: open,
    staleTime: 60_000,
  })

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      sku: '',
      name: '',
      category: '',
      unit: '',
      unitCost: NaN,
      reorderPoint: NaN,
      dailyUsage: NaN,
      safetyStock: NaN,
      valueClass: 'MEDIUM',
      notes: '',
      supplierId: '',
    },
  })

  const onSubmit = async (values: CreateValues) => {
    try {
      const res = await api.post<{ product: ProductDTO }>('/api/products', {
        sku: values.sku,
        name: values.name,
        category: values.category,
        unit: values.unit,
        unitCost: values.unitCost,
        reorderPoint: values.reorderPoint,
        dailyUsage: values.dailyUsage,
        safetyStock: values.safetyStock,
        valueClass: values.valueClass,
        notes: values.notes?.trim() ? values.notes : undefined,
        supplierIds: values.supplierId ? [Number(values.supplierId)] : undefined,
      })
      toast.success(`Product ${res.product.sku} created`, {
        description: `${res.product.name} is now in the catalogue with zero on-hand stock.`,
      })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['meta'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['search'] })
      form.reset()
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not create product', {
        description: err instanceof Error ? err.message : 'Unexpected error',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="size-5 text-primary" aria-hidden="true" /> New product
          </DialogTitle>
          <DialogDescription>
            Adds an SKU to the catalogue. Stock starts at zero — receive or adjust to put units on shelves.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input placeholder="RM-STL-ROD12" {...field} className="font-mono" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <FormControl>
                      <Input placeholder="kg, pcs, roll…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Steel Rod 12mm" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
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
                name="unitCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit cost ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="tabular"
                        value={Number.isNaN(field.value) ? '' : field.value}
                        onChange={(e) => field.onChange(e.target.value === '' ? NaN : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="reorderPoint"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reorder point</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        className="tabular"
                        value={Number.isNaN(field.value) ? '' : field.value}
                        onChange={(e) => field.onChange(e.target.value === '' ? NaN : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dailyUsage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Daily usage</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        className="tabular"
                        value={Number.isNaN(field.value) ? '' : field.value}
                        onChange={(e) => field.onChange(e.target.value === '' ? NaN : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="safetyStock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Safety stock</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        className="tabular"
                        value={Number.isNaN(field.value) ? '' : field.value}
                        onChange={(e) => field.onChange(e.target.value === '' ? NaN : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="valueClass"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Value class</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(['HIGH', 'MEDIUM', 'LOW'] as const).map((vc) => (
                          <SelectItem key={vc} value={vc}>
                            {vc}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>{VALUE_CLASS_HINT[field.value]}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferred supplier</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="No supplier yet" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(metaQuery.data?.suppliers ?? []).map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name} · {s.leadTimeDays}d lead
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Optional — the first linked supplier becomes preferred and sets reorder lead time.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Handling requirements, storage zone…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {form.formState.isSubmitting ? 'Creating…' : 'Create product'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
