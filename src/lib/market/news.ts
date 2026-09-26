/**
 * StockSense — Deterministic News Generator
 * Generates a coherent, simulated news feed for a given date: sentiment is
 * biased toward each stock's simulated daily move so the tape tells a story.
 * Items are persisted into the NewsItem table by the seed script / API layer.
 */

import { mulberry32, hashString, utcDateKey, addDays, getQuotes, getDayChange, type Quote } from './engine'
import { STOCKS, STOCK_BY_SYMBOL } from './universe'

export interface GeneratedNews {
  slot: number
  dateKey: string
  symbol: string | null
  headline: string
  summary: string
  source: string
  sentiment: number // -1..1
  sentimentLabel: string
  impact: 'HIGH' | 'MEDIUM' | 'LOW'
  publishedAt: Date
}

const SOURCES = [
  'MarketPulse Daily',
  'Global Finance Review',
  'TradeWire',
  'The Capital Brief',
  'Wall Street Beacon',
  'EconoTimes',
  'Broker Desk',
  'The Ledger',
]

const POSITIVE_TEMPLATES: ((c: Ctx) => { h: string; s: string })[] = [
  (c) => ({
    h: `${c.name} beats quarterly earnings expectations, raises full-year guidance`,
    s: `${c.name} reported revenue and EPS above consensus estimates, driven by strong demand in its ${c.sector.toLowerCase()} franchise. Management raised full-year guidance, citing resilient consumer and enterprise spending.`,
  }),
  (c) => ({
    h: `Analysts upgrade ${c.symbol} to Overweight on improving fundamentals`,
    s: `A major Wall Street desk lifted its rating on ${c.name} to Overweight with a higher price target, pointing to margin expansion and accelerating ${c.theme}.`,
  }),
  (c) => ({
    h: `${c.name} announces $${c.b1}B share repurchase program`,
    s: `The board of ${c.name} authorized a $${c.b1} billion buyback, signaling confidence in cash-flow generation. Shares responded firmly in ${c.dir} trading.`,
  }),
  (c) => ({
    h: `${c.name} lands landmark partnership expected to lift margins`,
    s: `${c.name} unveiled a multi-year strategic partnership that analysts estimate could add ${c.p2} points of operating margin over the next two fiscal years.`,
  }),
  (c) => ({
    h: `Institutional investors boost ${c.symbol} stakes, filings show`,
    s: `Latest 13F filings reveal several prominent asset managers increased positions in ${c.name} during the past quarter, reflecting growing conviction in the ${c.sector.toLowerCase()} outlook.`,
  }),
  (c) => ({
    h: `${c.name} unveils next-gen product line to ${c.theme} demand`,
    s: `At an investor event, ${c.name} showcased a refreshed product roadmap aimed squarely at ${c.theme}, with preorders tracking ahead of internal targets.`,
  }),
  (c) => ({
    h: `${c.symbol} rallies as ${c.sector.toLowerCase()} sentiment improves`,
    s: `Shares of ${c.name} climbed ${c.absMove}% as rotation into ${c.sector.toLowerCase()} names gathered pace and short interest unwound.`,
  }),
  (c) => ({
    h: `${c.name} profit outlook tops Street view`,
    s: `${c.name} guided next-quarter profit above consensus, crediting pricing discipline and cost controls. The stock trades up ${c.absMove}% on the session.`,
  }),
]

const NEGATIVE_TEMPLATES: ((c: Ctx) => { h: string; s: string })[] = [
  (c) => ({
    h: `${c.name} slides after soft guidance disappoints investors`,
    s: `${c.name} guided below consensus for the coming quarter, flagging softer demand in its ${c.sector.toLowerCase()} business. Shares fell ${c.absMove}% as analysts trimmed targets.`,
  }),
  (c) => ({
    h: `Analysts downgrade ${c.symbol} citing valuation and cyclical risks`,
    s: `A sell-side firm cut ${c.name} to Neutral, arguing the risk/reward has deteriorated after the recent run and warning of ${c.theme}-related headwinds.`,
  }),
  (c) => ({
    h: `${c.name} faces regulatory scrutiny over ${c.theme} practices`,
    s: `Reports suggest regulators are examining certain ${c.theme} practices at ${c.name}. The company said it is cooperating fully; the financial impact remains unclear.`,
  }),
  (c) => ({
    h: `Supply chain pressures weigh on ${c.symbol} margins`,
    s: `Elevated input costs and logistics delays are pressuring margins at ${c.name}, according to supply-chain checks. Management remains upbeat on medium-term recovery.`,
  }),
  (c) => ({
    h: `${c.name} loses key executive amid reorganization`,
    s: `${c.name} announced the departure of a senior leader overseeing ${c.theme}, sparking questions about execution during a critical product cycle.`,
  }),
  (c) => ({
    h: `Short interest builds in ${c.symbol} as momentum fades`,
    s: `Data shows short positions in ${c.name} rising to a multi-month high as traders position for further downside in the ${c.sector.toLowerCase()} group.`,
  }),
  (c) => ({
    h: `${c.symbol} drops ${c.absMove}% as risk appetite fades`,
    s: `A broad de-risking session hit high-beta names, and ${c.name} underperformed the ${c.sector.toLowerCase()} group with volume running above average.`,
  }),
]

