import { NextResponse } from 'next/server'
import { requirePermission, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { createDelivery } from '@/lib/inventory'
import { DELIVERY_INCLUDE, toDeliveryDTO } from '@/lib/mappers'
import { fetchStockMap, readJson, toNum } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

/** GET /api/deliveries ?status= → {deliveries: DeliveryDTO[]} (availableAtLocation via one stock fetch). */
export async function GET(req: Request) {
  try {
    await requireUser()
    const status = new URL(req.url).searchParams.get('status')?.trim() ?? ''
    const [rows, stockMap] = await Promise.all([
      db.deliveryOrder.findMany({ include: DELIVERY_INCLUDE, orderBy: { createdAt: 'desc' } }),
      fetchStockMap(),
    ])
    let deliveries = rows.map((d) => toDeliveryDTO(d, stockMap))
    if (status) deliveries = deliveries.filter((d) => d.status === status)
    return NextResponse.json({ deliveries })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

interface CreateDeliveryBody {
  customer?: unknown
  note?: unknown
  lines?: unknown
}

/** POST /api/deliveries (perm 'pick') {customer, note?, lines:[{productId,locationId,qty}]} → {delivery}. */
export async function POST(req: Request) {
  try {
    const user = await requirePermission('pick')
    const body = await readJson<CreateDeliveryBody>(req)

    const customer = typeof body.customer === 'string' ? body.customer.trim() : ''
    if (!customer) throw new HttpError(400, 'Customer name is required')
    const rawLines = Array.isArray(body.lines) ? body.lines : []
    if (rawLines.length === 0) throw new HttpError(400, 'A delivery order needs at least one line')
    const lines = rawLines.map((l: Record<string, unknown>) => ({
      productId: toNum(l.productId, 'lines[].productId'),
      locationId: toNum(l.locationId, 'lines[].locationId'),
      qty: toNum(l.qty, 'lines[].qty'),
    }))

    const order = await db.$transaction((tx) =>
      createDelivery(tx, { customer, note: typeof body.note === 'string' && body.note.trim() !== '' ? body.note : null, lines }, user.id)
    )

    const [row, stockMap] = await Promise.all([
      db.deliveryOrder.findUnique({ where: { id: order.id }, include: DELIVERY_INCLUDE }),
      fetchStockMap(),
    ])
    return NextResponse.json({ delivery: toDeliveryDTO(row, stockMap) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
