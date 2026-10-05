import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { markDeliveryDelivered } from '@/lib/inventory'
import { DELIVERY_INCLUDE, toDeliveryDTO } from '@/lib/mappers'
import { fetchStockMap, numericParam } from '@/app/api/_lib/route-helpers'
import { triggerDeliveryDispatch } from '@/lib/mail/triggers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** POST /api/deliveries/[id]/deliver (any signed-in user) → {delivery}. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUser()
    const id = numericParam((await ctx.params).id)
    await db.$transaction((tx) => markDeliveryDelivered(tx, id, user.id))
    const [row, stockMap] = await Promise.all([
      db.deliveryOrder.findUnique({ where: { id }, include: DELIVERY_INCLUDE }),
      fetchStockMap(),
    ])

    // UC-3 & UC-1: Dispatch Customer Packing Slip & check if remaining stock triggered reorder point
    triggerDeliveryDispatch(id).catch((err) => console.error('[mail] Delivery dispatch notification failed:', err))

    return NextResponse.json({ delivery: toDeliveryDTO(row, stockMap) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
