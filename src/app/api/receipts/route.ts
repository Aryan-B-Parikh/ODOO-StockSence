import { NextResponse } from 'next/server'
import { requirePermission, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { createReceipt } from '@/lib/inventory'
import { RECEIPT_INCLUDE, toReceiptDTO } from '@/lib/mappers'
import { readJson, toDate, toNum } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

/** GET /api/receipts ?status=&delayed=1 → {receipts: ReceiptDTO[]}. */
export async function GET(req: Request) {
  try {
    await requireUser()
    const sp = new URL(req.url).searchParams
    const status = sp.get('status')?.trim() ?? ''
    const delayedOnly = sp.get('delayed') === '1'

    const rows = await db.receipt.findMany({ include: RECEIPT_INCLUDE, orderBy: { createdAt: 'desc' } })
    let receipts = rows.map(toReceiptDTO)
    if (status) receipts = receipts.filter((r) => r.status === status)
    if (delayedOnly) receipts = receipts.filter((r) => r.status === 'EXPECTED' && r.daysLate > 0)
    return NextResponse.json({ receipts })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

interface CreateReceiptBody {
  supplierId?: unknown
  expectedAt?: unknown
  note?: unknown
  lines?: unknown
}

/** POST /api/receipts (perm 'receive') {supplierId?, expectedAt?, note?, lines} → {receipt}. */
export async function POST(req: Request) {
  try {
    const user = await requirePermission('receive')
    const body = await readJson<CreateReceiptBody>(req)

    const rawLines = Array.isArray(body.lines) ? body.lines : []
    if (rawLines.length === 0) throw new HttpError(400, 'A receipt needs at least one line')
    const lines = rawLines.map((l: Record<string, unknown>) => ({
      productId: toNum(l.productId, 'lines[].productId'),
      locationId: toNum(l.locationId, 'lines[].locationId'),
      expectedQty: toNum(l.expectedQty, 'lines[].expectedQty'),
    }))

    const receipt = await db.$transaction((tx) =>
      createReceipt(
        tx,
        {
          supplierId: body.supplierId != null && body.supplierId !== '' ? toNum(body.supplierId, 'supplierId') : null,
          expectedAt:
            body.expectedAt != null && body.expectedAt !== ''
              ? toDate(body.expectedAt, 'expectedAt').toISOString()
              : undefined,
          note: typeof body.note === 'string' && body.note.trim() !== '' ? body.note : null,
          lines,
        },
        user.id
      )
    )

    const row = await db.receipt.findUnique({ where: { id: receipt.id }, include: RECEIPT_INCLUDE })
    return NextResponse.json({ receipt: toReceiptDTO(row) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
