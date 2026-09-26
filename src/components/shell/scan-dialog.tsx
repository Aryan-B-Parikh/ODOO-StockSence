'use client'

import jsQR from 'jsqr'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownRight,
  ArrowUpRight,
  Camera,
  CameraOff,
  FlipHorizontal,
  Image as ImageIcon,
  Keyboard,
  MapPin,
  Package,
  RotateCcw,
  ScanLine,
  ScanSearch,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { locationShortCode, matchScanTarget, type ScanLocation, type ScanProduct } from '@/lib/scan'
import type { MetaDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useLockStore } from '@/stores/lock-store'
import { useScanStore } from '@/stores/scan-store'
import { useUIStore } from '@/stores/ui-store'

type ScanTab = 'camera' | 'manual'

/** In-dialog picklist state (a location/product shortlist, or a resolved location). */
type ScanResult =
  | { kind: 'location'; location: ScanLocation }
  | { kind: 'locations'; locations: ScanLocation[]; label: string }
  | { kind: 'products'; products: ScanProduct[] }

type CameraState = 'starting' | 'live' | 'unavailable'

/** Decode interval for the camera loop — snappy 180ms feels instant. */
const DECODE_INTERVAL_MS = 180

function playScanChime() {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.09)
  } catch {
    // Ignore audio permission/context errors
  }
}

function triggerHaptic() {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([40, 50, 40])
    }
  } catch {
    // Ignore
  }
}

/**
 * Global scan dialog (Phase 2 — barcode/QR scan input with a guaranteed
 * manual fallback).
 *
 * Two modes (via the scan store): global (topbar button / "S" key — resolves
 * locations, SKUs and document codes) and location (the New Transfer
 * dialog's scan-to-scan fields — only locations resolve, straight into the
 * route field). The camera tab decodes QR frames with jsQR; whenever the
 * camera is unavailable (headless QA browsers, denied permission, no
 * device) it degrades to a friendly notice and NEVER blocks typed input.
 */