const NEUTRAL_TEMPLATES: ((c: Ctx) => { h: string; s: string })[] = [
  (c) => ({
    h: `${c.name} to present at industry conference next week`,
    s: `${c.name} confirmed participation in a marquee ${c.sector.toLowerCase()} conference, where investors will look for updates on ${c.theme} initiatives.`,
  }),
  (c) => ({
    h: `${c.name} announces leadership transition in ${c.theme} division`,
    s: `${c.name} named a new leader for its ${c.theme} division, effective next quarter, as part of a planned succession process.`,
  }),
  (c) => ({
    h: `${c.symbol} trades flat as market digests mixed data`,
    s: `${c.name} shares hovered near the flatline in quiet trade, with participants awaiting fresh catalysts for the ${c.sector.toLowerCase()} space.`,
  }),
  (c) => ({
    h: `${c.name} expands ESG commitments across operations`,
    s: `${c.name} published new sustainability targets covering its supply chain, drawing a measured response from ESG-focused investors.`,
  }),
  (c) => ({
    h: `Options activity in ${c.symbol} picks up ahead of earnings`,
    s: ` positioning in ${c.name} options has increased ahead of the next report, with implied volatility elevated versus the 30-day average.`,
  }),
]

const MACRO_TEMPLATES: ((ctx: { up: number; down: number }) => { h: string; s: string; bias: number })[] = [
  (b) => ({
    h: `Fed officials signal patience as inflation cools gradually`,
    s: `Speaking at separate events, central-bank officials reiterated a data-dependent stance, keeping rate-cut hopes alive for later this year. Equities held near session highs with ${b.up} advancers on the tape.`,
    bias: 0.4,
  }),
  (b) => ({
    h: `Treasury yields ease as demand surfaces at auction`,
    s: `A well-received Treasury auction pulled yields lower across the curve, supporting duration-sensitive names. Breadth was constructive with ${b.up} gainers against ${b.down} decliners.`,
    bias: 0.3,
  }),
  (b) => ({
    h: `Oil prices steady amid OPEC+ output chatter`,
    s: `Crude oscillated around the flatline as delegates hinted at flexibility on quotas. Energy majors were mixed in afternoon trade.`,
    bias: 0,
  }),
  (b) => ({
    h: `Global PMIs point to resilient services, soft manufacturing`,
    s: `Flash PMIs showed services activity holding up while factory output slipped, a divergence that favors mega-cap defensives. Advancers led decliners ${b.up} to ${b.down}.`,
    bias: 0.15,
  }),
  (b) => ({
    h: `Volatility subsides as positioning resets after choppy week`,
    s: `Cross-asset volatility retreated from recent highs as systematic funds rebuilt exposure. Market breadth improved, with ${b.up} names advancing.`,
    bias: 0.25,
  }),
  (b) => ({
    h: `Dollar firms as traders pare aggressive rate-cut bets`,
    s: `The dollar index firmed for a second session, pressuring commodity-linked sectors. Analysts see the move as positioning-driven rather than a trend change.`,
    bias: -0.2,
  }),
  (b) => ({
    h: `Consumer confidence beats expectations, retail names in focus`,
    s: `Household sentiment improved more than forecast, buoying discretionary names. Strategists cautioned that spending intentions remain income-skewed.`,
    bias: 0.3,
  }),
]

interface Ctx {
  name: string
  symbol: string
  sector: string
  theme: string
  b1: string
  p2: string
  absMove: string
  dir: string
}

const THEMES: Record<string, string[]> = {
  Technology: ['AI and cloud', 'data-center', 'developer platform', 'edge computing'],
  Financials: ['payments', 'lending', 'capital markets', 'wealth management'],
  Healthcare: ['clinical pipeline', 'diagnostics', 'pharmacy network', 'value-based care'],
  Consumer: ['e-commerce', 'loyalty program', 'supply chain', 'value pricing'],
  Communication: ['streaming', 'advertising', 'creator tools', 'messaging platform'],
  Energy: ['upstream production', 'refining', 'low-carbon', 'liquefied natural gas'],
  Industrials: ['logistics', 'aerospace aftermarket', 'automation', 'infrastructure'],
}

function labelFor(sentiment: number): string {
  if (sentiment > 0.45) return 'Bullish'
  if (sentiment > 0.15) return 'Somewhat Bullish'
  if (sentiment > -0.15) return 'Neutral'
  if (sentiment > -0.45) return 'Somewhat Bearish'
  return 'Bearish'
}

