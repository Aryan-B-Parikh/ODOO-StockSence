'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ClipboardPaste, Info, Loader2, Plus, Trash2, Truck } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
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
import { api, OfflineError } from '@/lib/api'
import { fmtQty } from '@/lib/format'
import { matchProductLine, parseInvoiceText, type OcrLine } from '@/lib/ocr'
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

// ---------- Photo / OCR pre-fill (Phase 2) ----------

/** One editable row of the "Draft from invoice photo/text" review panel. */
interface DraftOcrLine {
  key: string
  sku: string
  name: string
  quantity: string
  /** '' = unmatched — the user picks a product manually */
  productId: string
  matchType: 'exact' | 'fuzzy' | null
}

let ocrSeq = 0
const nextOcrKey = () => `ocr-${++ocrSeq}`

/** Turn server OCR lines into editable draft rows. */
function toDraftLines(lines: OcrLine[]): DraftOcrLine[] {
  return lines.map((l) => ({
    key: nextOcrKey(),
    sku: l.sku,
    name: l.name,
    quantity: String(l.quantity),
    productId: l.matchedProductId != null ? String(l.matchedProductId) : '',
    matchType: l.matchType,
  }))
}

/**
 * Client-side downscale before upload: canvas → max edge 1280px, JPEG q0.85
 * → data URL. Keeps the JSON payload small; falls back to the original when
 * the browser can't handle canvases (never blocks the scan on resize).
 */
