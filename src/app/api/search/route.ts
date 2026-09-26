import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import type { SearchResultDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/search?q= → {results: SearchResultDTO[]} — products by sku/name substring (limit 8). */
export async function GET(req: Request) {
  try {
    await requireUser()
    const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
    if (!q) return NextResponse.json({ results: [] })

    const products = await db.product.findMany({
      where: { active: true, OR: [{ sku: { contains: q } }, { name: { contains: q } }] },
      include: { stocks: true },
      orderBy: { sku: 'asc' },
      take: 8,
    })

    const results: SearchResultDTO[] = products.map((p) => {
      const onHand = p.stocks.reduce((a, s) => a + s.onHand, 0)
      const reserved = p.stocks.reduce((a, s) => a + s.reserved, 0)
      const incoming = p.stocks.reduce((a, s) => a + s.incoming, 0)
      const projectedAvailable = onHand + incoming - reserved
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        onHand,
        available: onHand - reserved,
        belowReorder: projectedAvailable < p.reorderPoint,
      }
    })
    return NextResponse.json({ results })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
