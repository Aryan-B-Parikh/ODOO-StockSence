/**
 * StockSense — scan input parsing & matching (Phase 2 interaction).
 *
 * One pure resolver shared by every scan surface (global topbar scan dialog
 * and the transfer scan-to-scan fields). Takes raw scanner/keyboard text and
 * resolves it against the /api/meta index (locations + products) in priority
 * order:
 *
 *   1. Location QR label text — printed labels encode the location's plain
 *      text, so the exact fullPath, a rack+shelf composite ("A1-S1"), a bare
 *      shelf code, a rack, or a zone name all resolve. Comparison is
 *      case-insensitive and separator-insensitive (spaces, dashes, "·" …).
 *   2. Product SKU — exact match first, then a unique prefix match
 *      (ambiguous prefixes return a shortlist to pick from).
 *   3. Document code — RCPT-/DEL-/TRF-/ADJ-/CNT-/LEDGER-… navigates to the
 *      owning view.
 *
 * Kept pure (no React, no fetching) so it stays readable and reusable.
 */

import type { MetaDTO } from '@/lib/types'
import type { ViewKey } from '@/stores/ui-store'

export type ScanLocation = MetaDTO['locations'][number]
export type ScanProduct = MetaDTO['products'][number]

/** Document code → the view that owns it (scan navigates there). */
export interface ScanDocTarget {
  code: string
  view: ViewKey
  viewLabel: string
}

/** Fuzzy comparison key: lowercase, alphanumerics only. */
export function normalizeScanKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export interface ParsedScanInput {
  /** Trimmed raw text, exactly as typed or scanned. */
  raw: string
  /** Trimmed + uppercased — SKUs, codes and doc prefixes read naturally in caps. */
  text: string
  /** Fuzzy key (see normalizeScanKey). */
  key: string
  /** Document code, when the input is exactly one. */
  doc: ScanDocTarget | null
}

const DOC_CODES: { re: RegExp; view: ViewKey; viewLabel: string }[] = [
  { re: /^LEDGER-\d{4}-\d+$/, view: 'history', viewLabel: 'Move History' },
  { re: /^RCPT-\d+$/, view: 'receipts', viewLabel: 'Receipts' },
  { re: /^DEL-\d+$/, view: 'deliveries', viewLabel: 'Deliveries' },
  { re: /^TRF-\d+$/, view: 'transfers', viewLabel: 'Transfers' },
  { re: /^ADJ-\d+$/, view: 'adjustments', viewLabel: 'Adjustments' },
  { re: /^CNT-\d+$/, view: 'counts', viewLabel: 'Cycle Counts' },
]

/** Parse raw scan text: trim, uppercase, compute the fuzzy key, extract a doc code. */
export function parseScanInput(raw: string): ParsedScanInput {
  let trimmed = raw.trim()
  // Handle scanned URLs (e.g. from mobile or QR codes containing URL links)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const u = new URL(trimmed)
      const codeParam =
        u.searchParams.get('code') ||
        u.searchParams.get('scan') ||
        u.searchParams.get('q') ||
        u.searchParams.get('sku') ||
        u.searchParams.get('target')
      if (codeParam) {
        trimmed = codeParam.trim()
      } else {
        const segments = u.pathname.split('/').filter(Boolean)
        if (segments.length > 0) {
          trimmed = decodeURIComponent(segments[segments.length - 1]).trim()
        }
      }
    } catch {
      // Keep trimmed as-is
    }
  }

  const text = trimmed.toUpperCase()
  const doc = DOC_CODES.find((d) => d.re.test(text)) ?? null
  return {
    raw: trimmed,
    text,
    key: normalizeScanKey(trimmed),
    doc: doc ? { code: text, view: doc.view, viewLabel: doc.viewLabel } : null,
  }
}

export type ScanMatch =
  | { kind: 'location'; location: ScanLocation }
  | { kind: 'locations'; locations: ScanLocation[]; label: string }
  | { kind: 'product'; product: ScanProduct }
  | { kind: 'products'; products: ScanProduct[] }
  | { kind: 'doc'; doc: ScanDocTarget }
  | { kind: 'none' }

export interface ScanIndex {
  locations: ScanLocation[]
  products: ScanProduct[]
}

/** Short display code for a location — the rack+shelf form used on labels ("A1-S1"). */
export function locationShortCode(l: ScanLocation): string {
  return `${l.rackCode}-${l.code}`
}

