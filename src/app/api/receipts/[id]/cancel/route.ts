import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { cancelReceipt } from '@/lib/inventory'
import { RECEIPT_INCLUDE, toReceiptDTO } from '@/lib/mappers'
import { numericParam } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** POST /api/receipts/[id]/cancel (perm 'receive') → {receipt}. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requirePermission('receive')
    const id = numericParam((await ctx.params).id)
    await db.$transaction((tx) => cancelReceipt(tx, id, user.id))
    const row = await db.receipt.findUnique({ where: { id }, include: RECEIPT_INCLUDE })
    return NextResponse.json({ receipt: toReceiptDTO(row) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
