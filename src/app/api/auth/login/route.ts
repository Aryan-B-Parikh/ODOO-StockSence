import { NextResponse } from 'next/server'
import { createSession, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import type { SessionUser } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** POST /api/auth/login {email, password} → {user: SessionUser} + sns_session cookie. */
export async function POST(req: Request) {
  try {
    let body: { email?: unknown; password?: unknown } = {}
    try {
      body = (await req.json()) as typeof body
    } catch {
      throw new HttpError(400, 'Invalid JSON body')
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !password) throw new HttpError(400, 'Email and password are required')

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, 'Invalid email or password')
    }

    let permissions: string[] = []
    try {
      permissions = JSON.parse(user.permissions)
    } catch {
      permissions = []
    }
    const sessionUser: SessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions,
    }

    const { token, expiresAt } = await createSession(user.id)
    const res = NextResponse.json({ user: sessionUser })
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
    return res
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
