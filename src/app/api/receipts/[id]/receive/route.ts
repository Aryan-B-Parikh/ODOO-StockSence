import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { receiveReceipt } from '@/lib/inventory'
import { RECEIPT_INCLUDE, toReceiptDTO } from '@/lib/mappers'
import { numericParam, readJson, toNum } from '@/app/api/_lib/route-helpers'
import { triggerGoodsReceiptNote } from '@/lib/mail/triggers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

interface ReceiveBody {
  lines?: unknown
  note?: unknown
}

/** POST /api/receipts/[id]/receive (perm 'receive') {lines:[{lineId,receivedQty,damagedQty?}],note?} → {receipt}. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requirePermission('receive')
    const id = numericParam((await ctx.params).id)
    const body = await readJson<ReceiveBody>(req)

    const rawLines = Array.isArray(body.lines) ? body.lines : []
    if (rawLines.length === 0) throw new HttpError(400, 'Received quantities are required')
    const lines = rawLines.map((l: Record<string, unknown>) => ({
      lineId: toNum(l.lineId, 'lines[].lineId'),
      receivedQty: toNum(l.receivedQty, 'lines[].receivedQty'),
      ...(l.damagedQty != null ? { damagedQty: toNum(l.damagedQty, 'lines[].damagedQty') } : {}),
    }))

    await db.$transaction((tx) =>
      receiveReceipt(tx, id, { lines, note: typeof body.note === 'string' && body.note.trim() !== '' ? body.note : null }, user.id)
    )

    const row = await db.receipt.findUnique({ where: { id }, include: RECEIPT_INCLUDE })

    // UC-4: Asynchronously dispatch Vendor Goods Receipt Note (GRN)
    triggerGoodsReceiptNote(id).catch((err) => console.error('[mail] GRN notification failed:', err))

    return NextResponse.json({ receipt: toReceiptDTO(row) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