async function downscaleImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the selected file'))
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not decode that image'))
    el.src = dataUrl
  })
  const maxEdge = 1280
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  if (scale >= 1 && dataUrl.length < 1_500_000) return dataUrl
  try {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return dataUrl
  }
}

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

  // ---- Photo/OCR pre-fill (Phase 2) — drafts lines for review; NEVER auto-commits ----
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [ocrReading, setOcrReading] = useState(false)
  const [ocrLines, setOcrLines] = useState<DraftOcrLine[] | null>(null)
  const [ocrSource, setOcrSource] = useState<'photo' | 'text'>('photo')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // leave the form itself untouched (existing behaviour) — just clear the draft panel
      setOcrLines(null)
      setPasteOpen(false)
      setPasteText('')
      setOcrReading(false)
    }
    onOpenChange(next)
  }

  /** Photo → downscale → /api/receipts/ocr → review panel. */
  const handlePhoto = async (file: File | undefined) => {
    if (!file) return
    setOcrReading(true)
    setOcrLines(null)
    try {
      const imageBase64 = await downscaleImage(file)
      const res = await api.post<{ lines: OcrLine[] }>('/api/receipts/ocr', { imageBase64 })
      setOcrLines(toDraftLines(res.lines))
      setOcrSource('photo')
      toast.success(`Read ${res.lines.length} ${res.lines.length === 1 ? 'line' : 'lines'} from the photo`, {
        description: 'Review the draft below — nothing is added until you confirm.',
      })
    } catch (err) {
      if (err instanceof OfflineError) {
        toast.warning("You're offline — photo scan isn't available right now", {
          description: 'Add lines manually below, or paste the invoice text (works offline).',
        })
      } else {
        toast.warning("Couldn't read that photo — add lines manually or paste the text", {
          description: err instanceof Error ? err.message : undefined,
        })
      }
      setPasteOpen(true)
    } finally {
      setOcrReading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /** Pasted invoice text → local regex parse (zero-AI) → same review panel. */
  const applyPastedText = () => {
    const items = parseInvoiceText(pasteText)
    if (items.length === 0) {
      toast.warning('No lines found in that text', {
        description: 'Paste one product per line, e.g. “CN-GLV-NIT 40 pcs” or “EL-CTL-CX2, 15”.',
      })
      return
    }
    const catalogue = (meta?.products ?? []).map((p) => ({ id: p.id, sku: p.sku, name: p.name }))
    setOcrLines(
      items.map((item) => {
        const { product, matchType } = matchProductLine(item, catalogue)
        return {
          key: nextOcrKey(),
          sku: item.sku,
          name: item.name,
          quantity: String(item.quantity),
          productId: product != null ? String(product.id) : '',
          matchType,
        }
      })
    )
    setOcrSource('text')
    setPasteOpen(false)
    toast.success(`Parsed ${items.length} ${items.length === 1 ? 'line' : 'lines'} from the text`, {
      description: 'Review the draft below — nothing is added until you confirm.',
    })
  }

  /** Rows ready to become receipt lines (product picked + qty > 0). */
  const addableDraftCount = (ocrLines ?? []).filter(
    (l) => l.productId !== '' && Number(l.quantity) > 0
  ).length

  const addDraftLines = () => {
    const addable = (ocrLines ?? []).filter((l) => l.productId !== '' && Number(l.quantity) > 0)
    if (addable.length === 0) {
      toast.warning('Nothing to add yet', {
        description: 'Pick a product and a quantity above 0 for at least one draft line.',
      })
      return
    }
    for (const l of addable) {
      append({ productId: l.productId, locationId: '', expectedQty: Number(l.quantity) })
    }
    setOcrLines(null)
    setPasteText('')
    toast.success(`${addable.length} ${addable.length === 1 ? 'line' : 'lines'} added to the receipt`, {
      description: 'Pick a destination shelf for each new line below.',
    })
  }

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
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

            {/* Photo / OCR pre-fill (Phase 2) — drafts lines; manual entry below stays the fallback */}
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => void handlePhoto(e.target.files?.[0])}
                aria-label="Invoice photo"
              />
              <Button
                type="button"
                variant="outline"
                disabled={ocrReading}
                onClick={() => fileInputRef.current?.click()}
                className="h-auto w-full flex-col gap-1.5 rounded-lg border-dashed py-5 font-normal"
              >
                {ocrReading ? (
                  <>
                    <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-medium">Reading invoice…</span>
                    <span className="text-xs text-muted-foreground">Usually takes a few seconds</span>
                  </>
                ) : (
                  <>
                    <Camera className="size-5 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-medium">Scan invoice photo</span>
                    <span className="text-xs text-muted-foreground">
                      Take a photo or choose an image — we'll draft the lines for you
                    </span>
                  </>
                )}
              </Button>
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0 py-0 text-xs"
                  onClick={() => setPasteOpen((v) => !v)}
                >
                  <ClipboardPaste className="size-3.5" aria-hidden="true" />
                  {pasteOpen ? 'Hide paste box' : 'Paste invoice text instead'}
                </Button>
                {ocrLines !== null && (
                  <span className="text-xs text-muted-foreground">Draft below — nothing is added until you confirm</span>
                )}
              </div>
              {pasteOpen && (
                <div className="space-y-2">
                  <Textarea
                    rows={3}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={'One product per line, e.g.\nCN-GLV-NIT 40 pcs\nEL-CTL-CX2, 15'}
                    aria-label="Paste invoice text"
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPasteOpen(false)}>
                      Close
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={applyPastedText}
                      disabled={pasteText.trim() === ''}
                    >
                      Read text
                    </Button>
                  </div>
                </div>
              )}

              {ocrLines !== null && (
                <div className="rounded-lg border bg-card p-3" role="region" aria-label="Draft from invoice">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h4 className="text-sm font-medium">
                      {ocrSource === 'photo' ? 'Draft from invoice photo' : 'Draft from pasted text'}
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      {ocrLines.length} {ocrLines.length === 1 ? 'line' : 'lines'} · check each before adding
                    </span>
                  </div>
                  <div className="divide-y">
                    {ocrLines.map((l) => {
                      const matched = l.productId !== ''
                      return (
                        <div key={l.key} className="grid gap-2 py-2.5 first:pt-1.5 last:pb-0 sm:grid-cols-[minmax(0,1fr)_7.5rem] sm:items-center">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {l.matchType === 'exact' ? (
                                <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                  Matched · {l.sku}
                                </span>
                              ) : matched ? (
                                <span className="inline-flex shrink-0 items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                                  Needs review · best guess {l.sku}
                                </span>
                              ) : (
                                <span className="inline-flex shrink-0 items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                                  Not in catalogue — pick manually
                                </span>
                              )}
                              {l.name !== '' && l.sku !== '' && (
                                <span className="truncate text-xs text-muted-foreground">{l.name}</span>
                              )}
                              {l.name !== '' && l.sku === '' && (
                                <span className="truncate font-mono text-xs">{l.name}</span>
                              )}
                            </div>
                            <Select
                              value={l.productId}
                              onValueChange={(v) =>
                                setOcrLines((prev) =>
                                  (prev ?? []).map((row) => (row.key === l.key ? { ...row, productId: v } : row))
                                )
                              }
                            >
                              <SelectTrigger className="h-8 w-full" aria-label={`Product for ${l.sku || l.name}`}>
                                <SelectValue placeholder="Pick product" />
                              </SelectTrigger>
                              <SelectContent>
                                {productGroups.map(([category, products]) => (
                                  <SelectGroup key={category}>
                                    <SelectLabel>{category}</SelectLabel>
                                    {products.map((p) => (
                                      <SelectItem key={p.id} value={String(p.id)}>
                                        <span className="font-mono text-xs">{p.sku}</span> — {p.name}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-2 sm:justify-end">
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              inputMode="numeric"
                              aria-label={`Quantity for ${l.sku || l.name}`}
                              className="h-8 w-full tabular-nums sm:w-24"
                              value={l.quantity}
                              onChange={(e) =>
                                setOcrLines((prev) =>
                                  (prev ?? []).map((row) =>
                                    row.key === l.key ? { ...row, quantity: e.target.value } : row
                                  )
                                )
                              }
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setOcrLines(null)
                        setPasteText('')
                      }}
                    >
                      Discard
                    </Button>
                    <Button type="button" size="sm" onClick={addDraftLines} disabled={addableDraftCount === 0}>
                      <Plus className="size-3.5" aria-hidden="true" />
                      Add {addableDraftCount} {addableDraftCount === 1 ? 'line' : 'lines'} to receipt
                    </Button>
                  </div>
                </div>
              )}
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
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
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
