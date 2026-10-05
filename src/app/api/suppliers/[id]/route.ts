import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requirePermission, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { computeSupplierScorecard, emptyScorecard } from '@/lib/supplier-metrics'
import type { SupplierDTO, SupplierScorecardDTO } from '@/lib/types'
import { numericParam, readJson, toNum } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

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

// ---------- link (ProductSupplier) parsing ----------

interface ParsedLink {
  productId: number
  costPrice?: number
  minOrderQty?: number
  orderMultiple?: number
  preferred?: boolean
}

function parseLink(raw: unknown, index: number): ParsedLink {
  if (typeof raw !== 'object' || raw === null) {
    throw new HttpError(400, `links[${index}] must be an object`)
  }
  const o = raw as Record<string, unknown>
  const productId = toNum(o.productId, `links[${index}].productId`)
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new HttpError(400, `links[${index}].productId must be a positive integer`)
  }
  const link: ParsedLink = { productId }
  if (o.costPrice !== undefined) {
    const n = toNum(o.costPrice, `links[${index}].costPrice`)
    if (n < 0) throw new HttpError(400, `links[${index}].costPrice must be a non-negative number`)
    link.costPrice = n
  }
  if (o.minOrderQty !== undefined) {
    const n = toNum(o.minOrderQty, `links[${index}].minOrderQty`)
    if (n < 0) throw new HttpError(400, `links[${index}].minOrderQty must be a non-negative number`)
    link.minOrderQty = n
  }
  if (o.orderMultiple !== undefined) {
    const n = toNum(o.orderMultiple, `links[${index}].orderMultiple`)
    if (n <= 0) throw new HttpError(400, `links[${index}].orderMultiple must be a positive number`)
    link.orderMultiple = n
  }
  if (o.preferred !== undefined) link.preferred = Boolean(o.preferred)
  return link
}

// ---------- handlers ----------

