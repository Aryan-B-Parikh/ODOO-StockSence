'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Mic, Plus, Trash2 } from 'lucide-react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { fmtQty } from '@/lib/format'
import { enqueueableMutation } from '@/lib/offline-replay'
import { parseAdjustmentSpeech } from '@/lib/speech'
import type { AdjustmentDTO, MetaDTO, ProductDTO, ProductListDTO, StockByLocationDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

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

/** Fields the voice parser just filled → briefly ring them teal so the eye lands on them. */
type VoiceHighlight = { product?: boolean; location?: boolean; qty?: boolean; reason?: boolean }

/** "New Adjustment" dialog — count variances routed by the severity engine. */
export function NewAdjustmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [reasonTouched, setReasonTouched] = useState(false)
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([newLine()])

  // ---- Voice dictation (Phase 2) — a HELPER; every manual field stays usable ----
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [transcriptApplied, setTranscriptApplied] = useState(false)
  const [voiceHighlight, setVoiceHighlight] = useState<VoiceHighlight>({})
  const recRef = useRef<any>(null)
  const highlightTimeoutRef = useRef<number | null>(null)

  // Feature-detect once (client only) — hidden behind typeof window for SSR.
  const srSupported = useMemo(
    () => typeof window !== 'undefined' && !!((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition),
    []
  )

  // Kill any live recognition / pending highlight timer when the dialog unmounts.
  useEffect(
    () => () => {
      try {
        recRef.current?.abort?.()
      } catch {}
      if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current)
    },
    []
  )

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
    // Offline-aware (Phase 2): an OfflineError (airplane-mode simulation or a
    // real network drop) parks the adjustment in the device queue instead of
    // failing — the replay engine syncs it and refreshes data on reconnect.
    mutationFn: () => {
      const body = {
        reason: reason.trim(),
        note: note.trim() || undefined,
        lines: lines.map((l) => ({
          productId: l.productId!,
          locationId: l.locationId!,
          countedQty: Number(l.countedQty),
        })),
      }
      return enqueueableMutation({
        label: `Adjustment "${reason.trim()}" (${lines.length} ${lines.length === 1 ? 'line' : 'lines'})`,
        method: 'POST',
        path: '/api/adjustments',
        body,
        submit: () => api.post<CreateAdjustmentResponse>('/api/adjustments', body),
      })
    },
    onSuccess: (res) => {
      if (res.queued) {
        // Saved offline — no server response yet: close the dialog, skip
        // the toasts/invalidations (the replay engine refreshes after sync).
        reset()
        onOpenChange(false)
        return
      }
      const { adjustment, explanation, flagsCreated, severity } = res.data
      // The engine's explanation is the star — show it verbatim with the severity.
      const description = `${adjustment.code} · Severity: ${severity}${flagsCreated.length > 0 ? ' · review flag opened' : ''}`
      if (severity === 'HIGH') {
        toast.warning(explanation, { description })
      } else if (severity === 'MEDIUM') {
        toast.warning(explanation, { description })
      } else {
        toast.success(explanation, { description })
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
    stopListening()
    setTranscript(null)
    setTranscriptApplied(false)
    setVoiceHighlight({})
  }

  const stopListening = () => {
    try {
      recRef.current?.stop?.()
    } catch {}
    recRef.current = null
    setListening(false)
  }

  /** Parse a final transcript and merge matched parts into the first line / reason. */
  const applyTranscript = (text: string) => {
    setTranscript(text)
    const parsed = parseAdjustmentSpeech(
      text,
      products.map((p: ProductDTO) => ({ id: p.id, sku: p.sku, name: p.name })),
      locations.map((l) => ({ id: l.id, rackCode: l.rackCode, code: l.code, fullPath: l.fullPath }))
    )

    const parts: string[] = []
    const highlight: VoiceHighlight = {}
    if (parsed.product) {
      parts.push(parsed.product.name)
      highlight.product = true
    }
    if (parsed.location) {
      parts.push(`${parsed.location.rackCode}-${parsed.location.code}`)
      highlight.location = true
    }
    if (parsed.deltaQty !== undefined) {
      highlight.qty = true
      parts.push(parsed.absolute ? `= ${parsed.deltaQty}` : `${parsed.deltaQty >= 0 ? '+' : '−'}${Math.abs(parsed.deltaQty)}`)
    }
    // Only fill the reason when it's still empty — never overwrite typing.
    const willSetReason = parsed.reason !== undefined && reason.trim() === ''
    if (parsed.reason && willSetReason) {
      parts.push(parsed.reason.split('—')[0].trim())
      highlight.reason = true
    }

    if (parts.length === 0) {
      setTranscriptApplied(false)
      toast.warning("Couldn't parse that — fill the fields manually", {
        description: `I heard “${text}”`,
      })
      return
    }

    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== 0) return l
        const next = { ...l }
        if (parsed.product) next.productId = parsed.product.id
        if (parsed.location) next.locationId = parsed.location.id
        if (parsed.deltaQty !== undefined) {
          if (parsed.absolute) {
            next.countedQty = String(parsed.deltaQty)
          } else {
            // the dialog records the ABSOLUTE counted qty — convert the signed
            // delta against the system on-hand at the matched product/location.
            const key = `${parsed.product?.id ?? next.productId}:${parsed.location?.id ?? next.locationId}`
            const sys = stockAt.get(key)?.onHand ?? 0
            next.countedQty = String(Math.max(0, sys + parsed.deltaQty))
          }
        }
        return next
      })
    )
    if (willSetReason && parsed.reason !== undefined) setReason(parsed.reason)
    setTranscriptApplied(true)
    setVoiceHighlight(highlight)
    if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current)
    highlightTimeoutRef.current = window.setTimeout(() => setVoiceHighlight({}), 1800)
    toast.success(`Heard: ${parts.join(' · ')}`, {
      description: 'Fields filled below — review before posting.',
    })
  }

  const startListening = () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) return
    try {
      recRef.current?.abort?.()
    } catch {}
    const rec = new SR()
    recRef.current = rec
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.continuous = false
    rec.maxAlternatives = 1
    rec.onresult = (event: any) => {
      const text: string = event.results?.[0]?.[0]?.transcript ?? ''
      if (text.trim() !== '') applyTranscript(text.trim())
    }
    rec.onerror = () => {
      setListening(false)
      toast.warning("Didn't catch that", { description: 'Tap the mic and try again — or fill the fields below.' })
    }
    rec.onend = () => setListening(false)
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
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

        {/* Voice dictation (Phase 2) — helper only; the manual fields below are the fallback */}
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={listening ? stopListening : startListening}
                disabled={!srSupported}
                aria-label={srSupported ? 'Dictate adjustment (voice)' : 'Voice input not supported in this browser'}
                aria-pressed={listening}
                className={cn(
                  'size-9 shrink-0 rounded-full transition-all',
                  listening && 'animate-pulse border-red-500/50 bg-red-500/10 text-red-600 ring-2 ring-red-400/40 hover:bg-red-500/15 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400'
                )}
              >
                <Mic className="size-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {!srSupported
                ? 'Voice input not supported in this browser — use the fields below'
                : listening
                  ? 'Listening — tap to stop'
                  : 'Dictate adjustment (voice)'}
            </TooltipContent>
          </Tooltip>
          {listening ? (
            <p
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300"
              role="status"
            >
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
              <span className="truncate">Listening… try: “Nitrile gloves plus two at A1 S1”</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {srSupported ? 'Dictate it instead — try “Nitrile gloves plus two at A1 S1”' : 'Voice input not available — use the fields below'}
            </p>
          )}
        </div>

        {transcript && (
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs" role="status">
            <span className="text-muted-foreground">I heard: </span>
            <span className="font-mono">“{transcript}”</span>
            {transcriptApplied && (
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Voice input is a helper — always review before posting.
              </span>
            )}
          </div>
        )}

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
            aria-describedby={reasonIssue && reasonTouched ? 'adj-reason-error' : undefined}
            required
            className={cn('transition-all duration-500', voiceHighlight.reason && 'border-teal-500/50 ring-2 ring-teal-500/60')}
          />
          {reasonIssue && reasonTouched && (
            <p id="adj-reason-error" role="alert" className="text-xs font-medium text-red-600">
              {reasonIssue}
            </p>
          )}
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

          {lines.map((line, i) => {
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
                      <SelectTrigger
                        id={`product-${line.key}`}
                        className={cn(
                          'w-full transition-all duration-500',
                          i === 0 && voiceHighlight.product && 'border-teal-500/50 ring-2 ring-teal-500/60'
                        )}
                        disabled={productsQ.isPending}>
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
                      <SelectTrigger
                        id={`location-${line.key}`}
                        className={cn(
                          'w-full transition-all duration-500',
                          i === 0 && voiceHighlight.location && 'border-teal-500/50 ring-2 ring-teal-500/60'
                        )}
                        disabled={metaQ.isPending}>
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
                      aria-describedby={
                        line.countedQty !== '' && !lineValid(line) ? `counted-${line.key}-error` : undefined
                      }
                      className={cn(
                        'transition-all duration-500',
                        i === 0 && voiceHighlight.qty && 'border-teal-500/50 ring-2 ring-teal-500/60'
                      )}
                    />
                    {line.countedQty !== '' && !lineValid(line) && (
                      <p
                        id={`counted-${line.key}-error`}
                        role="alert"
                        className="text-[11px] font-medium text-red-600"
                      >
                        {line.productId == null || line.locationId == null
                          ? 'Choose a product and location for this line.'
                          : 'Counted quantity must be a whole number of 0 or more.'}
                      </p>
                    )}
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
