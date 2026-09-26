import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { cancelDelivery } from '@/lib/inventory'
import { DELIVERY_INCLUDE, toDeliveryDTO } from '@/lib/mappers'
import { fetchStockMap, numericParam } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** POST /api/deliveries/[id]/cancel (perm 'pick') → {delivery}. Releases the reservation. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requirePermission('pick')
    const id = numericParam((await ctx.params).id)
    await db.$transaction((tx) => cancelDelivery(tx, id, user.id))
    const [row, stockMap] = await Promise.all([
      db.deliveryOrder.findUnique({ where: { id }, include: DELIVERY_INCLUDE }),
      fetchStockMap(),
    ])
    return NextResponse.json({ delivery: toDeliveryDTO(row, stockMap) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
