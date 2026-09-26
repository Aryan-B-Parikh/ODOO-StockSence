import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { DELIVERY_INCLUDE, toDeliveryDTO } from '@/lib/mappers'
import { fetchStockMap, numericParam } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/deliveries/[id] → {delivery: DeliveryDTO} (404 unknown). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireUser()
    const id = numericParam((await ctx.params).id)
    const [row, stockMap] = await Promise.all([
      db.deliveryOrder.findUnique({ where: { id }, include: DELIVERY_INCLUDE }),
      fetchStockMap(),
    ])
    if (!row) throw new HttpError(404, 'Delivery order not found')
    return NextResponse.json({ delivery: toDeliveryDTO(row, stockMap) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
