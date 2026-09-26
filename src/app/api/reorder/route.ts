import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { refreshSuggestions } from '@/lib/inventory'
import { mapSuggestions } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/reorder → {suggestions: ReorderSuggestionDTO[]}
 * Refreshes PENDING suggestions first (engine, idempotent), then maps every
 * suggestion with live needs + preferred-supplier MOQ / order multiple.
 */
export async function GET() {
  try {
    await requireUser()
    await refreshSuggestions(db)
    const rows = await db.reorderSuggestion.findMany({
      include: { product: { include: { stocks: true } } },
      orderBy: { updatedAt: 'desc' },
    })
    const suggestions = await mapSuggestions(rows)
    return NextResponse.json({ suggestions })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
