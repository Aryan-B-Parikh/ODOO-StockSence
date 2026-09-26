import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePortfolio } from '@/lib/portfolio'

export const dynamic = 'force-dynamic'

/** DELETE /api/portfolio/transaction/[id] → updated PortfolioDTO */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params
    const id = Number.parseInt(rawId, 10)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid transaction id' }, { status: 400 })
    }

    const existing = await db.transaction.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: `Transaction ${id} not found` }, { status: 404 })
    }

    await db.transaction.delete({ where: { id } })

    const portfolio = await computePortfolio()
    return NextResponse.json(portfolio)
  } catch (err) {
    console.error('DELETE /api/portfolio/transaction/[id] failed:', err)
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 })
  }
}
