import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { approveAdjustment } from '@/lib/inventory'
import { ADJUSTMENT_INCLUDE, toAdjustmentDTO } from '@/lib/mappers'
import { fetchUserNameMap, numericParam } from '@/app/api/_lib/route-helpers'
import { triggerLowStockCheck } from '@/lib/mail/triggers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** POST /api/adjustments/[id]/approve (perm 'approve-adjustment') → {adjustment}. Posts the stock change. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requirePermission('approve-adjustment')
    const id = numericParam((await ctx.params).id)
    await db.$transaction((tx) => approveAdjustment(tx, id, user.id))
    const row = await db.adjustment.findUnique({ where: { id }, include: ADJUSTMENT_INCLUDE })
    if (!row) throw new HttpError(404, 'Adjustment not found')

    // UC-1: Check if any adjusted products reached low-stock threshold
    const productIds = row.lines.map((l) => l.productId)
    triggerLowStockCheck(productIds).catch((err) => console.error('[mail] Low-stock alert failed:', err))

    const userNames = await fetchUserNameMap([row.createdBy, row.approvedBy])
    return NextResponse.json({ adjustment: toAdjustmentDTO(row, userNames) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
