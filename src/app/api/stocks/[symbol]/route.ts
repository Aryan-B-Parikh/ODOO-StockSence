import { NextResponse } from 'next/server'
import { getPeers, getQuote, getStockProfile } from '@/lib/market/engine'
import type { StockDetail } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/stocks/[symbol] → StockDetail */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol: raw } = await params
    const symbol = raw.trim().toUpperCase()

    const quote = getQuote(symbol)
    if (!quote) {
      return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 404 })
    }
    const profile = getStockProfile(symbol)!

    const body: StockDetail = {
      quote,
      profile: {
        symbol: profile.symbol,
        name: profile.name,
        sector: profile.sector,
        exchange: profile.exchange,
        description: profile.description,
        ceo: profile.ceo,
        hq: profile.hq,
        employees: profile.employees,
        website: profile.website,
        founded: profile.founded,
      },
      peers: getPeers(symbol),
    }
    return NextResponse.json(body)
  } catch (err) {
    console.error('GET /api/stocks/[symbol] failed:', err)
    return NextResponse.json({ error: 'Failed to load stock detail' }, { status: 500 })
  }
}
