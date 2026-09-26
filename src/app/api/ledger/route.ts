import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { LEDGER_INCLUDE, toLedgerDTO } from '@/lib/mappers'
import type { Prisma } from '@prisma/client'
import { fetchUserNameMap } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ledger ?docType=&productId=&locationId=&from=&to=&q=&limit=50&offset=0
 * → {entries: LedgerEntryDTO[], total, docTypes}
 */
export async function GET(req: Request) {
  try {
    await requireUser()
    const sp = new URL(req.url).searchParams
    const docType = sp.get('docType')?.trim() ?? ''
    const q = sp.get('q')?.trim().toLowerCase() ?? ''
    const productId = sp.get('productId') ? Number(sp.get('productId')) : null
    const locationId = sp.get('locationId') ? Number(sp.get('locationId')) : null
    const from = sp.get('from')?.trim() ?? ''
    const to = sp.get('to')?.trim() ?? ''
    const limit = Math.min(200, Math.max(1, Number(sp.get('limit')) || 50))
    const offset = Math.max(0, Number(sp.get('offset')) || 0)

    const where: Prisma.LedgerEntryWhereInput = {}
    if (docType) where.docType = docType
    if (productId != null && Number.isFinite(productId)) where.productId = productId
    if (locationId != null && Number.isFinite(locationId)) where.locationId = locationId
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from.length === 10 ? `${from}T00:00:00.000Z` : from)
      if (to) where.createdAt.lte = new Date(to.length === 10 ? `${to}T23:59:59.999Z` : to)
    }

    const [rows, distinctRows] = await Promise.all([
      db.ledgerEntry.findMany({ where, include: LEDGER_INCLUDE, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      db.ledgerEntry.findMany({ distinct: ['docType'], select: { docType: true }, orderBy: { docType: 'asc' } }),
    ])

    // q spans code/docCode/sku/reason (joined fields) → filter in JS, then paginate.
    let filtered = rows
    if (q) {
      filtered = rows.filter(
        (e) =>
          e.code.toLowerCase().includes(q) ||
          e.docCode.toLowerCase().includes(q) ||
          e.product.sku.toLowerCase().includes(q) ||
          (e.reason ?? '').toLowerCase().includes(q)
      )
    }
    const total = filtered.length
    const userNames = await fetchUserNameMap(filtered.map((e) => e.performedBy))
    const entries = filtered.slice(offset, offset + limit).map((e) => toLedgerDTO(e, userNames))
    const docTypes = distinctRows.map((d) => d.docType)

    return NextResponse.json({ entries, total, docTypes })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
