import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { LEDGER_INCLUDE, toLedgerDTO } from '@/lib/mappers'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * GET /api/ledger/export?docType=&productId=&locationId=&from=&to=&q=
 * → text/csv attachment of the filtered immutable ledger (same filters as /api/ledger).
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const url = new URL(req.url)
    const where: Prisma.LedgerEntryWhereInput = {}
    const docType = url.searchParams.get('docType')
    if (docType && docType !== 'ALL') where.docType = docType
    const productId = url.searchParams.get('productId')
    if (productId && Number.isFinite(Number(productId))) where.productId = Number(productId)
    const locationId = url.searchParams.get('locationId')
    if (locationId && Number.isFinite(Number(locationId))) where.locationId = Number(locationId)
    const from = url.searchParams.get('from')
    if (from && !Number.isNaN(new Date(from).getTime())) where.createdAt = { ...(where.createdAt as object), gte: new Date(from) }
    const to = url.searchParams.get('to')
    if (to && !Number.isNaN(new Date(to).getTime())) {
      const end = new Date(to)
      end.setHours(23, 59, 59, 999)
      where.createdAt = { ...(where.createdAt as object), lte: end }
    }
    const q = url.searchParams.get('q')?.trim()
    if (q) {
      where.OR = [
        { code: { contains: q } },
        { docCode: { contains: q } },
        { reason: { contains: q } },
        { product: { sku: { contains: q } } },
        { product: { name: { contains: q } } },
      ]
    }

    const rows = await db.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: LEDGER_INCLUDE,
    })
    const userIds = [...new Set(rows.map((r) => r.performedBy).filter((x): x is number => x != null))]
    const users = await db.user.findMany({ where: { id: { in: userIds } } })
    const userById = new Map(users.map((u) => [u.id, u.name]))

    const header = ['Entry Code', 'Document', 'Doc Type', 'Date (UTC)', 'SKU', 'Product', 'Location', 'Field', 'Previous Qty', 'New Qty', 'Difference', 'Reason', 'Performed By']
    const lines = [header.join(',')]
    for (const row of rows) {
      const e = toLedgerDTO(row, userById)
      lines.push(
        [
          csvEscape(e.code),
          csvEscape(e.docCode),
          csvEscape(e.docType),
          csvEscape(e.createdAt),
          csvEscape(e.sku),
          csvEscape(e.productName),
          csvEscape(e.locationPath),
          csvEscape(e.field),
          csvEscape(e.prevQty),
          csvEscape(e.newQty),
          csvEscape(e.diff),
          csvEscape(e.reason),
          csvEscape(e.performedByName),
        ].join(',')
      )
    }

    return new NextResponse(lines.join('\r\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="stocksense-ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
