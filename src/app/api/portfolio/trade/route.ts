import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getQuote } from '@/lib/market/engine'
import { computePortfolio, getPositionsSnapshot } from '@/lib/portfolio'

export const dynamic = 'force-dynamic'

const FEE = 0.99

/** POST /api/portfolio/trade body { symbol, side, quantity, price? } → updated PortfolioDTO */
export async function POST(request: Request) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { symbol, side, quantity, price } = (body ?? {}) as Record<string, unknown>

    // --- validation ---
    if (typeof symbol !== 'string' || symbol.trim().length === 0) {
      return NextResponse.json({ error: 'symbol is required' }, { status: 400 })
    }
    const sym = symbol.trim().toUpperCase()

    const quote = getQuote(sym)
    if (!quote) {
      return NextResponse.json({ error: `Unknown symbol: ${sym}` }, { status: 400 })
    }

    if (side !== 'BUY' && side !== 'SELL') {
      return NextResponse.json({ error: "side must be 'BUY' or 'SELL'" }, { status: 400 })
    }

    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 })
    }

    let effPrice = quote.price
    if (price !== undefined && price !== null) {
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        return NextResponse.json({ error: 'price must be a positive number' }, { status: 400 })
      }
      effPrice = price
    }

    // --- current state (from full transaction history) ---
    const snapshot = await getPositionsSnapshot()
    const owned = snapshot.positions.get(sym)?.quantity ?? 0

    if (side === 'BUY') {
      const cost = quantity * effPrice + FEE
      if (cost > snapshot.cash) {
        return NextResponse.json(
          {
            error: `Insufficient cash: order needs $${cost.toFixed(2)} but only $${snapshot.cash.toFixed(2)} is available`,
          },
          { status: 400 },
        )
      }
    } else {
      if (quantity > owned + 1e-9) {
        return NextResponse.json(
          { error: `You only own ${owned} share(s) of ${sym} — cannot sell ${quantity}` },
          { status: 400 },
        )
      }
    }

    await db.transaction.create({
      data: {
        symbol: sym,
        side,
        quantity,
        price: effPrice,
        fee: FEE,
        executedAt: new Date(),
      },
    })

    const portfolio = await computePortfolio()
    return NextResponse.json(portfolio)
  } catch (err) {
    console.error('POST /api/portfolio/trade failed:', err)
    return NextResponse.json({ error: 'Trade failed' }, { status: 500 })
  }
}
