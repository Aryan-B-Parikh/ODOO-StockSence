/**
 * StockSense — invoice line parsing & catalogue matching (Phase 2).
 *
 * Pure helpers shared by the OCR flow:
 *  - the server route (/api/receipts/ocr) matches VLM-extracted lines against
 *    the product catalogue;
 *  - the client "paste invoice text" fallback (zero-AI) parses plain text
 *    locally and reuses the exact same matcher, so both paths produce the
 *    same review panel.
 */

export interface CatalogueProduct {
  id: number
  sku: string
  name: string
}

export type OcrMatchType = 'exact' | 'fuzzy' | null

export interface OcrLine {
  sku: string
  name: string
  quantity: number
  matchedProductId: number | null
  matchedSku: string | null
  matchType: OcrMatchType
}

export interface OcrLineInput {
  sku: string
  name: string
  quantity: number
}

// ---------- catalogue matching (exact SKU → case-insensitive SKU → fuzzy name) ----------

function normTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

/**
 * Match one extracted invoice line against the catalogue.
 *  1. exact SKU            → matchType 'exact'
 *  2. case-insensitive SKU → matchType 'exact' (typos in case are noise)
 *  3. fuzzy on name (containment either way, or ≥ ½ token overlap) → 'fuzzy'
 * No match → { matchedProductId: null, matchedSku: null, matchType: null }.
 */
export function matchProductLine<T extends CatalogueProduct>(
  line: OcrLineInput,
  catalogue: T[]
): { product: T | null; matchType: OcrMatchType } {
  const sku = line.sku.trim()
  const name = line.name.trim()

  // 1 & 2 — SKU matches
  if (sku !== '') {
    const exact = catalogue.find((p) => p.sku === sku)
    if (exact) return { product: exact, matchType: 'exact' }
    const upper = sku.toUpperCase()
    const ci = catalogue.find((p) => p.sku.toUpperCase() === upper)
    if (ci) return { product: ci, matchType: 'exact' }
  }

  // 3 — fuzzy name match
  if (name !== '') {
    const lower = name.toLowerCase()
    // containment either way ("Nitrile Gloves" vs invoice "Blue Nitrile Gloves L")
    const contained = catalogue.find(
      (p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())
    )
    if (contained) return { product: contained, matchType: 'fuzzy' }

    // token overlap: at least half of the catalogue name's words appear in the invoice name
    const lineTokens = new Set(normTokens(name))
    let best: { p: T; ratio: number } | null = null
    for (const p of catalogue) {
      const nameTokens = normTokens(p.name).filter((t) => t.length >= 3)
      if (nameTokens.length === 0) continue
      const overlap = nameTokens.filter((t) => lineTokens.has(t)).length
      const ratio = overlap / nameTokens.length
      if (ratio >= 0.5 && (!best || ratio > best.ratio)) best = { p, ratio }
    }
    if (best) return { product: best.p, matchType: 'fuzzy' }
  }

  return { product: null, matchType: null }
}

/** Clamp & normalise an extracted quantity into a sane 1–100 000 integer. */
export function clampQuantity(q: unknown): number {
  const n = Math.round(Number(q))
  if (!Number.isFinite(n)) return 1
  return Math.min(100_000, Math.max(1, n))
}

// ---------- plain-text invoice parsing (the zero-AI fallback) ----------

/**
 * Parse pasted invoice text into line inputs. Per line: the first SKU-looking
 * token ([A-Z]{2,}-[A-Z0-9-]+, case-insensitive) plus the first number.
 *   "CN-GLV-NIT 40 pcs"          → { sku: 'CN-GLV-NIT', name: '', quantity: 40 }
 *   "EL-CTL-CX2, 15"             → { sku: 'EL-CTL-CX2', name: '', quantity: 15 }
 *   "Nitrile gloves × 12"        → no SKU-looking token on the line → skipped
 * Lines without either a SKU or a number are ignored; result capped at 25 lines.
 */
export function parseInvoiceText(text: string): OcrLineInput[] {
  const out: OcrLineInput[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    if (out.length >= 25) break
    const line = rawLine.trim()
    if (line === '') continue
    const skuMatch = line.match(/[A-Za-z]{2,}-[A-Za-z0-9-]+/)
    const qtyMatch = line.match(/\d+(?:[.,]\d+)?/)
    if (!skuMatch && !qtyMatch) continue
    const sku = (skuMatch?.[0] ?? '').toUpperCase()
    // the quantity may BE part of the sku (e.g. "CX2" has a 2) — prefer the
    // first number that isn't inside the matched sku span
    let quantity = 1
    if (qtyMatch) {
      const qtyRaw = qtyMatch[0].replace(',', '.')
      quantity = Math.round(Number(qtyRaw))
      if (skuMatch && qtyMatch.index !== undefined) {
        const insideSku =
          qtyMatch.index >= (skuMatch.index ?? 0) && qtyMatch.index < (skuMatch.index ?? 0) + skuMatch[0].length
        if (insideSku) {
          // look for another number after the sku span
          const rest = line.slice((skuMatch.index ?? 0) + skuMatch[0].length)
          const next = rest.match(/\d+(?:[.,]\d+)?/)
          quantity = next ? Math.max(1, Math.round(Number(next[0].replace(',', '.')))) : 1
        }
      }
    }
    if (!Number.isFinite(quantity) || quantity < 1) quantity = 1
    out.push({ sku, name: '', quantity: Math.min(100_000, quantity) })
  }
  return out
}
