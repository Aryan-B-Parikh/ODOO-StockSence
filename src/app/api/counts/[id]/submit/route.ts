import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { submitCount } from '@/lib/inventory'
import { COUNT_INCLUDE, toCountDTO } from '@/lib/mappers'
import { numericParam, readJson, toNum } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

interface SubmitBody {
  lines?: unknown
  note?: unknown
}

/** POST /api/counts/[id]/submit (perm 'count') {lines:[{lineId,countedQty}],note?} → {count, adjustment|null}. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requirePermission('count')
    const id = numericParam((await ctx.params).id)
    const body = await readJson<SubmitBody>(req)

    const rawLines = Array.isArray(body.lines) ? body.lines : []
    if (rawLines.length === 0) throw new HttpError(400, 'Counted quantities are required')
    const lines = rawLines.map((l: Record<string, unknown>) => ({
      lineId: toNum(l.lineId, 'lines[].lineId'),
      countedQty: toNum(l.countedQty, 'lines[].countedQty'),
    }))

    const { outcome } = await db.$transaction((tx) =>
      submitCount(tx, id, { lines, note: typeof body.note === 'string' && body.note.trim() !== '' ? body.note : null }, user.id)
    )

    const row = await db.cycleCount.findUnique({ where: { id }, include: COUNT_INCLUDE })
    if (!row) throw new HttpError(404, 'Cycle count not found')
    const adjustments = await db.adjustment.findMany({
      where: { reason: { contains: row.code } },
      select: { code: true },
    })
    return NextResponse.json({
      count: toCountDTO(row, adjustments.map((a) => a.code)),
      adjustment: outcome
        ? {
            code: outcome.adjustment.code,
            severity: outcome.adjustment.severity,
            status: outcome.adjustment.status,
            explanation: outcome.explanation,
          }
        : null,
    })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