/** GET /api/suppliers/[id] (auth) → {supplier: SupplierDTO} (404 unknown). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireUser()
    const id = numericParam((await ctx.params).id)
    const row = await db.supplier.findUnique({ where: { id }, include: SUPPLIER_INCLUDE })
    if (!row) throw new HttpError(404, 'Supplier not found')
    const scorecard = await computeSupplierScorecard(db, id)
    return NextResponse.json({ supplier: toSupplierDTO(row, scorecard) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

interface PatchSupplierBody {
  name?: unknown
  contact?: unknown
  leadTimeDays?: unknown
  reliability?: unknown
  damageRate?: unknown
  notes?: unknown
  links?: unknown
}

/**
 * PATCH /api/suppliers/[id] (perm 'configure') → {supplier: SupplierDTO}.
 * Accepts a subset of the scalar fields plus optional `links` — an upsert list
 * of per-product economics (costPrice / minOrderQty / orderMultiple / preferred).
 * Setting preferred:true on a link unsets preferred on every OTHER supplier's
 * link for that product, so each product keeps at most one preferred supplier.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requirePermission('configure')
    const id = numericParam((await ctx.params).id)
    const body = await readJson<PatchSupplierBody>(req)

    const existing = await db.supplier.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw new HttpError(404, 'Supplier not found')

    // Scalar fields — any subset.
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) throw new HttpError(400, 'Supplier name cannot be empty')
      // Case-insensitive uniqueness against every OTHER supplier (SQLite: compare in JS).
      const others = await db.supplier.findMany({ where: { NOT: { id } }, select: { name: true } })
      if (others.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        throw new HttpError(400, 'Supplier name already exists')
      }
      data.name = name
    }
    if (body.contact !== undefined) {
      data.contact =
        body.contact === null || (typeof body.contact === 'string' && body.contact.trim() === '')
          ? null
          : String(body.contact).trim()
    }
    if (body.leadTimeDays !== undefined) data.leadTimeDays = validateLeadTimeDays(body.leadTimeDays)
    if (body.reliability !== undefined) data.reliability = validateUnitInterval(body.reliability, 'reliability')
    if (body.damageRate !== undefined) data.damageRate = validateUnitInterval(body.damageRate, 'damageRate')
    if (body.notes !== undefined) {
      data.notes = body.notes === null ? null : String(body.notes)
    }

    // Links — upsert list of ProductSupplier economics.
    let links: ParsedLink[] | null = null
    if (body.links !== undefined) {
      if (!Array.isArray(body.links)) throw new HttpError(400, 'links must be an array')
      links = body.links.map((l, i) => parseLink(l, i))
      if (links.length > 0) {
        const productIds = [...new Set(links.map((l) => l.productId))]
        const found = await db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true },
        })
        if (found.length !== productIds.length) {
          throw new HttpError(400, 'One or more linked products are unknown')
        }
        // A brand-new link needs a costPrice to exist economically.
        const existingLinks = await db.productSupplier.findMany({
          where: { supplierId: id, productId: { in: productIds } },
          select: { productId: true },
        })
        const linkedProducts = new Set(existingLinks.map((l) => l.productId))
        for (const link of links) {
          if (!linkedProducts.has(link.productId) && link.costPrice === undefined) {
            throw new HttpError(400, `costPrice is required when linking product ${link.productId} for the first time`)
          }
        }
      }
    }

    await db.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) await tx.supplier.update({ where: { id }, data })
      if (links) {
        for (const link of links) {
          // At most one preferred supplier per product: clear the flag on other suppliers first.
          if (link.preferred === true) {
            await tx.productSupplier.updateMany({
              where: { productId: link.productId, supplierId: { not: id }, preferred: true },
              data: { preferred: false },
            })
          }
          const updateData: Record<string, unknown> = {}
          if (link.costPrice !== undefined) updateData.costPrice = link.costPrice
          if (link.minOrderQty !== undefined) updateData.minOrderQty = link.minOrderQty
          if (link.orderMultiple !== undefined) updateData.orderMultiple = link.orderMultiple
          if (link.preferred !== undefined) updateData.preferred = link.preferred
          const row = await tx.productSupplier.findUnique({
            where: { productId_supplierId: { productId: link.productId, supplierId: id } },
          })
          if (row) {
            if (Object.keys(updateData).length > 0) {
              await tx.productSupplier.update({ where: { id: row.id }, data: updateData })
            }
          } else {
            await tx.productSupplier.create({
              data: {
                productId: link.productId,
                supplierId: id,
                costPrice: link.costPrice ?? 0,
                minOrderQty: link.minOrderQty ?? 0,
                orderMultiple: link.orderMultiple ?? 1,
                preferred: link.preferred ?? false,
              },
            })
          }
        }
      }
    })

    const row = await db.supplier.findUnique({ where: { id }, include: SUPPLIER_INCLUDE })
    if (!row) throw new HttpError(404, 'Supplier not found')
    const scorecard = await computeSupplierScorecard(db, id)
    return NextResponse.json({ supplier: toSupplierDTO(row, scorecard) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * DELETE /api/suppliers/[id] (perm 'configure') → {ok:true}.
 * Guarded for audit integrity: linked products block with a 409 (remove the
 * links first), and any receipt history blocks with a 409 (supplier names are
 * referenced by immutable inbound records).
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    await requirePermission('configure')
    const id = numericParam((await ctx.params).id)

    const supplier = await db.supplier.findUnique({
      where: { id },
      select: { id: true, _count: { select: { products: true, receipts: true } } },
    })
    if (!supplier) throw new HttpError(404, 'Supplier not found')

    if (supplier._count.products > 0) {
      throw new HttpError(409, `Supplier is linked to ${supplier._count.products} product(s) — remove the links first`)
    }
    if (supplier._count.receipts > 0) {
      throw new HttpError(409, 'Supplier has receipt history and cannot be deleted')
    }

    await db.supplier.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ---------- local validators (mirror the collection route) ----------

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
