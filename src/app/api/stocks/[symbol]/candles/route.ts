import { NextResponse } from 'next/server'
import { getCandles, getQuote, type Range } from '@/lib/market/engine'

export const dynamic = 'force-dynamic'

const ALLOWED_RANGES: readonly Range[] = ['1D', '5D', '1M', '3M', '6M', '1Y', '2Y']

/** GET /api/stocks/[symbol]/candles?range= → { symbol, range, bars } */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol: raw } = await params
    const symbol = raw.trim().toUpperCase()

    const quote = getQuote(symbol)
    if (!quote) {
      return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 404 })
    }

    const rangeParam = (new URL(request.url).searchParams.get('range') ?? '1D').trim() || '1D'
    if (!ALLOWED_RANGES.includes(rangeParam as Range)) {
      return NextResponse.json(
        { error: `Invalid range "${rangeParam}". Allowed: ${ALLOWED_RANGES.join(', ')}` },
        { status: 400 },
      )
    }
    const range = rangeParam as Range

    const bars = getCandles(symbol, range)
    return NextResponse.json({ symbol, range, bars })
  } catch (err) {
    console.error('GET /api/stocks/[symbol]/candles failed:', err)
    return NextResponse.json({ error: 'Failed to load candles' }, { status: 500 })
  }
}
