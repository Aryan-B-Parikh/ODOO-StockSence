import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { computeAttention } from '@/lib/attention'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import type { ExceptionFlagDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/attention → {summary, items, flags, below, stockouts}. */
export async function GET() {
  try {
    await requireUser()
    const data = await computeAttention(db)
    const flags: ExceptionFlagDTO[] = data.flags.map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      message: f.message,
      refCode: f.refCode,
      status: f.status,
      createdAt: f.createdAt.toISOString(),
    }))
    return NextResponse.json({
      summary: data.summary,
      items: data.items,
      flags,
      below: data.below,
      stockouts: data.stockouts,
    })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
