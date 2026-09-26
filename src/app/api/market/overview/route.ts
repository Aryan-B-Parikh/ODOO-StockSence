import { NextResponse } from 'next/server'
import { getBreadth, getIndices, getMovers, getSectorPerformance, getSentiment } from '@/lib/market/engine'
import type { MarketOverview } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/market/overview → MarketOverview */
export async function GET() {
  try {
    const body: MarketOverview = {
      serverTime: new Date().toISOString(),
      indices: getIndices(),
      breadth: getBreadth(),
      sentiment: getSentiment(),
      movers: getMovers(),
      sectors: getSectorPerformance(),
    }
    return NextResponse.json(body)
  } catch (err) {
    console.error('GET /api/market/overview failed:', err)
    return NextResponse.json({ error: 'Failed to load market overview' }, { status: 500 })
  }
}
