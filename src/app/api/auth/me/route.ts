import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { HttpError } from '@/lib/http'

export const dynamic = 'force-dynamic'

/** GET /api/auth/me → {user: SessionUser | null} (null when signed out). */
export async function GET() {
  try {
    const user = await getSessionUser()
    return NextResponse.json({ user })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
