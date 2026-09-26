import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { rejectAdjustment } from '@/lib/inventory'
import { ADJUSTMENT_INCLUDE, toAdjustmentDTO } from '@/lib/mappers'
import { fetchUserNameMap, numericParam } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** POST /api/adjustments/[id]/reject (perm 'approve-adjustment') → {adjustment}. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requirePermission('approve-adjustment')
    const id = numericParam((await ctx.params).id)
    await db.$transaction((tx) => rejectAdjustment(tx, id, user.id))
    const row = await db.adjustment.findUnique({ where: { id }, include: ADJUSTMENT_INCLUDE })
    if (!row) throw new HttpError(404, 'Adjustment not found')
    const userNames = await fetchUserNameMap([row.createdBy, row.approvedBy])
    return NextResponse.json({ adjustment: toAdjustmentDTO(row, userNames) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
