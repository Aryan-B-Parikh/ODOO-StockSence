import { NextResponse } from 'next/server'
import { searchStocks } from '@/lib/market/engine'

export const dynamic = 'force-dynamic'

/** GET /api/search?q= → { results: SearchResultDTO[] } */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') ?? searchParams.get('query') ?? '').trim()

    // Empty query returns the largest names (useful for combobox defaults).
    const results = searchStocks(q, 8)
    return NextResponse.json({ results })
  } catch (err) {
    console.error('GET /api/search failed:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
