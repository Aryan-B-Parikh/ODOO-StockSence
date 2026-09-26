/**
 * StockSense — session auth (server only).
 * Email + password (scrypt), opaque session tokens in an httpOnly cookie.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import type { PermissionAction } from '@/lib/permissions'
import type { SessionUser } from '@/lib/types'

export const SESSION_COOKIE = 'sns_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

// ---------- password hashing (scrypt: salt:hash hex) ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

// ---------- sessions ----------

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({ data: { token, userId, expiresAt } })
  return { token, expiresAt }
}

export async function destroySession(token: string): Promise<void> {
  await db.session.deleteMany({ where: { token } })
}

function toSessionUser(u: { id: number; name: string; email: string; role: string; permissions: string; active: boolean }): SessionUser | null {
  if (!u.active) return null
  let perms: string[] = []
  try {
    perms = JSON.parse(u.permissions)
  } catch {
    perms = []
  }
  return { id: u.id, name: u.name, email: u.email, role: u.role, permissions: perms }
}

/** Read the current session (cookie → Session). Returns null when signed out. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  })
  if (!session || session.expiresAt.getTime() < Date.now()) return null
  return toSessionUser(session.user)
}

/** Throws 401 when not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new HttpError(401, 'Not signed in')
  return user
}

/** Throws 401/403 unless the session user holds the given permission action. */
export async function requirePermission(action: PermissionAction): Promise<SessionUser> {
  const user = await requireUser()
  if (!user.permissions.includes(action)) {
    throw new HttpError(403, `Your role (${user.role}) is not permitted to "${action}".`)
  }
  return user
}

export function sessionCookieOptions(expiresAt: Date, isSecure?: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isSecure ?? (process.env.NODE_ENV === 'production'),
    path: '/',
    expires: expiresAt,
  }
}
