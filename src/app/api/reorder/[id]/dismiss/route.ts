import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { dismissSuggestion } from '@/lib/inventory'
import { mapSuggestions, numericParam } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** POST /api/reorder/[id]/dismiss (perm 'approve-reorder') → {suggestion}. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requirePermission('approve-reorder')
    const id = numericParam((await ctx.params).id)
    await db.$transaction((tx) => dismissSuggestion(tx, id, user.id))
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
