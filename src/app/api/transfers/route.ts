import { NextResponse } from 'next/server'
import { requirePermission, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { createTransfer } from '@/lib/inventory'
import { toTransferDTO, TRANSFER_INCLUDE } from '@/lib/mappers'
import { fetchStockMap, readJson, toNum } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

/** GET /api/transfers ?status= → {transfers: TransferDTO[]} (availableAtSource via one stock fetch). */
export async function GET(req: Request) {
  try {
    await requireUser()
    const status = new URL(req.url).searchParams.get('status')?.trim() ?? ''
    const [rows, stockMap] = await Promise.all([
      db.transfer.findMany({ include: TRANSFER_INCLUDE, orderBy: { shippedAt: 'desc' } }),
      fetchStockMap(),
    ])
    let transfers = rows.map((t) => toTransferDTO(t, stockMap))
    if (status) transfers = transfers.filter((t) => t.status === status)
    return NextResponse.json({ transfers })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

interface CreateTransferBody {
  fromLocationId?: unknown
  toLocationId?: unknown
  note?: unknown
  lines?: unknown
}

/** POST /api/transfers (perm 'transfer') {fromLocationId,toLocationId,note?,lines:[{productId,qty}]} → {transfer}. */
export async function POST(req: Request) {
  try {
    const user = await requirePermission('transfer')
    const body = await readJson<CreateTransferBody>(req)

    const rawLines = Array.isArray(body.lines) ? body.lines : []
    if (rawLines.length === 0) throw new HttpError(400, 'A transfer needs at least one line')
    const lines = rawLines.map((l: Record<string, unknown>) => ({
      productId: toNum(l.productId, 'lines[].productId'),
      qty: toNum(l.qty, 'lines[].qty'),
    }))
    const input = {
      fromLocationId: toNum(body.fromLocationId, 'fromLocationId'),
      toLocationId: toNum(body.toLocationId, 'toLocationId'),
      note: typeof body.note === 'string' && body.note.trim() !== '' ? body.note : null,
      lines,
    }

    const transfer = await db.$transaction((tx) => createTransfer(tx, input, user.id))

    const [row, stockMap] = await Promise.all([
      db.transfer.findUnique({ where: { id: transfer.id }, include: TRANSFER_INCLUDE }),
      fetchStockMap(),
    ])
    return NextResponse.json({ transfer: toTransferDTO(row, stockMap) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
