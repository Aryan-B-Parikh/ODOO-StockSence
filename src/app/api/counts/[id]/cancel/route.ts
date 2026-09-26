import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { cancelCount } from '@/lib/inventory'
import { COUNT_INCLUDE, toCountDTO } from '@/lib/mappers'
import { numericParam } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** POST /api/counts/[id]/cancel (perm 'count') → {count}. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requirePermission('count')
    const id = numericParam((await ctx.params).id)
    await db.$transaction((tx) => cancelCount(tx, id, user.id))
    const row = await db.cycleCount.findUnique({ where: { id }, include: COUNT_INCLUDE })
    return NextResponse.json({ count: toCountDTO(row, []) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
