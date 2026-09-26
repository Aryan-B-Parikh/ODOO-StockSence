import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { destroySession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth'
import { HttpError } from '@/lib/http'

export const dynamic = 'force-dynamic'

/** POST /api/auth/logout → {ok:true}. Safe to call without a session. */
export async function POST() {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (token) await destroySession(token)
    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(new Date(0)))
    return res
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
