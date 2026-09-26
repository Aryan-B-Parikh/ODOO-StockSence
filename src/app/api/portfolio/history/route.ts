import { NextResponse } from 'next/server'
import { computeHistorySeries } from '@/lib/portfolio'

export const dynamic = 'force-dynamic'

/** GET /api/portfolio/history?days=30 → { points: { t, value }[] } */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const daysRaw = Number.parseInt(searchParams.get('days') ?? '', 10)
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 365) : 30

    const points = await computeHistorySeries(days)
    return NextResponse.json({ points })
  } catch (err) {
    console.error('GET /api/portfolio/history failed:', err)
    return NextResponse.json({ error: 'Failed to load portfolio history' }, { status: 500 })
  }
}
