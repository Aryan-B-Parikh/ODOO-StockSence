'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, Loader2, PencilLine } from 'lucide-react'
import { useEffect } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import type { SupplierDTO } from '@/lib/types'

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80, 'Keep it under 80 characters'),
  contact: z.string().optional(),
  leadTimeDays: z
    .number({ error: 'Lead time is required' })
    .int('Whole days only')
    .min(1, 'At least 1 day')
    .max(120, 'At most 120 days'),
  reliability: z.number({ error: 'Required' }).min(0, 'Between 0 and 1').max(1, 'Between 0 and 1'),
  damageRate: z.number({ error: 'Required' }).min(0, 'Between 0 and 1').max(1, 'Between 0 and 1'),
  notes: z.string().optional(),
})

type SupplierValues = z.infer<typeof supplierSchema>

const BLANK: SupplierValues = {
  name: '',
  contact: '',
  leadTimeDays: 7,
  reliability: 0.95,
  damageRate: 0.01,
  notes: '',
}

/**
 * Create + edit supplier dialog (permission: configure).
 * Lead time, reliability and damage rate feed the reorder engine — the helpers
 * spell out what each number means so entries stay meaningful.
 */
export function SupplierFormDialog({
  open,
  onOpenChange,
  /** Pass a supplier to edit it; omit (or null) to create a new one. */
  supplier = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier?: SupplierDTO | null
}) {
  const queryClient = useQueryClient()
  const isEdit = supplier != null

  const form = useForm<SupplierValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: BLANK,
  })

  // Prefill for edit mode (and reset to blank for create) whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    form.reset(
      supplier
        ? {
            name: supplier.name,
            contact: supplier.contact ?? '',
            leadTimeDays: supplier.leadTimeDays,
            reliability: supplier.reliability,
            damageRate: supplier.damageRate,
            notes: supplier.notes ?? '',
          }
        : BLANK
    )
  }, [open, supplier, form])

  const onSubmit = async (values: SupplierValues) => {
    const payload = {
      name: values.name.trim(),
      contact: values.contact?.trim() ? values.contact.trim() : undefined,
      leadTimeDays: values.leadTimeDays,
      reliability: values.reliability,
      damageRate: values.damageRate,
      notes: values.notes?.trim() ? values.notes.trim() : undefined,
    }
    try {
      if (isEdit) {
        await api.patch<{ supplier: SupplierDTO }>(`/api/suppliers/${supplier.id}`, payload)
        toast.success(`Supplier ${payload.name} updated`, {
          description: 'Reorder suggestions will use the new terms on next refresh.',
        })
      } else {
        await api.post<{ supplier: SupplierDTO }>('/api/suppliers', payload)
        toast.success(`Supplier ${payload.name} added`, {
          description: 'Link products and order terms from the supplier detail view.',
        })
      }
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      void queryClient.invalidateQueries({ queryKey: ['meta'] })
      void queryClient.invalidateQueries({ queryKey: ['reorder'] })
      onOpenChange(false)
    } catch (err) {
      toast.error(isEdit ? 'Could not update supplier' : 'Could not add supplier', {
        description: err instanceof Error ? err.message : 'Unexpected error',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? (
              <PencilLine className="size-5 text-primary" aria-hidden="true" />
            ) : (
              <Building2 className="size-5 text-primary" aria-hidden="true" />
            )}
            {isEdit ? `Edit ${supplier.name}` : 'New supplier'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the vendor profile — lead time and reliability drive reorder suggestions for every linked SKU.'
              : 'Add a vendor to the directory. Link products and order terms afterwards from the supplier detail view.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Metro Steel Co." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact</FormLabel>
                    <FormControl>
                      <Input placeholder="orders@example.com" {...field} />
                    </FormControl>
                    <FormDescription>Email or phone — optional.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="leadTimeDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead time (days)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      max="120"
                      className="tabular"
                      value={Number.isNaN(field.value) ? '' : field.value}
                      onChange={(e) => field.onChange(e.target.value === '' ? NaN : Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Days from purchase order to dock — sets the reorder point for linked SKUs.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="reliability"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reliability</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        className="tabular"
                        value={Number.isNaN(field.value) ? '' : field.value}
                        onChange={(e) => field.onChange(e.target.value === '' ? NaN : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>0.95 = 95% on-time deliveries.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="damageRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Damage rate</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        max="1"
                        className="tabular"
                        value={Number.isNaN(field.value) ? '' : field.value}
                        onChange={(e) => field.onChange(e.target.value === '' ? NaN : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>0.01 = 1% of goods arrive damaged.</FormDescription>
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
                    <Textarea rows={2} placeholder="Payment terms, freight rules, quirks…" {...field} />
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
                {form.formState.isSubmitting
                  ? isEdit
                    ? 'Saving…'
                    : 'Adding…'
                  : isEdit
                    ? 'Save changes'
                    : 'Add supplier'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
