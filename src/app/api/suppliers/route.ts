import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requirePermission, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { computeSupplierScorecard, computeSupplierScorecards, emptyScorecard } from '@/lib/supplier-metrics'
import type { SupplierDTO, SupplierScorecardDTO } from '@/lib/types'
import { readJson, toNum } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

/** Supplier rows always carry their product links (economics included). */
const SUPPLIER_INCLUDE = {
  products: { include: { product: true } },
} as const

type SupplierRow = Prisma.SupplierGetPayload<{ include: typeof SUPPLIER_INCLUDE }>

function toSupplierDTO(s: SupplierRow, scorecard: SupplierScorecardDTO = emptyScorecard()): SupplierDTO {
  const products = s.products
    .slice()
    .sort(
      (a, b) =>
        Number(b.preferred) - Number(a.preferred) || a.product.sku.localeCompare(b.product.sku)
    )
    .map((ps) => ({
      productId: ps.productId,
      sku: ps.product.sku,
      productName: ps.product.name,
      unit: ps.product.unit,
      preferred: ps.preferred,
      costPrice: ps.costPrice,
      minOrderQty: ps.minOrderQty,
      orderMultiple: ps.orderMultiple,
    }))
  return {
    id: s.id,
    name: s.name,
    contact: s.contact,
    leadTimeDays: s.leadTimeDays,
    reliability: s.reliability,
    damageRate: s.damageRate,
    notes: s.notes,
    productCount: products.length,
    products,
    scorecard,
  }
}

/** Shared field validation for POST (required) and PATCH (subset) bodies. */
function validateLeadTimeDays(value: unknown): number {
  const n = toNum(value, 'leadTimeDays')
  if (!Number.isInteger(n) || n < 1 || n > 120) {
    throw new HttpError(400, 'leadTimeDays must be an integer between 1 and 120')
  }
  return n
}

function validateUnitInterval(value: unknown, field: string): number {
  const n = toNum(value, field)
  if (n < 0 || n > 1) throw new HttpError(400, `${field} must be between 0 and 1`)
  return n
}

/** GET /api/suppliers (auth) → {suppliers: SupplierDTO[]} ordered by name asc. */
export async function GET() {
  try {
    await requireUser()
    const rows = await db.supplier.findMany({ include: SUPPLIER_INCLUDE, orderBy: { name: 'asc' } })
    const scorecards = await computeSupplierScorecards(db, rows.map((r) => r.id))
    return NextResponse.json({ suppliers: rows.map((r) => toSupplierDTO(r, scorecards.get(r.id))) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

interface CreateSupplierBody {
  name?: unknown
  contact?: unknown
  leadTimeDays?: unknown
  reliability?: unknown
  damageRate?: unknown
  notes?: unknown
}

/** POST /api/suppliers (perm 'configure') → {supplier: SupplierDTO}. */
export async function POST(req: Request) {
  try {
    await requirePermission('configure')
    const body = await readJson<CreateSupplierBody>(req)

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) throw new HttpError(400, 'Supplier name is required')

    // Case-insensitive uniqueness (SQLite has no mode:'insensitive' — small table, compare in JS).
    const allNames = await db.supplier.findMany({ select: { name: true } })
    if (allNames.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(400, 'Supplier name already exists')
    }

    const leadTimeDays = validateLeadTimeDays(body.leadTimeDays)

    const data: {
      name: string
      contact: string | null
      leadTimeDays: number
      notes: string | null
      reliability?: number
      damageRate?: number
    } = {
      name,
      contact: typeof body.contact === 'string' && body.contact.trim() ? body.contact.trim() : null,
      leadTimeDays,
      notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes : null,
    }
    if (body.reliability !== undefined) data.reliability = validateUnitInterval(body.reliability, 'reliability')
    if (body.damageRate !== undefined) data.damageRate = validateUnitInterval(body.damageRate, 'damageRate')

    const created = await db.supplier.create({ data })
    const row = await db.supplier.findUnique({ where: { id: created.id }, include: SUPPLIER_INCLUDE })
    if (!row) throw new HttpError(404, 'Supplier not found')
    const scorecard = await computeSupplierScorecard(db, created.id)
    return NextResponse.json({ supplier: toSupplierDTO(row, scorecard) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
