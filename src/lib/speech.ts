/**
 * StockSense — voice-to-text parsing for stock adjustments (Phase 2).
 *
 * Pure, dependency-free helpers: turn a Web Speech transcript like
 * "nitrile gloves plus two at A1 S1" into structured form fields.
 * The dialog stays the source of truth — the parser only SUGGESTS
 * fills; every field remains manually editable (the non-negotiable
 * fallback for misheard input).
 */

export interface SpeechProductMeta {
  id: number
  sku: string
  name: string
}

export interface SpeechLocationMeta {
  id: number
  rackCode: string
  code: string
  fullPath: string
}

export interface ParsedAdjustment {
  /** fuzzy-matched product from the catalogue (name / spoken-SKU overlap) */
  product?: SpeechProductMeta
  /** matched location ("A1 S1" / "A1-S1" / "rack A1 shelf S1" forms) */
  location?: SpeechLocationMeta
  /** signed delta parsed from the utterance, e.g. +2 / −3 (default sign: +) */
  deltaQty?: number
  /** true when the utterance said "set to 25" — deltaQty then holds the absolute target */
  absolute?: boolean
  /** reason phrase derived from words like "damaged" / "found" / "lost" / "correction" */
  reason?: string
}

// ---------- text normalisation ----------

/** lowercase, keep letters/digits, collapse everything else to single spaces */
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

/** same as tokens() but with ALL spaces removed — "a1 s1" → "a1s1" (spoken-code matching) */
function squashed(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// ---------- number words ("two" / "twenty five" / "one hundred twenty" / "2") ----------

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
}

/**
 * First number in the token stream: either a digit token ("2", "25") or a run
 * of number words ("two", "twenty five", "one hundred twenty" → 120).
 */
function firstNumber(words: string[]): number | undefined {
  let i = 0
  while (i < words.length) {
    const w = words[i]
    if (/^\d+$/.test(w)) {
      const n = Number(w)
      if (Number.isFinite(n)) return n
      i++
      continue
    }
    if (w in NUMBER_WORDS) {
      // accumulate a compound number-word run
      let total = 0
      let current = 0
      let matched = false
      while (i < words.length) {
        const t = words[i]
        if (/^\d+$/.test(t)) break
        const v = NUMBER_WORDS[t]
        if (v === undefined) break
        matched = true
        if (v === 100) {
          current = (current || 1) * 100
          total += current
          current = 0
        } else {
          current += v
        }
        i++
      }
      if (matched) return total + current
      continue
    }
    i++
  }
  return undefined
}

// ---------- sign & absolute hints ----------

const POSITIVE_WORDS = new Set(['plus', 'add', 'added', 'adding', 'increase', 'increased', 'more', 'gain', 'gained'])
const NEGATIVE_WORDS = new Set(['minus', 'remove', 'removed', 'reduce', 'reduced', 'subtract', 'subtracted', 'less', 'short', 'missing', 'lost', 'damaged', 'damage'])

/** "set to 25" / "sets to" / "counted" → the number is an absolute target, not a delta. */
function absoluteHint(rawText: string): boolean {
  return /\bsets?\s+to\b/.test(rawText) || /\bset\s+at\b/.test(rawText) || /\bcounted\b/.test(rawText)
}

// ---------- reason words ----------

const REASON_PHRASES: [RegExp, string][] = [
  [/damag|broken|spoil|crush|leak/, 'Damaged goods found on shelf'],
  [/\bfound\b|\bdiscovered\b/, 'Found stock — location correction'],
  [/\blost\b|\bmissing\b|\bstolen\b|\btheft\b/, 'Lost / missing stock'],
  [/correct|recount|mistake|error|fix/, 'Count correction'],
  [/expir/, 'Expired stock removed'],
]

function reasonPhrase(words: string[]): string | undefined {
  const joined = words.join(' ')
  for (const [re, phrase] of REASON_PHRASES) if (re.test(joined)) return phrase
  return undefined
}

