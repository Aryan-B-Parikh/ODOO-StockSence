import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { addDays, utcDateKey } from '@/lib/market/engine'
import { generateNewsForDate } from '@/lib/market/news'
import { STOCK_BY_SYMBOL } from '@/lib/market/universe'
import type { NewsDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Idempotently persist the deterministic news for today + yesterday (UTC).
 * A dateKey is skipped once its full generated set exists in the DB, so
 * repeated calls are cheap no-ops. Wrapped in try/catch — a failure must
 * never break the news feed itself.
 *
 * NOTE: the seeder inserted today's items filtered to "published so far",
 * so we compare against the expected generated count (rather than merely
 * "any rows exist") to backfill the rest of the day's slots. Upserts use
 * `update: {}` so existing rows are never mutated.
 */
async function ensureNews(): Promise<void> {
  try {
    const todayKey = utcDateKey(new Date())
    for (const key of [addDays(todayKey, -1), todayKey]) {
      const items = generateNewsForDate(key)
      const existing = await db.newsItem.count({ where: { dateKey: key } })
      if (existing >= items.length) continue
      for (const n of items) {
        await db.newsItem.upsert({
          where: { dateKey_slot: { dateKey: n.dateKey, slot: n.slot } },
          update: {},
          create: {
            dateKey: n.dateKey,
            slot: n.slot,
            symbol: n.symbol,
            headline: n.headline,
            summary: n.summary,
            source: n.source,
            sentiment: n.sentiment,
            sentimentLabel: n.sentimentLabel,
            impact: n.impact,
            publishedAt: n.publishedAt,
          },
        })
      }
    }
  } catch (err) {
    console.error('ensureNews failed:', err)
  }
}

/** GET /api/news?symbol=&limit=30&offset=0 → { news: NewsDTO[] } */
export async function GET(request: Request) {
  try {
    await ensureNews()

    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')?.trim().toUpperCase() ?? ''
    const limitRaw = Number.parseInt(searchParams.get('limit') ?? '', 10)
    const offsetRaw = Number.parseInt(searchParams.get('offset') ?? '', 10)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 30
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0

    const rows = await db.newsItem.findMany({
      where: {
        publishedAt: { lte: new Date() },
        ...(symbol ? { symbol } : {}),
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      skip: offset,
    })

    const news: NewsDTO[] = rows.map((n) => ({
      id: n.id,
      symbol: n.symbol,
      symbolName: n.symbol ? STOCK_BY_SYMBOL[n.symbol]?.name ?? null : null,
      headline: n.headline,
      summary: n.summary,
      source: n.source,
      sentiment: n.sentiment,
      sentimentLabel: n.sentimentLabel,
      impact: n.impact,
      publishedAt: n.publishedAt.toISOString(),
      aiSummary: n.aiSummary,
    }))

    return NextResponse.json({ news })
  } catch (err) {
    console.error('GET /api/news failed:', err)
    return NextResponse.json({ error: 'Failed to load news' }, { status: 500 })
  }
}
