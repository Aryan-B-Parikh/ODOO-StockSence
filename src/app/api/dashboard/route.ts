import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { computeDashboardFixed } from '@/app/api/_lib/attention-compat'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import type { ExceptionFlagDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/dashboard → DashboardDTO (kpis, valueByCategory, racks, 14-day flows, activity, attention). */
export async function GET() {
  try {
    await requireUser()
    const data = await computeDashboardFixed(db)
    // Map attention.flags rows to ExceptionFlagDTO (the rest already matches DashboardDTO).
    const flags: ExceptionFlagDTO[] = data.attention.flags.map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      message: f.message,
      refCode: f.refCode,
      status: f.status,
      createdAt: f.createdAt.toISOString(),
    }))
    return NextResponse.json({ ...data, attention: { ...data.attention, flags } })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