function impactFor(sentiment: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  const a = Math.abs(sentiment)
  if (a > 0.55) return 'HIGH'
  if (a > 0.3) return 'MEDIUM'
  return 'LOW'
}

/**
 * Generate the news set for a dateKey. Deterministic.
 */
export function generateNewsForDate(dateKey: string): GeneratedNews[] {
  const rng = mulberry32(hashString('news:' + dateKey))

  // Quote proxy at end of that day: for past days use EOD closes; today → live.
  const isToday = dateKey === utcDateKey(new Date())
  let quotes: Quote[]
  if (isToday) {
    quotes = getQuotes()
  } else {
    quotes = STOCKS.map((def) => {
      const dc = getDayChange(def.symbol, dateKey)
      return {
        symbol: def.symbol,
        name: def.name,
        sector: def.sector,
        exchange: def.exchange,
        price: dc.close,
        prevClose: dc.prevClose,
        change: dc.close - dc.prevClose,
        changePct: dc.changePct,
      } as Quote
    })
  }

  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length) % arr.length]

  const items: GeneratedNews[] = []
  let slot = 0

  const makeStockItem = (q: Quote): GeneratedNews => {
    const def = STOCK_BY_SYMBOL[q.symbol]
    const themes = THEMES[def.sector] ?? ['core business']
    const ctx: Ctx = {
      name: def.name,
      symbol: def.symbol,
      sector: def.sector,
      theme: pick(themes),
      b1: (2 + Math.floor(rng() * 18)).toString(),
      p2: (0.5 + rng() * 2).toFixed(1),
      absMove: Math.abs(q.changePct).toFixed(1),
      dir: q.changePct >= 0 ? 'firm' : 'defensive',
    }
    let tpl: { h: string; s: string }
    let sentiment: number
    const roll = rng()
    if (q.changePct > 1.2) {
      tpl = pick(POSITIVE_TEMPLATES)(ctx)
      sentiment = 0.45 + rng() * 0.45
    } else if (q.changePct < -1.2) {
      tpl = pick(NEGATIVE_TEMPLATES)(ctx)
      sentiment = -(0.45 + rng() * 0.45)
    } else if (roll < 0.45) {
      tpl = pick(NEUTRAL_TEMPLATES)(ctx)
      sentiment = (rng() - 0.5) * 0.24
    } else if (roll < 0.72) {
      tpl = pick(POSITIVE_TEMPLATES)(ctx)
      sentiment = 0.2 + rng() * 0.35
    } else {
      tpl = pick(NEGATIVE_TEMPLATES)(ctx)
      sentiment = -(0.2 + rng() * 0.35)
    }
    const hour = Math.floor(rng() * 12) + 6 // 6:00 – 18:00 UTC
    const minute = Math.floor(rng() * 60)
    return {
      slot: slot++,
      dateKey,
      symbol: q.symbol,
      headline: tpl.h,
      summary: tpl.s,
      source: pick(SOURCES),
      sentiment: Math.round(sentiment * 100) / 100,
      sentimentLabel: labelFor(sentiment),
      impact: impactFor(sentiment),
      publishedAt: new Date(dateKey + `T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`),
    }
  }

  // 18 stock-specific items
  const shuffled = [...quotes]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const moversFirst = [...shuffled].sort(
    (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct),
  )
  const chosen = [...moversFirst.slice(0, 10), ...shuffled.slice(0, 12)]
  for (const q of chosen) items.push(makeStockItem(q))

  // 5 macro items
  const breadth = { up: quotes.filter((q) => q.changePct > 0).length, down: quotes.filter((q) => q.changePct < 0).length }
  for (let i = 0; i < 5; i++) {
    const tpl = pick(MACRO_TEMPLATES)
    const m = tpl(breadth)
    const hour = Math.floor(rng() * 14) + 5
    const minute = Math.floor(rng() * 60)
    items.push({
      slot: slot++,
      dateKey,
      symbol: null,
      headline: m.h,
      summary: m.s,
      source: pick(SOURCES),
      sentiment: m.bias,
      sentimentLabel: labelFor(m.bias),
      impact: impactFor(m.bias),
      publishedAt: new Date(dateKey + `T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`),
    })
  }

  // Sort chronologically by publish time, then re-slot
  items.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())
  items.forEach((it, i) => (it.slot = i))
  return items
}

/** News for today + yesterday (items in the future are filtered by callers). */
export function generateRecentNews(): GeneratedNews[] {
  const today = utcDateKey(new Date())
  const yesterday = addDays(today, -1)
  return [...generateNewsForDate(yesterday), ...generateNewsForDate(today)]
}

export const STOCK_COUNT = STOCKS.length
