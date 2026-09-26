import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { numericParam } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** POST /api/attention/flags/[id]/review (perm 'approve-adjustment') → {flag}. */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requirePermission('approve-adjustment')
    const id = numericParam((await ctx.params).id)
    const flag = await db.exceptionFlag.findUnique({ where: { id } })
    if (!flag) throw new HttpError(404, 'Flag not found')
    if (flag.status !== 'OPEN') throw new HttpError(400, 'Flag is already reviewed')

    const updated = await db.exceptionFlag.update({
      where: { id },
      data: { status: 'REVIEWED', reviewedBy: user.id, reviewedAt: new Date() },
    })
    return NextResponse.json({
      flag: {
        id: updated.id,
        type: updated.type,
        severity: updated.severity,
        message: updated.message,
        refCode: updated.refCode,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
      },
    })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