/** Human label for a group of locations (shared rack → rack, shared zone → zone …). */
function describeLocationGroup(list: ScanLocation[]): string {
  if (list.length === 0) return 'Locations'
  const racks = new Set(list.map((l) => l.rackCode))
  const zones = new Set(list.map((l) => l.zoneName))
  const warehouses = new Set(list.map((l) => l.warehouseName))
  if (racks.size === 1) return `Rack ${list[0].rackCode}`
  if (zones.size === 1) return list[0].zoneName
  if (warehouses.size === 1) return list[0].warehouseName
  return 'Locations'
}

type LocationMatch = Extract<ScanMatch, { kind: 'location' | 'locations' }>

/** Location resolution — first matching rule wins; ambiguous rules return a picklist. */
function matchLocation(parsed: ParsedScanInput, locations: ScanLocation[]): LocationMatch | null {
  const key = parsed.key
  if (key.length < 2) return null

  const pick = (list: ScanLocation[], label?: string): LocationMatch =>
    list.length === 1
      ? { kind: 'location', location: list[0] }
      : { kind: 'locations', locations: list, label: label ?? describeLocationGroup(list) }

  // (a) exact full label text — "WH1 · Zone A · Rack A1 · Shelf S1"
  let hits = locations.filter((l) => normalizeScanKey(l.fullPath) === key)
  if (hits.length > 0) return pick(hits)

  // (b) rack + shelf composite — "A1-S1"
  hits = locations.filter((l) => normalizeScanKey(`${l.rackCode}${l.code}`) === key)
  if (hits.length > 0) return pick(hits)

  // (c) bare shelf code — "S1" (matches every rack's S1 → picklist)
  hits = locations.filter((l) => normalizeScanKey(l.code) === key)
  if (hits.length > 0) return pick(hits, `Shelf ${hits[0].code}`)

  // (d) rack — "A1" or "Rack A1"
  hits = locations.filter(
    (l) => normalizeScanKey(l.rackCode) === key || `rack${normalizeScanKey(l.rackCode)}` === key
  )
  if (hits.length > 0) return pick(hits)

  // (d2) zone + rack composite — "Zone A/A1", "Zone A / Rack A1", "Zone A - A1"
  hits = locations.filter((l) => {
    const zr = normalizeScanKey(`${l.zoneName}${l.rackCode}`)
    const zrw = normalizeScanKey(`${l.zoneName}rack${l.rackCode}`)
    return zr === key || zrw === key
  })
  if (hits.length > 0) return pick(hits)

  // (e) zone name or its prefix — "Zone A", "Zone A · Bulk Storage"
  if (key.length >= 4) {
    hits = locations.filter((l) => {
      const zone = normalizeScanKey(l.zoneName)
      return zone === key || zone.startsWith(key)
    })
    if (hits.length > 0) return pick(hits)
  }

  // (f) path prefix/fragment — "WH1 · Zone A", "Rack A1 · Shelf S1" (specific enough)
  if (key.length >= 6) {
    hits = locations.filter((l) => {
      const path = normalizeScanKey(l.fullPath)
      return path.startsWith(key) || path.includes(key)
    })
    if (hits.length > 0) return pick(hits)
  }

  return null
}

type ProductMatch = Extract<ScanMatch, { kind: 'product' | 'products' }>

/** Product resolution — exact SKU first, then a unique prefix. */
function matchProduct(parsed: ParsedScanInput, products: ScanProduct[]): ProductMatch | null {
  const text = parsed.text
  if (!text) return null
  const exact = products.filter((p) => p.sku.toUpperCase() === text)
  if (exact.length > 0) return { kind: 'product', product: exact[0] }
  const prefix = products.filter((p) => p.sku.toUpperCase().startsWith(text))
  if (prefix.length === 1) return { kind: 'product', product: prefix[0] }
  if (prefix.length > 1) return { kind: 'products', products: prefix.slice(0, 8) }
  return null
}

/**
 * Resolve raw scan text against the meta index. Priority: location label →
 * SKU → document code → none. Pure — safe to call from any surface.
 */
export function matchScanTarget(raw: string, index: ScanIndex): ScanMatch {
  const parsed = parseScanInput(raw)
  if (!parsed.raw) return { kind: 'none' }

  const location = matchLocation(parsed, index.locations)
  if (location) return location

  const product = matchProduct(parsed, index.products)
  if (product) return product

  if (parsed.doc) return { kind: 'doc', doc: parsed.doc }

  return { kind: 'none' }
}
