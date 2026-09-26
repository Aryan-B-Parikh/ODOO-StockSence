import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Liveness probe — no auth. */
export async function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString() })
}