export function ScanDialog() {
  // ── Store wiring ──────────────────────────────────────────────────────────
  const scanOpen = useScanStore((s) => s.scanOpen)
  const scanMode = useScanStore((s) => s.scanMode)
  const scanField = useScanStore((s) => s.scanField)
  const closeScan = useScanStore((s) => s.closeScan)
  const setTransferTarget = useScanStore((s) => s.setTransferTarget)
  const requestNewTransfer = useScanStore((s) => s.requestNewTransfer)

  const openProduct = useUIStore((s) => s.openProduct)
  const setView = useUIStore((s) => s.setView)
  const canTransfer = useAuthStore((s) => s.user?.permissions.includes('transfer') ?? false)

  const isLocationMode = scanMode === 'location'

  // ── Local UI state ────────────────────────────────────────────────────────
  const [tab, setTab] = useState<ScanTab>('camera')
  const [manualValue, setManualValue] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [camState, setCamState] = useState<CameraState>('starting')
  const [cameraNonce, setCameraNonce] = useState(0)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const manualInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Data (locations + product SKUs for the resolver) ─────────────────────
  const metaQ = useQuery({
    queryKey: ['meta'],
    queryFn: () => api.get<MetaDTO>('/api/meta'),
    enabled: scanOpen,
    staleTime: 30_000,
  })

  // Reset transient state whenever the dialog closes. Done in a store
  // subscription callback (the sanctioned external-store → local-state sync
  // point) so it also covers store-driven closes — a resolved scan, a
  // transfer quick action — not just ESC/overlay.
  useEffect(() => {
    const unsub = useScanStore.subscribe((state, prev) => {
      if (prev.scanOpen && !state.scanOpen) {
        setTab('camera')
        setManualValue('')
        setResult(null)
        setCamState('starting')
      }
    })
    return unsub
  }, [])

  // Switching (back) to the camera tab restarts the preview from "starting".
  const switchTab = (next: string) => {
    const target = next as ScanTab
    setTab(target)
    if (target === 'camera') setCamState('starting')
  }

  // Focus the manual input whenever the "Type or paste" tab becomes active.
  useEffect(() => {
    if (scanOpen && tab === 'manual') {
      // Defer a tick so Radix tabs finish mounting the content first.
      const t = setTimeout(() => manualInputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [scanOpen, tab])

  // ── Resolution ────────────────────────────────────────────────────────────
  const applyTransferLocation = useCallback(
    (location: ScanLocation) => {
      const field = useScanStore.getState().scanField
      setTransferTarget(field ?? 'from', location.id)
      closeScan()
      toast.success(
        `Scanned ${locationShortCode(location)} — set as ${field === 'to' ? 'destination' : 'source'}`
      )
    },
    [closeScan, setTransferTarget]
  )

  const handleResolve = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text) return
      const meta = metaQ.data
      if (!meta) {
        if (metaQ.isError) {
          toast.warning("Couldn't load warehouse data — check your connection and try again")
        } else {
          toast.warning('Warehouse data is still loading — try again in a moment')
        }
        return
      }

      const match = matchScanTarget(text, { locations: meta.locations, products: meta.products })
      switch (match.kind) {
        case 'location': {
          if (isLocationMode) {
            applyTransferLocation(match.location)
          } else {
            setResult({ kind: 'location', location: match.location })
          }
          break
        }
        case 'locations': {
          setResult({ kind: 'locations', locations: match.locations, label: match.label })
          break
        }
        case 'product': {
          if (isLocationMode) {
            toast.warning('Scanned a product — pick a location for a transfer')
          } else {
            closeScan()
            toast.success(`Scanned ${match.product.sku} — opening product`)
            openProduct(match.product.id)
          }
          break
        }
        case 'products': {
          if (isLocationMode) {
            toast.warning('Scanned a product — pick a location for a transfer')
          } else {
            setResult({ kind: 'products', products: match.products })
          }
          break
        }
        case 'doc': {
          if (isLocationMode) {
            toast.warning('Scanned a document code — pick a location for a transfer')
          } else {
            closeScan()
            toast.success(`Scanned ${match.doc.code} — opening ${match.doc.viewLabel}`)
            setView(match.doc.view)
          }
          break
        }
        case 'none': {
          toast.warning(`No match for '${text}' — try the SKU, a location code, or a document code`)
          break
        }
      }
    },
    [applyTransferLocation, closeScan, isLocationMode, metaQ.data, metaQ.isError, openProduct, setView]
  )

  // Keep the latest resolver reachable from the camera decode loop without
  // re-running the stream effect on every render.
  const resolveRef = useRef(handleResolve)
  useEffect(() => {
    resolveRef.current = handleResolve
  }, [handleResolve])

  // ── File upload QR scanner (fallback if camera blocked or using stored photo) ──
  const handleImageFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new window.Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxDim = 1200
        const longest = Math.max(img.width, img.height, 1)
        const scale = Math.min(1, maxDim / longest)
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, w, h)
        try {
          const imgData = ctx.getImageData(0, 0, w, h)
          const code = jsQR(imgData.data, w, h, { inversionAttempts: 'attemptBoth' })
          if (code?.data) {
            playScanChime()
            triggerHaptic()
            resolveRef.current(code.data)
          } else {
            toast.warning('No QR code found in this photo — try taking a closer, clearer picture.')
          }
        } catch {
          toast.error("Couldn't process the photo file.")
        }
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [])

  // ── Camera tab (getUserMedia → canvas → jsQR) ─────────────────────────────
  useEffect(() => {
    if (!scanOpen || tab !== 'camera') return
    let cancelled = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    let resolved = false

    const teardown = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
        stream = null
      }
    }

    const decodeFrame = () => {
      if (resolved || cancelled) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (
        !video ||
        !canvas ||
        video.readyState < video.HAVE_CURRENT_DATA ||
        !video.videoWidth ||
        !video.videoHeight
      ) {
        return
      }

      // Downscale to ~800px max dimension — sharp enough for small QR modules, lightweight for CPU
      const maxDim = 800
      const longest = Math.max(video.videoWidth, video.videoHeight)
      const scale = Math.min(1, maxDim / longest)
      const w = Math.max(1, Math.round(video.videoWidth * scale))
      const h = Math.max(1, Math.round(video.videoHeight * scale))
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(video, 0, 0, w, h)
      let image: ImageData
      try {
        image = ctx.getImageData(0, 0, w, h)
      } catch {
        return // tainted/cross-origin frame — skip this tick
      }
      const code = jsQR(image.data, w, h, { inversionAttempts: 'attemptBoth' })
      if (code?.data) {
        resolved = true
        teardown()
        playScanChime()
        triggerHaptic()
        resolveRef.current(code.data)
      }
    }

    const start = async () => {
      const media = navigator.mediaDevices
      if (!media?.getUserMedia) {
        if (!cancelled) setCamState('unavailable')
        return
      }

      // Try environment (back) camera first with ideal constraints, then fallbacks
      const constraintList: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        { video: { facingMode }, audio: false },
        { video: true, audio: false },
      ]

      for (const constraint of constraintList) {
        if (cancelled) return
        try {
          stream = await media.getUserMedia(constraint)
          if (stream) break
        } catch {
          // Continue to next fallback constraint
        }
      }

      if (!stream) {
        if (!cancelled) setCamState('unavailable')
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      video.setAttribute('webkit-playsinline', 'true')
      try {
        await video.play()
      } catch {
        // Autoplay policy — frames may still flow; not fatal.
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      setCamState('live')
      timer = setInterval(decodeFrame, DECODE_INTERVAL_MS)
    }

    void start()
    return () => {
      cancelled = true
      teardown()
    }
  }, [scanOpen, tab, cameraNonce, facingMode])

  // ── Global "S" shortcut ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 's') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (useScanStore.getState().scanOpen) return
      if (useLockStore.getState().locked) return
      // No typing context: skip when an input/textarea/select has focus.
      const el = document.activeElement
      if (
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      ) {
        return
      }
      // No other dialog/sheet on screen.
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) {
        return
      }
      e.preventDefault()
      useScanStore.getState().openScan()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Result interactions ───────────────────────────────────────────────────
  const settleLocation = (location: ScanLocation) => {
    if (isLocationMode) applyTransferLocation(location)
    else setResult({ kind: 'location', location })
  }

  const openScannedProduct = (product: ScanProduct) => {
    closeScan()
    toast.success(`Scanned ${product.sku} — opening product`)
    openProduct(product.id)
  }

  const resetForNextScan = () => {
    setResult(null)
    setManualValue('')
    setCamState('starting')
    setCameraNonce((n) => n + 1)
  }

  const manualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleResolve(manualValue)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={scanOpen} onOpenChange={(next) => !next && closeScan()}>
      <DialogContent className="max-h-[88vh] gap-4 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            {isLocationMode ? 'Scan location' : 'Scan barcode / QR'}
          </DialogTitle>
          <DialogDescription>
            {isLocationMode
              ? `Scan the ${scanField === 'to' ? 'destination' : 'source'} location's QR label — or type its code below.`
              : 'Scan a QR label with the camera, or type/paste any code — SKUs, locations and document codes all resolve.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={switchTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="camera">
              <Camera className="size-4" aria-hidden="true" /> Camera
            </TabsTrigger>
            <TabsTrigger value="manual">
              <Keyboard className="size-4" aria-hidden="true" /> Type or paste
            </TabsTrigger>
          </TabsList>

          {/* ── Camera tab ── */}
          <TabsContent value="camera" className="mt-3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-stone-950">
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                className={cn('size-full object-cover', camState !== 'live' && 'opacity-0')}
                aria-label="Camera preview"
              />

              {camState === 'live' && (
                <>
                  {/* Scan-frame overlay — 4 corner brackets + sweeping scan line */}
                  <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                    <div className="absolute top-1/2 left-1/2 size-44 -translate-x-1/2 -translate-y-1/2 sm:size-52">
                      <span className="absolute top-0 left-0 size-6 rounded-tl-lg border-t-2 border-l-2 border-teal-300/90" />
                      <span className="absolute top-0 right-0 size-6 rounded-tr-lg border-t-2 border-r-2 border-teal-300/90" />
                      <span className="absolute bottom-0 left-0 size-6 rounded-bl-lg border-b-2 border-l-2 border-teal-300/90" />
                      <span className="absolute right-0 bottom-0 size-6 rounded-br-lg border-b-2 border-r-2 border-teal-300/90" />
                      <span className="scanline absolute inset-x-2.5 h-0.5 rounded-full bg-teal-300/80 shadow-[0_0_12px_rgba(45,212,191,0.65)]" />
                    </div>
                  </div>
                  <span className="absolute bottom-2.5 left-1/2 -translate-x-1/2 animate-pulse rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-teal-100 backdrop-blur-sm">
                    Scanning…
                  </span>
                </>
              )}

              {camState === 'starting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-stone-400">
                  <span className="pulse-dot size-2.5 rounded-full bg-teal-400" aria-hidden="true" />
                  <p className="text-xs">Starting camera…</p>
                </div>
              )}

              {camState === 'unavailable' && (
                <div
                  role="status"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/40 px-6 text-center"
                >
                  <span className="flex size-11 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <CameraOff className="size-5" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-medium">Camera unavailable</p>
                  <p className="-mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    No camera access on this device — type or paste the code instead.
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={() => setTab('manual')}>
                    <Keyboard className="size-4" aria-hidden="true" /> Type or paste instead
                  </Button>
                </div>
              )}
            </div>

            {/* Camera toolbar: flip camera + scan from photo */}
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))
                  setCamState('starting')
                  setCameraNonce((n) => n + 1)
                }}
              >
                <FlipHorizontal className="size-3.5" aria-hidden="true" /> Flip camera
              </Button>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageFile}
                  aria-label="Upload photo to scan"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-2.5 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="size-3.5" aria-hidden="true" /> Scan from photo
                </Button>
              </div>
            </div>

            <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
          </TabsContent>

          {/* ── Manual tab (the guaranteed fallback) ── */}
          <TabsContent value="manual" className="mt-3">
            <form onSubmit={manualSubmit} className="space-y-3">
              <div className="flex gap-2">
                <Input
                  ref={manualInputRef}
                  value={manualValue}
                  onChange={(e) => {
                    setManualValue(e.target.value)
                    if (result) setResult(null)
                  }}
                  placeholder={isLocationMode ? 'Location code or label — e.g. A1-S1' : 'SKU, location, or document code'}
                  className="min-w-0 flex-1 font-mono text-sm"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label="Scan code input"
                />
                <Button type="submit" size="sm" className="shrink-0" disabled={!manualValue.trim()}>
                  <ScanSearch className="size-4" aria-hidden="true" /> Resolve
                </Button>
              </div>

              {/* 1-tap quick test chips */}
              <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2.5">
                <p className="text-[11px] font-medium text-muted-foreground">Tap any code to test instant resolve:</p>
                <div className="flex flex-wrap gap-1.5">
                  {(isLocationMode
                    ? ['A1-S1', 'A1-S2', 'Rack A1', 'Zone A', 'WH1 · Zone A · Rack A1 · Shelf S1']
                    : ['RM-STL-ROD10', 'EL-CTL-CX2', 'A1-S1', 'Rack A1', 'RCPT-1002', 'DEL-1001']
                  ).map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => {
                        setManualValue(sample)
                        handleResolve(sample)
                      }}
                      className="rounded-md border bg-background px-2 py-0.5 font-mono text-[11px] font-medium text-foreground/80 shadow-xs transition-colors hover:border-teal-500/50 hover:bg-teal-500/10 hover:text-teal-700 dark:hover:text-teal-300"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </TabsContent>
        </Tabs>

        {/* ── Result: a single resolved location ── */}
        {result?.kind === 'location' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <MapPin className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs leading-snug font-semibold break-words">
                    {result.location.fullPath}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {result.location.warehouseName} · {result.location.zoneName} · Rack {result.location.rackCode} ·
                    Shelf {result.location.code}
                  </p>
                </div>
                <span className="shrink-0 rounded-md border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-teal-700 dark:text-teal-400">
                  {locationShortCode(result.location)}
                </span>
              </div>
              {canTransfer && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-teal-500/40 bg-teal-500/10 text-teal-700 hover:bg-teal-500/20 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                    onClick={() => requestNewTransfer('from', result.location.id)}
                  >
                    <ArrowUpRight className="size-4" aria-hidden="true" /> New transfer from here
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-teal-500/40 bg-teal-500/10 text-teal-700 hover:bg-teal-500/20 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                    onClick={() => requestNewTransfer('to', result.location.id)}
                  >
                    <ArrowDownRight className="size-4" aria-hidden="true" /> New transfer to here
                  </Button>
                </div>
              )}
            </div>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={resetForNextScan}>
              <RotateCcw className="size-3.5" aria-hidden="true" /> Scan something else
            </Button>
          </div>
        )}

        {/* ── Result: multiple locations (rack/zone/shelf-code ambiguity) ── */}
        {result?.kind === 'locations' && (
          <div className="rounded-lg border p-3">
            <p className="text-xs font-semibold">
              {result.label} — {result.locations.length} {result.locations.length === 1 ? 'location' : 'locations'}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Pick the shelf you scanned:</p>
            <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {result.locations.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => settleLocation(l)}
                  className="flex w-full items-center gap-2.5 rounded-md border bg-background px-2.5 py-2 text-left transition-colors hover:border-teal-500/40 hover:bg-teal-500/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                >
                  <span className="shrink-0 rounded border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-teal-700 dark:text-teal-400">
                    {locationShortCode(l)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                    {l.fullPath}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Result: multiple products (SKU prefix ambiguity) ── */}
        {result?.kind === 'products' && (
          <div className="rounded-lg border p-3">
            <p className="text-xs font-semibold">
              {result.products.length} SKUs start with this code
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Pick the product you scanned:</p>
            <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {result.products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openScannedProduct(p)}
                  className="flex w-full items-center gap-2.5 rounded-md border bg-background px-2.5 py-2 text-left transition-colors hover:border-teal-500/40 hover:bg-teal-500/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                >
                  <Package className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      <span className="font-mono text-xs font-medium">{p.sku}</span>{' '}
                      <span className="text-xs text-muted-foreground">{p.name}</span>
                    </span>
                    <span className="block text-[11px] text-muted-foreground tabular">
                      {p.onHand} on hand · {p.available} available
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Meta loading state (first open, no cached data yet) ── */}
        {metaQ.isPending && scanOpen && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
            <Skeleton className="size-4 rounded-full" />
            <p className="text-[11px] text-muted-foreground">Loading warehouse index…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
