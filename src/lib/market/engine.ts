/**
 * StockSense — Deterministic Market Engine
 *
 * Generates a fully deterministic, time-seeded simulated market:
 *  - Daily closes: mean-reverting random walk from a FIXED anchor date, so any
 *    process (Next.js API, WebSocket service) computing at the same wall-clock
 *    time produces IDENTICAL prices without any shared state.
 *  - Intraday: Brownian-bridge minute bars for "today" converging to today's
 *    destined close, with sub-minute deterministic jitter for live feel.
 *  - All randomness is derived from hash(symbol, dateKey, stream) seeds.
 *
 * IMPORTANT: keep this module dependency-free (no Next.js, no Node built-ins
 * beyond what Bun/Node both provide) — it is imported by the market-ticker
 * mini-service via a relative path.
 */

import { STOCKS, STOCK_BY_SYMBOL, INDICES, type StockDef } from './universe'

// ---------------------------------------------------------------------------
// PRNG utilities
// ---------------------------------------------------------------------------

export function hashString(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(rng: () => number): number {
  // Box–Muller
  const u = Math.max(rng(), 1e-9)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ---------------------------------------------------------------------------
// Date helpers (UTC day keys)
// ---------------------------------------------------------------------------

export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function dateKeyToDate(key: string): Date {
  return new Date(key + 'T00:00:00.000Z')
}

export function addDays(key: string, days: number): string {
  const d = dateKeyToDate(key)
  d.setUTCDate(d.getUTCDate() + days)
  return utcDateKey(d)
}

/** Trading calendar: the simulation trades 7 days a week (24/7 sim market). */
export function tradingDayKeys(endKey: string, count: number): string[] {
  const keys: string[] = []
  let k = endKey
  for (let i = 0; i < count; i++) {
    keys.push(k)
    k = addDays(k, -1)
  }
  return keys.reverse()
}

// ---------------------------------------------------------------------------
// Engine state (cached on globalThis to survive HMR)
// ---------------------------------------------------------------------------

const ANCHOR_DATE = '2023-01-02' // fixed so historical values never change
const MINUTES_PER_DAY = 1440

interface SymbolState {
  /** dateKeys aligned with `closes`, always ending at "today" (inclusive). */
  dates: string[]
  /** Daily closes for dates. */
  closes: number[]
  /** Intraday minute closes for today. */
  intraDate: string
  intraCloses: number[]
  intraVolumes: number[]
  intraOpen: number
  /** Cached day stats. */
  dayStatsDate: string
  dayVolumeBase: number
}

interface EngineState {
  symbols: Map<string, SymbolState>
}

const g = globalThis as unknown as { __snsEngine?: EngineState }

function getState(): EngineState {
  if (!g.__snsEngine) g.__snsEngine = { symbols: new Map() }
  return g.__snsEngine
}

function getSymbolState(symbol: string): SymbolState {
  const st = getState()
  let s = st.symbols.get(symbol)
  if (!s) {
    s = {
      dates: [],
      closes: [],
      intraDate: '',
      intraCloses: [],
      intraVolumes: [],
      intraOpen: 0,
      dayStatsDate: '',
      dayVolumeBase: 0,
    }
    st.symbols.set(symbol, s)
  }
  return s
}

// ---------------------------------------------------------------------------
// Daily series
// ---------------------------------------------------------------------------

const KAPPA = 0.02 // mean-reversion strength toward base price

function ensureDaily(def: StockDef, todayKey: string): SymbolState {
  const s = getSymbolState(def.symbol)

  // Seed the anchor if this is a fresh state
  if (s.dates.length === 0) {
    // Walk from anchor, but if "today" is far from anchor we still need every
    // day. ~1100 days max is cheap. Start by filling anchor..today.
    const rng = mulberry32(hashString(def.symbol + ':dailyseed'))
    s.dates.push(ANCHOR_DATE)
    s.closes.push(def.basePrice * (0.94 + rng() * 0.12))
  }

  // Extend day-by-day up to todayKey
  while (s.dates[s.dates.length - 1] < todayKey) {
    const nextDate = addDays(s.dates[s.dates.length - 1], 1)
    const prevClose = s.closes[s.closes.length - 1]
    const r = dailyReturn(def, nextDate, prevClose)
    s.dates.push(nextDate)
    s.closes.push(Math.max(0.5, prevClose * Math.exp(r)))
  }

  // Trim old history beyond 800 days to bound memory
  if (s.dates.length > 800) {
    s.dates = s.dates.slice(-800)
    s.closes = s.closes.slice(-800)
  }

  return s
}

function dailyReturn(def: StockDef, dateKey: string, prevClose: number): number {
  const rng = mulberry32(hashString(`${def.symbol}:${dateKey}:r`))
  const pull = KAPPA * Math.log(def.basePrice / prevClose)
  return pull + def.dailyVol * gauss(rng)
}

/** Deterministic daily gap (open vs prev close). */
function dayGap(def: StockDef, dateKey: string): number {
  const rng = mulberry32(hashString(`${def.symbol}:${dateKey}:gap`))
  return def.dailyVol * 0.35 * gauss(rng)
}

/** Deterministic daily volume base (shares). */
function dayVolumeBase(def: StockDef, dateKey: string): number {
  const rng = mulberry32(hashString(`${def.symbol}:${dateKey}:vol`))
  const shares = (def.marketCapB * 1e9) / def.basePrice
  const turnover = 0.0045 + rng() * 0.006 // 0.45% – 1.05% of shares
  return shares * turnover
}

// ---------------------------------------------------------------------------
// Intraday (today) — Brownian bridge toward today's destined close
// ---------------------------------------------------------------------------

function uShape(minute: number): number {
  return (
    1 +
    1.6 * Math.exp(-minute / 40) +
    1.4 * Math.exp(-(MINUTES_PER_DAY - minute) / 40) +
    0.25 * Math.exp(-Math.pow((minute - 780) / 300, 2)) // lunch bump
  )
}

function ensureIntraday(def: StockDef, now: Date): SymbolState {
  const todayKey = utcDateKey(now)
  const s = ensureDaily(def, todayKey)

  if (s.intraDate !== todayKey) {
    // New day — reset intraday cache
    s.intraDate = todayKey
    s.intraCloses = []
    s.intraVolumes = []
    const prevClose = s.closes.length > 1 ? s.closes[s.closes.length - 2] : s.closes[0]
    s.intraOpen = Math.max(0.5, prevClose * (1 + dayGap(def, todayKey)))
    s.dayStatsDate = ''
  }

  if (s.dayStatsDate !== todayKey) {
    s.dayVolumeBase = dayVolumeBase(def, todayKey)
    s.dayStatsDate = todayKey
  }

  // How many minutes of today have elapsed?
  const minuteNow = Math.min(
    MINUTES_PER_DAY - 1,
    now.getUTCHours() * 60 + now.getUTCMinutes(),
  )
  const target = minuteNow + 1 // bars 0..minuteNow inclusive

  if (s.intraCloses.length === 0) {
    const rng = mulberry32(hashString(`${def.symbol}:${todayKey}:intra`))
    const wiggleRng = mulberry32(hashString(`${def.symbol}:${todayKey}:wig`))
    const destiny = s.closes[s.closes.length - 1] // today's destined close
    const sigma = def.basePrice * def.dailyVol * 0.045
    let wiggle = 0
    let volSum = 0
    for (let m = 0; m < target; m++) {
      wiggle = wiggle * 0.996 + sigma * gauss(wiggleRng)
      const c =
        s.intraOpen +
        (destiny - s.intraOpen) * ((m + 1) / MINUTES_PER_DAY) +
        wiggle
      const vm =
        (s.dayVolumeBase / MINUTES_PER_DAY) *
        uShape(m) *
        (0.55 + rng() * 0.9)
      volSum += vm
      s.intraCloses.push(Math.max(0.2, c))
      s.intraVolumes.push(vm)
    }
    void volSum
  } else if (s.intraCloses.length < target) {
    // Extend incrementally — must reproduce the same stream as a fresh build,
    // so we regenerate deterministically from scratch only for the tail using
    // a stream seeded per absolute minute index (keeps determinism without
    // replaying the whole day).
    const destiny = s.closes[s.closes.length - 1]
    const sigma = def.basePrice * def.dailyVol * 0.045
    let wiggle = 0
    const volRng = mulberry32(hashString(`${def.symbol}:${todayKey}:intra`))
    const wiggleRng = mulberry32(hashString(`${def.symbol}:${todayKey}:wig`))
    // Fast-forward streams to current length (cheap: pure arithmetic)
    for (let m = 0; m < s.intraCloses.length; m++) {
      wiggle = wiggle * 0.996 + sigma * gauss(wiggleRng)
      volRng()
    }
    for (let m = s.intraCloses.length; m < target; m++) {
      wiggle = wiggle * 0.996 + sigma * gauss(wiggleRng)
      const c =
        s.intraOpen +
        (destiny - s.intraOpen) * ((m + 1) / MINUTES_PER_DAY) +
        wiggle
      const vm =
        (s.dayVolumeBase / MINUTES_PER_DAY) *
        uShape(m) *
        (0.55 + volRng() * 0.9)
      s.intraCloses.push(Math.max(0.2, c))
      s.intraVolumes.push(vm)
    }
  }

  return s
}

/** Sub-minute deterministic jitter so 2-second ticks feel alive. */
function jitter(def: StockDef, todayKey: string, minute: number, second: number): number {
  const h = hashString(`${def.symbol}:${todayKey}:${minute}:${second}:j`)
  return ((h % 1000) / 1000 - 0.5) * 0.0012
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Quote {
  symbol: string
  name: string
  sector: string
  exchange: string
  price: number
  prevClose: number
  change: number
  changePct: number
  dayOpen: number
  dayHigh: number
  dayLow: number
  volume: number
  marketCap: number // billions
  peRatio: number
  dividendYield: number
  beta: number
  eps: number
  week52High: number
  week52Low: number
  /** last 26 daily closes + live price (sparkline) */
  spark: number[]
}

export interface Bar {
  t: number // epoch ms
  o: number
  h: number
  l: number
  c: number
  v: number
}

export type Range = '1D' | '5D' | '1M' | '3M' | '6M' | '1Y' | '2Y'

export interface IndexQuote {
  key: string
  name: string
  value: number
  change: number
  changePct: number
  points: number[] // last 40 closes for sparkline
}

export interface SectorPerf {
  sector: string
  changePct: number
  count: number
  leaders: { symbol: string; changePct: number }[]
  laggards: { symbol: string; changePct: number }[]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function nowUTC(): Date {
  return new Date()
}

export function getQuote(symbol: string, at: Date = nowUTC()): Quote | null {
  const def = STOCK_BY_SYMBOL[symbol]
  if (!def) return null
  const s = ensureIntraday(def, at)
  const todayKey = utcDateKey(at)
  const minute = Math.min(MINUTES_PER_DAY - 1, at.getUTCHours() * 60 + at.getUTCMinutes())
  const sec = at.getUTCSeconds()

  const prevClose = s.closes.length > 1 ? s.closes[s.closes.length - 2] : s.closes[0]
  const basePrice = s.intraCloses.length > 0 ? s.intraCloses[minute] : s.intraOpen
  const price = Math.max(0.2, basePrice * (1 + jitter(def, todayKey, minute, sec)))

  const seen = s.intraCloses.slice(0, minute + 1)
  const dayHigh = seen.length ? Math.max(s.intraOpen, ...seen) : s.intraOpen
  const dayLow = seen.length ? Math.min(s.intraOpen, ...seen) : s.intraOpen
  const volume = s.intraVolumes.slice(0, minute + 1).reduce((a, b) => a + b, 0)

  const closes365 = s.closes.slice(-365)
  const week52High = Math.max(...closes365, dayHigh, price)
  const week52Low = Math.min(...closes365, dayLow, price)

  const ratio = price / def.basePrice
  const spark = [...s.closes.slice(-26), price]

  return {
    symbol: def.symbol,
    name: def.name,
    sector: def.sector,
    exchange: def.exchange,
    price: round2(price),
    prevClose: round2(prevClose),
    change: round2(price - prevClose),
    changePct: round(((price - prevClose) / prevClose) * 100, 2),
    dayOpen: round2(s.intraOpen),
    dayHigh: round2(dayHigh),
    dayLow: round2(dayLow),
    volume: Math.round(volume),
    marketCap: round(def.marketCapB * ratio, 1),
    peRatio: def.peRatio > 0 ? round(def.peRatio * ratio, 1) : 0,
    dividendYield: def.dividendYield,
    beta: def.beta,
    eps: def.eps,
    week52High: round2(week52High),
    week52Low: round2(week52Low),
    spark: spark.map((x) => round2(x)),
  }
}

export function getQuotes(at: Date = nowUTC()): Quote[] {
  return STOCKS.map((d) => getQuote(d.symbol, at)!)
}

/** Compact live tick (used by the WebSocket service). */
export interface LiveTick {
  symbol: string
  p: number
  c: number // changePct
  v: number
}

export function getLiveTicks(at: Date = nowUTC()): LiveTick[] {
  return STOCKS.map((d) => {
    const q = getQuote(d.symbol, at)!
    return { symbol: d.symbol, p: q.price, c: q.changePct, v: q.volume }
  })
}

/** Historical close for a past dateKey (or live price for today). */
export function getCloseOn(symbol: string, dateKey: string, at: Date = nowUTC()): number {
  const def = STOCK_BY_SYMBOL[symbol]
  if (!def) return 0
  const todayKey = utcDateKey(at)
  if (dateKey >= todayKey) {
    return getQuote(symbol, at)!.price
  }
  const s = ensureDaily(def, todayKey)
  const idx = s.dates.indexOf(dateKey)
  if (idx === -1) {
    // Fallback: nearest earlier date
    for (let i = s.dates.length - 1; i >= 0; i--) {
      if (s.dates[i] <= dateKey) return s.closes[i]
    }
    return s.closes[0]
  }
  return s.closes[idx]
}

/** End-of-day change (close vs prev close) for a specific dateKey. */
export function getDayChange(symbol: string, dateKey: string): { close: number; prevClose: number; changePct: number } {
  const def = STOCK_BY_SYMBOL[symbol]
  if (!def) return { close: 0, prevClose: 0, changePct: 0 }
  const todayKey = utcDateKey(new Date())
  const s = ensureDaily(def, dateKey < todayKey ? todayKey : dateKey)
  const idx = s.dates.indexOf(dateKey)
  if (idx <= 0) {
    return { close: s.closes[0], prevClose: s.closes[0], changePct: 0 }
  }
  const close = s.closes[idx]
  const prevClose = s.closes[idx - 1]
  return { close, prevClose, changePct: ((close - prevClose) / prevClose) * 100 }
}

/** Hourly bridge prices for a past day (24 points), open → close. */
function hourlyBridge(def: StockDef, dateKey: string): number[] {
  const s = ensureDaily(def, utcDateKey(nowUTC()))
  const idx = s.dates.indexOf(dateKey)
  if (idx <= 0) return [s.closes[0]]
  const prevClose = s.closes[idx - 1]
  const close = s.closes[idx]
  const open = prevClose * (1 + dayGap(def, dateKey))
  const rng = mulberry32(hashString(`${def.symbol}:${dateKey}:bridge`))
  const sigma = def.basePrice * def.dailyVol * 0.5
  const out: number[] = [open]
  let wiggle = 0
  for (let h = 1; h <= 23; h++) {
    wiggle = wiggle * 0.55 + sigma * 0.45 * gauss(rng)
    out.push(open + (close - open) * (h / 24) + wiggle)
  }
  out.push(close)
  return out
}

export function getCandles(symbol: string, range: Range, at: Date = nowUTC()): Bar[] {
  const def = STOCK_BY_SYMBOL[symbol]
  if (!def) return []
  const todayKey = utcDateKey(at)
  const s = ensureIntraday(def, at)

  if (range === '1D') {
    const minuteNow = Math.min(MINUTES_PER_DAY - 1, at.getUTCHours() * 60 + at.getUTCMinutes())
    const dayStart = dateKeyToDate(todayKey).getTime()
    const bars: Bar[] = []
    for (let m = 0; m <= minuteNow; m++) {
      const c = s.intraCloses[m]
      const o = m === 0 ? s.intraOpen : s.intraCloses[m - 1]
      const wick = Math.abs(c - o) * 0.4 + c * 0.0004
      bars.push({
        t: dayStart + m * 60_000,
        o: round2(o),
        h: round2(Math.max(o, c) + wick * 0.7),
        l: round2(Math.min(o, c) - wick * 0.7),
        c: round2(c),
        v: Math.round(s.intraVolumes[m]),
      })
    }
    return bars
  }

  const dayCount =
    range === '5D' ? 5 : range === '1M' ? 30 : range === '3M' ? 90 : range === '6M' ? 180 : range === '1Y' ? 365 : 730

  const keys = tradingDayKeys(addDays(todayKey, -1), dayCount - 1) // past days
  const bars: Bar[] = []

  if (range === '5D') {
    // Past days: hourly bridge (24 pts each), then today hourly (every 60th minute)
    for (const k of keys) {
      const bridge = hourlyBridge(def, k)
      const dayStart = dateKeyToDate(k).getTime()
      for (let h = 0; h < bridge.length; h++) {
        const c = bridge[h]
        const o = h === 0 ? bridge[0] : bridge[h - 1]
        const wick = Math.abs(c - o) * 0.5 + c * 0.0006
        bars.push({
          t: dayStart + h * 3_600_000,
          o: round2(o),
          h: round2(Math.max(o, c) + wick),
          l: round2(Math.min(o, c) - wick),
          c: round2(c),
          v: Math.round((s.dayVolumeBase || 1e6) / 24 * uShape(h * 60)),
        })
      }
    }
    const dayStart = dateKeyToDate(todayKey).getTime()
    for (let m = 0; m < s.intraCloses.length; m += 60) {
      const c = s.intraCloses[m]
      const o = m === 0 ? s.intraOpen : s.intraCloses[Math.max(0, m - 60)]
      bars.push({
        t: dayStart + m * 60_000,
        o: round2(o),
        h: round2(Math.max(o, c) * 1.0006),
        l: round2(Math.min(o, c) * 0.9994),
        c: round2(c),
        v: Math.round(s.intraVolumes.slice(m, m + 60).reduce((a, b) => a + b, 0)),
      })
    }
    return bars
  }

  // Daily bars for 1M+
  for (const k of keys) {
    const idx = s.dates.indexOf(k)
    if (idx <= 0) continue
    const close = s.closes[idx]
    const prevClose = s.closes[idx - 1]
    const open = prevClose * (1 + dayGap(def, k))
    const bridge = hourlyBridge(def, k)
    const hi = Math.max(...bridge)
    const lo = Math.min(...bridge)
    bars.push({
      t: dateKeyToDate(k).getTime(),
      o: round2(open),
      h: round2(Math.max(hi, open, close)),
      l: round2(Math.min(lo, open, close)),
      c: round2(close),
      v: Math.round(dayVolumeBase(def, k)),
    })
  }
  // Append today's running candle
  const q = getQuote(symbol, at)!
  bars.push({
    t: dateKeyToDate(todayKey).getTime(),
    o: q.dayOpen,
    h: q.dayHigh,
    l: q.dayLow,
    c: q.price,
    v: q.volume,
  })
  return bars
}

export function getIndices(at: Date = nowUTC()): IndexQuote[] {
  const quotes = new Map(getQuotes(at).map((q) => [q.symbol, q]))

  const out: IndexQuote[] = INDICES.map((idx) => {
    const members = idx.members.map((m) => STOCK_BY_SYMBOL[m]).filter(Boolean)
    const weights = members.map((m) =>
      idx.weighting === 'cap' ? m.marketCapB : 1,
    )
    const wSum = weights.reduce((a, b) => a + b, 0)

    const value =
      idx.base *
      members.reduce((acc, m, i) => acc + (weights[i] * (quotes.get(m.symbol)!.price / m.basePrice)) / wSum, 0)
    const prevValue =
      idx.base *
      members.reduce(
        (acc, m, i) => acc + (weights[i] * (quotes.get(m.symbol)!.prevClose / m.basePrice)) / wSum,
        0,
      )

    // Sparkline from last 40 daily closes of members
    const todayKey = utcDateKey(at)
    const points: number[] = []
    const histKeys = tradingDayKeys(addDays(todayKey, -1), 39)
    for (const k of histKeys) {
      let v = 0
      for (let i = 0; i < members.length; i++) {
        v += (weights[i] * (getCloseOn(members[i].symbol, k, at) / members[i].basePrice)) / wSum
      }
      points.push(idx.base * v)
    }
    points.push(value)

    const change = value - prevValue
    return {
      key: idx.key,
      name: idx.name,
      value: round(value, 2),
      change: round(change, 2),
      changePct: round((change / prevValue) * 100, 2),
      points: points.map((p) => round(p, 2)),
    }
  })

  // Simulated volatility index
  const qs = [...quotes.values()]
  const avgAbs =
    qs.reduce((a, q) => a + Math.abs(q.changePct), 0) / qs.length
  const vix = Math.min(65, Math.max(8, 9 + avgAbs * 16))
  const todayKey = utcDateKey(at)
  let yAbsAcc = 0
  for (const def of STOCKS) {
    yAbsAcc += Math.abs(getDayChange(def.symbol, addDays(todayKey, -1)).changePct)
  }
  const prevVix = Math.min(65, Math.max(8, 9 + (yAbsAcc / STOCKS.length) * 16))
  out.push({
    key: 'VIX',
    name: 'Volatility Index',
    value: round(vix, 2),
    change: round(vix - prevVix, 2),
    changePct: round(((vix - prevVix) / prevVix) * 100, 2),
    points: Array.from({ length: 40 }, (_, i) =>
      round(vix * (0.9 + 0.2 * mulberry32(hashString(`vix:${i}`))()), 2),
    ),
  })

  return out
}

export function getMovers(at: Date = nowUTC()) {
  const qs = getQuotes(at)
  const byChange = [...qs].sort((a, b) => b.changePct - a.changePct)
  const byFlow = [...qs].sort(
    (a, b) => b.volume * b.price - a.volume * a.price,
  )
  return {
    gainers: byChange.slice(0, 6),
    losers: byChange.slice(-6).reverse(),
    mostActive: byFlow.slice(0, 6),
  }
}

export function getSectorPerformance(at: Date = nowUTC()): SectorPerf[] {
  const qs = getQuotes(at)
  const bySector = new Map<string, Quote[]>()
  for (const q of qs) {
    if (!bySector.has(q.sector)) bySector.set(q.sector, [])
    bySector.get(q.sector)!.push(q)
  }
  const out: SectorPerf[] = []
  for (const [sector, list] of bySector) {
    const capSum = list.reduce((a, q) => a + q.marketCap, 0)
    const changePct = list.reduce((a, q) => a + q.changePct * q.marketCap, 0) / capSum
    const sorted = [...list].sort((a, b) => b.changePct - a.changePct)
    out.push({
      sector,
      changePct: round(changePct, 2),
      count: list.length,
      leaders: sorted.slice(0, 3).map((q) => ({ symbol: q.symbol, changePct: q.changePct })),
      laggards: sorted.slice(-2).reverse().map((q) => ({ symbol: q.symbol, changePct: q.changePct })),
    })
  }
  return out.sort((a, b) => b.changePct - a.changePct)
}

export interface MarketBreadth {
  advancing: number
  declining: number
  unchanged: number
  total: number
}

export function getBreadth(at: Date = nowUTC()): MarketBreadth {
  const qs = getQuotes(at)
  const advancing = qs.filter((q) => q.changePct > 0.05).length
  const declining = qs.filter((q) => q.changePct < -0.05).length
  return {
    advancing,
    declining,
    unchanged: qs.length - advancing - declining,
    total: qs.length,
  }
}

export interface MarketSentiment {
  score: number
  label: string
  components: {
    breadth: number
    momentum: number
    volatility: number
    demand: number
  }
  prevScore: number
}

export function getSentiment(at: Date = nowUTC()): MarketSentiment {
  const qs = getQuotes(at)
  const breadth = getBreadth(at)

  const breadthScore = (breadth.advancing / breadth.total) * 100

  // 7-day momentum: average return over last 7 daily closes
  const todayKey = utcDateKey(at)
  let momentumAcc = 0
  for (const def of STOCKS) {
    const s = ensureDaily(def, todayKey)
    const c7 = s.closes[Math.max(0, s.closes.length - 8)]
    const now = s.closes[s.closes.length - 2]
    momentumAcc += ((now - c7) / c7) * 100
  }
  const momentumAvg = momentumAcc / STOCKS.length
  const momentumScore = clamp(50 + momentumAvg * 9, 0, 100)

  const avgAbs = qs.reduce((a, q) => a + Math.abs(q.changePct), 0) / qs.length
  const vix = Math.min(65, Math.max(8, 9 + avgAbs * 16))
  const volatilityScore = clamp(100 - vix * 1.55, 0, 100)

  // Demand: volume vs typical (proxy: average across universe of vol/mcap)
  const demandRatio =
    qs.reduce((a, q) => a + (q.volume * q.price) / (q.marketCap * 1e9), 0) / qs.length
  const demandScore = clamp(38 + demandRatio * 1600, 0, 100)

  const score =
    0.35 * breadthScore + 0.25 * momentumScore + 0.2 * volatilityScore + 0.2 * demandScore
  const prevScore = score * 0.97 + 1.5

  return {
    score: round(score, 1),
    label: sentimentLabel(score),
    components: {
      breadth: round(breadthScore, 1),
      momentum: round(momentumScore, 1),
      volatility: round(volatilityScore, 1),
      demand: round(demandScore, 1),
    },
    prevScore: round(prevScore, 1),
  }
}

function getCloseTodayAgo(symbol: string, days: number, at: Date): number {
  const def = STOCK_BY_SYMBOL[symbol]
  if (!def) return 0
  const s = ensureDaily(def, utcDateKey(at))
  return s.closes[Math.max(0, s.closes.length - 1 - days)]
}

export function sentimentLabel(score: number): string {
  if (score < 25) return 'Extreme Fear'
  if (score < 45) return 'Fear'
  if (score < 56) return 'Neutral'
  if (score < 76) return 'Greed'
  return 'Extreme Greed'
}

export function searchStocks(q: string, limit = 8, at: Date = nowUTC()) {
  const query = q.trim().toUpperCase()
  if (!query) {
    return getQuotes(at)
      .sort((a, b) => b.marketCap - a.marketCap)
      .slice(0, limit)
      .map((q2) => ({ symbol: q2.symbol, name: q2.name, sector: q2.sector, price: q2.price, changePct: q2.changePct }))
  }
  const scored = STOCKS.map((d) => {
    const sym = d.symbol.toUpperCase()
    const name = d.name.toUpperCase()
    let score = -1
    if (sym === query) score = 100
    else if (sym.startsWith(query)) score = 80
    else if (name.startsWith(query)) score = 60
    else if (sym.includes(query)) score = 40
    else if (name.includes(query)) score = 30
    else if (d.sector.toUpperCase().startsWith(query)) score = 10
    return { d, score }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.d.marketCapB - a.d.marketCapB)
    .slice(0, limit)

  return scored.map(({ d }) => {
    const q3 = getQuote(d.symbol, at)!
    return { symbol: d.symbol, name: d.name, sector: d.sector, price: q3.price, changePct: q3.changePct }
  })
}

export function getStockProfile(symbol: string) {
  const d = STOCK_BY_SYMBOL[symbol]
  if (!d) return null
  return {
    symbol: d.symbol,
    name: d.name,
    sector: d.sector,
    exchange: d.exchange,
    description: d.description,
    ceo: d.ceo,
    hq: d.hq,
    employees: d.employees,
    website: d.website,
    founded: d.founded,
    basePrice: d.basePrice,
  }
}

export function getAllProfiles() {
  return STOCKS.map((d) => getStockProfile(d.symbol)!)
}

export function getPeers(symbol: string, at: Date = nowUTC()): Quote[] {
  const def = STOCK_BY_SYMBOL[symbol]
  if (!def) return []
  return STOCKS.filter((d) => d.sector === def.sector && d.symbol !== symbol)
    .slice(0, 5)
    .map((d) => getQuote(d.symbol, at)!)
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

function round(x: number, dp = 2): number {
  const f = Math.pow(10, dp)
  return Math.round(x * f) / f
}

function round2(x: number): number {
  return round(x, 2)
}
