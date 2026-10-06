import { NextResponse } from 'next/server'
import { requireAdmin, hashPassword } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { ROLE_DEFAULTS } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * GET /api/users
 * Returns list of all accounts for the Owner / Administrator.
 */
export async function GET() {
  try {
    await requireAdmin()

    const users = await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        permissions: true,
      },
      orderBy: { id: 'asc' },
    })

    const formatted = users.map((u) => {
      let perms: string[] = []
      try {
        perms = JSON.parse(u.permissions)
      } catch {
        perms = []
      }
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        createdAt: u.createdAt.toISOString(),
        permissions: perms,
      }
    })

    return NextResponse.json({ users: formatted })
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[GET /api/users]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * POST /api/users
 * Allows the Owner (ADMINISTRATOR) to provision a new Staff or Manager account.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin()

    const body = await req.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = typeof body.role === 'string' ? body.role.trim() : 'WAREHOUSE_STAFF'
    const password = typeof body.password === 'string' ? body.password : ''

    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Full name is required (at least 2 characters).' }, { status: 400 })
    }

    if (!email || !email.includes('@') || !email.includes('.')) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
    }

    if (!['WAREHOUSE_STAFF', 'INVENTORY_MANAGER', 'ADMINISTRATOR'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be WAREHOUSE_STAFF or INVENTORY_MANAGER.' }, { status: 400 })
    }

    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 })
    }

    // Check email uniqueness
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: `An account with email "${email}" already exists.` }, { status: 409 })
    }

    const defaultPerms = ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.WAREHOUSE_STAFF
    const passwordHash = hashPassword(password)

    const newUser = await db.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        permissions: JSON.stringify(defaultPerms),
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      {
        user: {
          ...newUser,
          createdAt: newUser.createdAt.toISOString(),
          permissions: defaultPerms,
        },
        message: `Account created successfully for ${newUser.name}.`,
      },
      { status: 201 }
    )
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[POST /api/users]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