// ---------- product fuzzy match ----------

/**
 * Best catalogue match: full product-name token overlap, or the full spoken
 * SKU ("CN GLV NIT" → every sku token present). Needs ≥ 2 score (a complete
 * single-word name, or ≥ 2 overlapping words) so common words alone never win.
 */
function matchProduct(words: string[], products: SpeechProductMeta[]): SpeechProductMeta | undefined {
  const bag = new Set(words)
  const squashedText = words.join('')
  let best: SpeechProductMeta | undefined
  let bestScore = 0
  for (const p of products) {
    const nameTokens = tokens(p.name).filter((t) => t.length >= 3)
    const skuTokens = tokens(p.sku.replace(/-/g, ' '))
    let score = 0
    const nameOverlap = nameTokens.filter((t) => bag.has(t)).length
    if (nameTokens.length > 0 && nameOverlap === nameTokens.length) score = nameTokens.length * 2
    else score = nameOverlap
    if (skuTokens.length > 0 && skuTokens.every((t) => bag.has(t))) {
      score = Math.max(score, skuTokens.length * 2 + 1)
    }
    // spoken squashed sku, e.g. "cnglvnit" — rare but a strong signal
    if (squashedText.includes(squashed(p.sku)) && p.sku.length >= 4) score = Math.max(score, 10)
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  return bestScore >= 2 ? best : undefined
}

// ---------- location match ----------

/**
 * Match "A1-S1" / "A1 S1" / "a 1 s 1" / "rack A1 shelf S1" / full-path words
 * against a location's rackCode + code (dash/space/case-insensitive).
 */
function matchLocation(rawText: string, words: string[], locations: SpeechLocationMeta[]): SpeechLocationMeta | undefined {
  const squashedText = squashed(rawText)
  const bag = words
  for (const loc of locations) {
    const rack = loc.rackCode.toLowerCase()
    const shelf = loc.code.toLowerCase()
    // 1. squashed containment: "a1s1" inside "...ata1s1and..." (catches "a 1 s 1" too)
    if (squashedText.includes(`${rack}${shelf}`)) return loc
    // 2. token adjacency with a small window: rack and shelf tokens within 2 words
    let rackIdx = -1
    for (let i = 0; i < bag.length; i++) {
      if (bag[i] === rack) {
        rackIdx = i
        break
      }
    }
    if (rackIdx >= 0) {
      for (let j = Math.max(0, rackIdx - 2); j <= Math.min(bag.length - 1, rackIdx + 2); j++) {
        if (bag[j] === shelf) return loc
      }
    }
  }
  return undefined
}

// ---------- the parser ----------

/**
 * Parse an adjustment voice transcript into suggested form fills.
 * Example: "nitrile gloves plus two at A1 S1" →
 *   { product: Nitrile Gloves, location: A1-S1, deltaQty: +2 }
 * "controller board set to twenty five damaged" →
 *   { product: …, deltaQty: 25, absolute: true, reason: 'Damaged goods…' }
 * Unmatched parts are simply omitted — the caller leaves those fields alone.
 */
export function parseAdjustmentSpeech(
  text: string,
  products: SpeechProductMeta[],
  locations: SpeechLocationMeta[]
): ParsedAdjustment {
  const words = tokens(text)
  if (words.length === 0) return {}

  const parsed: ParsedAdjustment = {}

  const product = matchProduct(words, products)
  if (product) parsed.product = product

  const location = matchLocation(text, words, locations)
  if (location) parsed.location = location

  const num = firstNumber(words)
  if (num !== undefined) {
    const negative = words.some((w) => NEGATIVE_WORDS.has(w))
    const positive = words.some((w) => POSITIVE_WORDS.has(w))
    parsed.deltaQty = negative && !positive ? -num : num
    parsed.absolute = absoluteHint(text)
  }

  const reason = reasonPhrase(words)
  if (reason) parsed.reason = reason

  return parsed
}
