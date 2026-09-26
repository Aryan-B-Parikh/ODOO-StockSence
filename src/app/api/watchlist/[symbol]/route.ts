import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { toWatchItemDTO } from '@/app/api/_lib/watchlist'

export const dynamic = 'force-dynamic'

/** PATCH /api/watchlist/[symbol] body { note?, alertAbove?, alertBelow? } (null clears) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol: raw } = await params
    const symbol = raw.trim().toUpperCase()

    const existing = await db.watchItem.findUnique({ where: { symbol } })
    if (!existing) {
      return NextResponse.json({ error: `${symbol} is not on the watchlist` }, { status: 404 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { note, alertAbove, alertBelow } = (body ?? {}) as Record<string, unknown>

    const data: { note?: string | null; alertAbove?: number | null; alertBelow?: number | null } = {}

    if (note !== undefined) {
      if (note !== null && typeof note !== 'string') {
        return NextResponse.json({ error: 'note must be a string or null' }, { status: 400 })
      }
      data.note = note
    }
    for (const [key, value] of [['alertAbove', alertAbove], ['alertBelow', alertBelow]] as const) {
      if (value === undefined) continue
      if (value === null) {
        data[key] = null
      } else if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        data[key] = value
      } else {
        return NextResponse.json(
          { error: `${key} must be a positive number or null` },
          { status: 400 },
        )
      }
    }

    const alertAboveFinal = data.alertAbove !== undefined ? data.alertAbove : existing.alertAbove
    const alertBelowFinal = data.alertBelow !== undefined ? data.alertBelow : existing.alertBelow
    if (alertAboveFinal !== null && alertBelowFinal !== null && alertAboveFinal <= alertBelowFinal) {
      return NextResponse.json(
        { error: 'alertAbove must be greater than alertBelow' },
        { status: 400 },
      )
    }

    const row = await db.watchItem.update({ where: { symbol }, data })
    const item = toWatchItemDTO(row)
    if (!item) {
      return NextResponse.json({ error: 'Failed to build watch item' }, { status: 500 })
    }
    return NextResponse.json(item)
  } catch (err) {
    console.error('PATCH /api/watchlist/[symbol] failed:', err)
    return NextResponse.json({ error: 'Failed to update watchlist item' }, { status: 500 })
  }
}

/** DELETE /api/watchlist/[symbol] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol: raw } = await params
    const symbol = raw.trim().toUpperCase()

    const existing = await db.watchItem.findUnique({ where: { symbol } })
    if (!existing) {
      return NextResponse.json({ error: `${symbol} is not on the watchlist` }, { status: 404 })
    }

    await db.watchItem.delete({ where: { symbol } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/watchlist/[symbol] failed:', err)
    return NextResponse.json({ error: 'Failed to remove watchlist item' }, { status: 500 })
  }
}
