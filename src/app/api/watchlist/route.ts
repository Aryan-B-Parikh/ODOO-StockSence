import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getQuote } from '@/lib/market/engine'
import { toWatchItemDTO } from '@/app/api/_lib/watchlist'

export const dynamic = 'force-dynamic'

/** GET /api/watchlist → { items: WatchItemDTO[] } (live quotes + alert flags) */
export async function GET() {
  try {
    const rows = await db.watchItem.findMany({ orderBy: { createdAt: 'asc' } })
    const items = rows
      .map(toWatchItemDTO)
      .filter((x): x is NonNullable<typeof x> => x !== null)
    return NextResponse.json({ items })
  } catch (err) {
    console.error('GET /api/watchlist failed:', err)
    return NextResponse.json({ error: 'Failed to load watchlist' }, { status: 500 })
  }
}

/** POST /api/watchlist body { symbol, note? } → upserted WatchItemDTO */
export async function POST(request: Request) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { symbol, note } = (body ?? {}) as { symbol?: unknown; note?: unknown }

    if (typeof symbol !== 'string' || symbol.trim().length === 0) {
      return NextResponse.json({ error: 'symbol is required' }, { status: 400 })
    }
    const sym = symbol.trim().toUpperCase()
    if (!getQuote(sym)) {
      return NextResponse.json({ error: `Unknown symbol: ${sym}` }, { status: 400 })
    }
    if (note !== undefined && note !== null && typeof note !== 'string') {
      return NextResponse.json({ error: 'note must be a string or null' }, { status: 400 })
    }

    const row = await db.watchItem.upsert({
      where: { symbol: sym },
      update: note === undefined ? {} : { note: note as string | null },
      create: { symbol: sym, note: note === undefined ? null : (note as string | null) },
    })

    const item = toWatchItemDTO(row)
    if (!item) {
      return NextResponse.json({ error: 'Failed to build watch item' }, { status: 500 })
    }
    return NextResponse.json(item)
  } catch (err) {
    console.error('POST /api/watchlist failed:', err)
    return NextResponse.json({ error: 'Failed to add watchlist item' }, { status: 500 })
  }
}
