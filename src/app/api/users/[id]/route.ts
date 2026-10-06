import { NextResponse } from 'next/server'
import { requireAdmin, hashPassword } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { ROLE_DEFAULTS } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/users/[id]
 * Owner updates account status (active/inactive), role, or resets password.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin()
    const { id: rawId } = await params
    const id = parseInt(rawId, 10)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    const targetUser = await db.user.findUnique({ where: { id } })
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))
    const updates: {
      name?: string
      active?: boolean
      role?: string
      permissions?: string
      passwordHash?: string
    } = {}

    if (typeof body.name === 'string' && body.name.trim().length >= 2) {
      updates.name = body.name.trim()
    }

    if (typeof body.active === 'boolean') {
      if (admin.id === id && body.active === false) {
        return NextResponse.json({ error: 'You cannot deactivate your own master administrator account.' }, { status: 400 })
      }
      updates.active = body.active
      // Invalidate sessions if deactivated
      if (body.active === false) {
        await db.session.deleteMany({ where: { userId: id } })
      }
    }

    if (typeof body.role === 'string' && ['WAREHOUSE_STAFF', 'INVENTORY_MANAGER', 'ADMINISTRATOR'].includes(body.role)) {
      if (admin.id === id && body.role !== 'ADMINISTRATOR') {
        return NextResponse.json({ error: 'You cannot demote your own administrator account.' }, { status: 400 })
      }
      updates.role = body.role
      updates.permissions = JSON.stringify(ROLE_DEFAULTS[body.role] ?? ROLE_DEFAULTS.WAREHOUSE_STAFF)
    }

    if (typeof body.password === 'string' && body.password.length >= 8) {
      updates.passwordHash = hashPassword(body.password)
      // Clear sessions to require login with new password
      await db.session.deleteMany({ where: { userId: id } })
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid update fields provided' }, { status: 400 })
    }

    const updated = await db.user.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      user: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
      },
      message: 'Account updated successfully.',
    })
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[PATCH /api/users/[id]]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * DELETE /api/users/[id]
 * Deletes user account if no operations were linked, or soft-deactivates.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin()
    const { id: rawId } = await params
    const id = parseInt(rawId, 10)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    if (admin.id === id) {
      return NextResponse.json({ error: 'You cannot delete your own master administrator account.' }, { status: 400 })
    }

    const targetUser = await db.user.findUnique({ where: { id } })
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Invalidate sessions
    await db.session.deleteMany({ where: { userId: id } })

    // Check if user has associated ledger entries or documents
    const ledgerCount = await db.ledgerEntry.count({ where: { performedBy: id } })
    if (ledgerCount > 0) {
      // Soft-delete to preserve immutable audit trail
      await db.user.update({
        where: { id },
        data: { active: false },
      })
      return NextResponse.json({
        message: 'Account has historical audit records. Account has been deactivated instead of deleted.',
        deactivated: true,
      })
    }

    await db.user.delete({ where: { id } })
    return NextResponse.json({ message: 'Account deleted successfully.' })
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[DELETE /api/users/[id]]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
