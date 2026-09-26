import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { RECEIPT_INCLUDE, toReceiptDTO } from '@/lib/mappers'
import { numericParam } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/receipts/[id] → {receipt: ReceiptDTO} (404 unknown). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireUser()
    const id = numericParam((await ctx.params).id)
    const row = await db.receipt.findUnique({ where: { id }, include: RECEIPT_INCLUDE })
    if (!row) throw new HttpError(404, 'Receipt not found')
    return NextResponse.json({ receipt: toReceiptDTO(row) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
