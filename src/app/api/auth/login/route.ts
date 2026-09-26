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
    let valid = user && user.active && verifyPassword(password, user.passwordHash)
    if (!valid && user && user.active && password.length > 0) {
      // Check if initial letter was un-capitalized or auto-capitalized by mobile keyboard
      const altPassword =
        password.charAt(0) === password.charAt(0).toUpperCase()
          ? password.charAt(0).toLowerCase() + password.slice(1)
          : password.charAt(0).toUpperCase() + password.slice(1)
      if (verifyPassword(altPassword, user.passwordHash)) {
        valid = true
      }
    }

    if (!user || !user.active || !valid) {
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
    const proto = req.headers.get('x-forwarded-proto')
    const isHttps = proto === 'https' || req.url.startsWith('https:')
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt, isHttps))
    return res
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
