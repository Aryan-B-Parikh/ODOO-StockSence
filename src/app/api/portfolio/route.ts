import { NextResponse } from 'next/server'
import { computePortfolio } from '@/lib/portfolio'

export const dynamic = 'force-dynamic'

/** GET /api/portfolio → PortfolioDTO (live) */
export async function GET() {
  try {
    const portfolio = await computePortfolio()
    return NextResponse.json(portfolio)
  } catch (err) {
    console.error('GET /api/portfolio failed:', err)
    return NextResponse.json({ error: 'Failed to load portfolio' }, { status: 500 })
  }
}
