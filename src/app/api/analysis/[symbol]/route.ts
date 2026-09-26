import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getCandles,
  getQuote,
  getSectorPerformance,
  getStockProfile,
  type SectorPerf,
} from '@/lib/market/engine'
import { llmComplete } from '@/app/api/_lib/llm'
import { ANALYSIS_TTL_MS, type AnalysisReportDTO } from '@/lib/types'
import type { AnalysisReport } from '@prisma/client'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT =
  'You are StockSense AI, an expert equity analyst. Produce a concise but insightful markdown ' +
  'research note. Use these EXACT sections: ## Executive Summary, ## Bull Case, ## Bear Case, ' +
  '## Key Risks, ## Technical View, ## Verdict. In Verdict include on separate lines: ' +
  '`Rating: BUY|HOLD|SELL`, `Score: X/10`, `Price Target: $LOW - $HIGH`. ' +
  'Be specific, reference the numbers provided. 350-500 words.'

function toDTO(row: AnalysisReport): AnalysisReportDTO {
  return {
    id: row.id,
    symbol: row.symbol,
    rating: row.rating,
    score: row.score,
    targetLow: row.targetLow,
    targetHigh: row.targetHigh,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  }
}

function parseReport(content: string): { rating: string; score: number; targetLow: number | null; targetHigh: number | null } {
  const ratingMatch = content.match(/rating\s*:\s*\**\s*(buy|hold|sell)/i)
  const rating = ratingMatch ? ratingMatch[1].toUpperCase() : 'HOLD'

  const scoreMatch = content.match(/score\s*:\s*\**\s*(\d+(?:[.,]\d+)?)\s*(?:\/\s*10)?/i)
  let score = 5
  if (scoreMatch) {
    const parsed = Number.parseFloat(scoreMatch[1].replace(',', '.'))
    if (Number.isFinite(parsed)) score = Math.min(10, Math.max(0, parsed))
  }

  let targetLow: number | null = null
  let targetHigh: number | null = null
  const targetMatch = content.match(
    /price\s*target\s*:\s*\**\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(?:-|–|—|to)\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
  )
  if (targetMatch) {
    const lo = Number.parseFloat(targetMatch[1].replace(/,/g, ''))
    const hi = Number.parseFloat(targetMatch[2].replace(/,/g, ''))
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
      targetLow = Math.min(lo, hi)
      targetHigh = Math.max(lo, hi)
    }
  }

  return { rating, score, targetLow, targetHigh }
}

function buildContext(symbol: string): string {
  const quote = getQuote(symbol)!
  const profile = getStockProfile(symbol)!

  // 30-day trend stats from the 1M candle series.
  const bars = getCandles(symbol, '1M')
  let trendPct = 0
  let volatility = 0
  let high = quote.price
  let low = quote.price
  if (bars.length > 1) {
    const first = bars[0].c
    const last = bars[bars.length - 1].c
    trendPct = ((last - first) / first) * 100
    const returns: number[] = []
    for (let i = 1; i < bars.length; i++) {
      returns.push(((bars[i].c - bars[i - 1].c) / bars[i - 1].c) * 100)
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    volatility = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length)
    high = Math.max(...bars.map((b) => b.h))
    low = Math.min(...bars.map((b) => b.l))
  }

  const sector: SectorPerf | undefined = getSectorPerformance().find((s) => s.sector === quote.sector)

  const lines = [
    `STOCK: ${profile.name} (${symbol}) — ${profile.exchange} · ${profile.sector} sector`,
    `PRICE: $${quote.price} (prev close $${quote.prevClose}, today ${quote.changePct >= 0 ? '+' : ''}${quote.changePct}%)`,
    `DAY RANGE: $${quote.dayLow} – $${quote.dayHigh} | 52W RANGE: $${quote.week52Low} – $${quote.week52High}`,
    `FUNDAMENTALS: Market cap $${quote.marketCap}B | P/E ${quote.peRatio} | EPS $${quote.eps} | Div yield ${quote.dividendYield}% | Beta ${quote.beta}`,
    `30-DAY TREND: ${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(2)}% | Daily volatility σ ${volatility.toFixed(2)}% | 30D high $${high.toFixed(2)} | 30D low $${low.toFixed(2)}`,
  ]
  if (sector) {
    const leaders = sector.leaders.map((l) => `${l.symbol} ${l.changePct >= 0 ? '+' : ''}${l.changePct}%`).join(', ')
    lines.push(`SECTOR TODAY: ${sector.sector} ${sector.changePct >= 0 ? '+' : ''}${sector.changePct}% (leaders: ${leaders})`)
  }
  lines.push(`COMPANY: ${profile.description}`)
  return lines.join('\n')
}

async function latestFreshReport(symbol: string): Promise<AnalysisReport | null> {
  const latest = await db.analysisReport.findFirst({
    where: { symbol },
    orderBy: { createdAt: 'desc' },
  })
  if (latest && Date.now() - latest.createdAt.getTime() < ANALYSIS_TTL_MS) {
    return latest
  }
  return null
}

/** POST /api/analysis/[symbol] → { report: AnalysisReportDTO } (cached < 45 min) */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol: raw } = await params
    const symbol = raw.trim().toUpperCase()

    if (!getQuote(symbol)) {
      return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 404 })
    }

    const cached = await latestFreshReport(symbol)
    if (cached) {
      return NextResponse.json({ report: toDTO(cached) })
    }

    // 3 latest headlines for the symbol from the DB.
    const news = await db.newsItem.findMany({
      where: { symbol },
      orderBy: { publishedAt: 'desc' },
      take: 3,
    })

    const userPrompt = [
      buildContext(symbol),
      news.length > 0
        ? 'RECENT HEADLINES:\n' + news.map((n, i) => `${i + 1}. [${n.sentimentLabel}] ${n.headline}`).join('\n')
        : 'RECENT HEADLINES: none',
      'Produce the research note now.',
    ].join('\n\n')

    let content: string
    try {
      content = await llmComplete(SYSTEM_PROMPT, userPrompt)
    } catch (llmErr) {
      console.error('analysis LLM call failed:', llmErr)
      return NextResponse.json(
        { error: 'AI service unavailable, please retry' },
        { status: 503 },
      )
    }
    if (!content.trim()) {
      return NextResponse.json(
        { error: 'AI service unavailable, please retry' },
        { status: 503 },
      )
    }

    const { rating, score, targetLow, targetHigh } = parseReport(content)
    const row = await db.analysisReport.create({
      data: { symbol, rating, score, targetLow, targetHigh, content },
    })

    return NextResponse.json({ report: toDTO(row) })
  } catch (err) {
    console.error('POST /api/analysis/[symbol] failed:', err)
    return NextResponse.json({ error: 'Failed to generate analysis' }, { status: 500 })
  }
}

/** GET /api/analysis/[symbol] → { report: AnalysisReportDTO | null } */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol: raw } = await params
    const symbol = raw.trim().toUpperCase()

    if (!getQuote(symbol)) {
      return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 404 })
    }

    const latest = await db.analysisReport.findFirst({
      where: { symbol },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ report: latest ? toDTO(latest) : null })
  } catch (err) {
    console.error('GET /api/analysis/[symbol] failed:', err)
    return NextResponse.json({ error: 'Failed to load analysis' }, { status: 500 })
  }
}
