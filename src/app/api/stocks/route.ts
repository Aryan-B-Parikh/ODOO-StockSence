import { NextResponse } from 'next/server'
import { getQuotes } from '@/lib/market/engine'
import type { Quote } from '@/lib/types'

export const dynamic = 'force-dynamic'

const SORT_KEYS = [
  'symbol',
  'name',
  'price',
  'changePct',
  'volume',
  'marketCap',
  'peRatio',
  'dividendYield',
] as const

type SortKey = (typeof SORT_KEYS)[number]

/** GET /api/stocks?search=&sector=&sort=&order=asc|desc&limit= → { stocks: Quote[] } */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') ?? '').trim().toLowerCase()
    const sector = (searchParams.get('sector') ?? '').trim().toLowerCase()
    const sortParam = (searchParams.get('sort') ?? 'marketCap').trim() || 'marketCap'
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc'
    const limitRaw = Number.parseInt(searchParams.get('limit') ?? '', 10)

    if (!SORT_KEYS.includes(sortParam as SortKey)) {
      return NextResponse.json(
        { error: `Invalid sort key "${sortParam}". Allowed: ${SORT_KEYS.join(', ')}` },
        { status: 400 },
      )
    }
    const sortKey = sortParam as SortKey

    let stocks = getQuotes()

    if (search) {
      stocks = stocks.filter(
        (q) =>
          q.symbol.toLowerCase().includes(search) || q.name.toLowerCase().includes(search),
      )
    }
    if (sector) {
      stocks = stocks.filter((q) => q.sector.toLowerCase() === sector)
    }

    const dir = order === 'asc' ? 1 : -1
    stocks = [...stocks].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dir
      }
      return ((av as number) - (bv as number)) * dir
    })

    if (Number.isFinite(limitRaw) && limitRaw > 0) {
      stocks = stocks.slice(0, limitRaw)
    }

    const body: { stocks: Quote[] } = { stocks }
    return NextResponse.json(body)
  } catch (err) {
    console.error('GET /api/stocks failed:', err)
    return NextResponse.json({ error: 'Failed to load stocks' }, { status: 500 })
  }
}
