import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { acceptSuggestion } from '@/lib/inventory'
import { mapSuggestions, numericParam, readJson, toDate } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

interface AcceptBody {
  expectedAt?: unknown
}

/** POST /api/reorder/[id]/accept (perm 'approve-reorder') {expectedAt?} → {suggestion}. Creates an expected receipt. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requirePermission('approve-reorder')
    const id = numericParam((await ctx.params).id)
    // body is optional — accept an empty POST as well as {expectedAt}
    let body: AcceptBody = {}
    try {
      const text = await req.text()
      if (text.trim()) body = JSON.parse(text) as AcceptBody
    } catch {
      throw new HttpError(400, 'Invalid JSON body')
    }
    const expectedAt =
      body.expectedAt != null && body.expectedAt !== '' ? toDate(body.expectedAt, 'expectedAt').toISOString() : undefined

    await db.$transaction((tx) => acceptSuggestion(tx, id, user.id, expectedAt))
    const row = await db.reorderSuggestion.findUnique({
      where: { id },
      include: { product: { include: { stocks: true } } },
    })
    if (!row) throw new HttpError(404, 'Suggestion not found')
    const [suggestion] = await mapSuggestions([row])
    return NextResponse.json({ suggestion })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
