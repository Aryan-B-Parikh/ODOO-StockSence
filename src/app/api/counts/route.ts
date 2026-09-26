import { NextResponse } from 'next/server'
import { requirePermission, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { createCount } from '@/lib/inventory'
import { COUNT_INCLUDE, toCountDTO } from '@/lib/mappers'
import { readJson, toDate, toNum } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

/** adjustmentCodes = codes of adjustments whose reason references the count's code. */
async function countCodesFor(codes: string[]): Promise<Map<string, string[]>> {
  if (codes.length === 0) return new Map()
  const adjustments = await db.adjustment.findMany({ select: { code: true, reason: true } })
  const map = new Map<string, string[]>()
  for (const c of codes) {
    map.set(c, adjustments.filter((a) => (a.reason ?? '').includes(c)).map((a) => a.code))
  }
  return map
}

/** GET /api/counts ?status= → {counts: CycleCountDTO[]}. */
export async function GET(req: Request) {
  try {
    await requireUser()
    const status = new URL(req.url).searchParams.get('status')?.trim() ?? ''
    const rows = await db.cycleCount.findMany({ include: COUNT_INCLUDE, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] })
    const adjustmentMap = await countCodesFor(rows.map((c) => c.code))
    let counts = rows.map((c) => toCountDTO(c, adjustmentMap.get(c.code) ?? []))
    if (status) counts = counts.filter((c) => c.status === status)
    return NextResponse.json({ counts })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

interface CreateCountBody {
  scope?: unknown
  locationId?: unknown
  productId?: unknown
  dueDate?: unknown
  note?: unknown
}

/** POST /api/counts (perm 'count') {scope:'LOCATION'|'PRODUCT', locationId?, productId?, dueDate?, note?} → {count}. */
export async function POST(req: Request) {
  try {
    const user = await requirePermission('count')
    const body = await readJson<CreateCountBody>(req)
    if (body.scope !== 'LOCATION' && body.scope !== 'PRODUCT') {
      throw new HttpError(400, 'scope must be "LOCATION" or "PRODUCT"')
    }
    const count = await db.$transaction((tx) =>
      createCount(
        tx,
        {
          scope: body.scope as 'LOCATION' | 'PRODUCT',
          locationId: body.locationId != null ? toNum(body.locationId, 'locationId') : undefined,
          productId: body.productId != null ? toNum(body.productId, 'productId') : undefined,
          dueDate: body.dueDate != null && body.dueDate !== '' ? toDate(body.dueDate, 'dueDate').toISOString() : undefined,
          note: typeof body.note === 'string' && body.note.trim() !== '' ? body.note : null,
        },
        user.id
      )
    )
    const row = await db.cycleCount.findUnique({ where: { id: count.id }, include: COUNT_INCLUDE })
    return NextResponse.json({ count: toCountDTO(row, []) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
