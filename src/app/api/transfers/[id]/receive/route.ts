import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { receiveTransfer } from '@/lib/inventory'
import { toTransferDTO, TRANSFER_INCLUDE } from '@/lib/mappers'
import { fetchStockMap, numericParam } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** POST /api/transfers/[id]/receive (perm 'transfer') → {transfer}. Moves In-transit → On-hand at destination. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requirePermission('transfer')
    const id = numericParam((await ctx.params).id)
    await db.$transaction((tx) => receiveTransfer(tx, id, user.id))
    const [row, stockMap] = await Promise.all([
      db.transfer.findUnique({ where: { id }, include: TRANSFER_INCLUDE }),
      fetchStockMap(),
    ])
    return NextResponse.json({ transfer: toTransferDTO(row, stockMap) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
