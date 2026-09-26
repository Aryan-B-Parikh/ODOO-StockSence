import { NextResponse } from 'next/server'
import { requirePermission, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { createAdjustment } from '@/lib/inventory'
import { ADJUSTMENT_INCLUDE, toAdjustmentDTO } from '@/lib/mappers'
import { fetchUserNameMap, readJson, toNum } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

/** GET /api/adjustments ?status=&severity= → {adjustments: AdjustmentDTO[]}. */
export async function GET(req: Request) {
  try {
    await requireUser()
    const sp = new URL(req.url).searchParams
    const status = sp.get('status')?.trim() ?? ''
    const severity = sp.get('severity')?.trim() ?? ''

    const rows = await db.adjustment.findMany({ include: ADJUSTMENT_INCLUDE, orderBy: { createdAt: 'desc' } })
    const userNames = await fetchUserNameMap(rows.flatMap((a) => [a.createdBy, a.approvedBy]))
    let adjustments = rows.map((a) => toAdjustmentDTO(a, userNames))
    if (status) adjustments = adjustments.filter((a) => a.status === status)
    if (severity) adjustments = adjustments.filter((a) => a.severity === severity)
    return NextResponse.json({ adjustments })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

interface CreateAdjustmentBody {
  reason?: unknown
  note?: unknown
  lines?: unknown
}

/** POST /api/adjustments (perm 'adjust') {reason, note?, lines:[{productId,locationId,countedQty}]} → 201 {adjustment, explanation, flagsCreated, severity}. */
export async function POST(req: Request) {
  try {
    const user = await requirePermission('adjust')
    const body = await readJson<CreateAdjustmentBody>(req)

    const rawLines = Array.isArray(body.lines) ? body.lines : []
    if (rawLines.length === 0) throw new HttpError(400, 'An adjustment needs at least one line')
    const lines = rawLines.map((l: Record<string, unknown>) => ({
      productId: toNum(l.productId, 'lines[].productId'),
      locationId: toNum(l.locationId, 'lines[].locationId'),
      countedQty: toNum(l.countedQty, 'lines[].countedQty'),
    }))

    const outcome = await db.$transaction((tx) =>
      createAdjustment(
        tx,
        {
          reason: typeof body.reason === 'string' ? body.reason : '',
          note: typeof body.note === 'string' && body.note.trim() !== '' ? body.note : null,
          lines,
        },
        user.id
      )
    )

    const row = await db.adjustment.findUnique({ where: { id: outcome.adjustment.id }, include: ADJUSTMENT_INCLUDE })
    if (!row) throw new HttpError(404, 'Adjustment not found')
    const userNames = await fetchUserNameMap([row.createdBy, row.approvedBy])
    return NextResponse.json(
      {
        adjustment: toAdjustmentDTO(row, userNames),
        explanation: outcome.explanation,
        flagsCreated: outcome.flagsCreated,
        severity: outcome.adjustment.severity,
      },
      { status: 201 }
    )
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
