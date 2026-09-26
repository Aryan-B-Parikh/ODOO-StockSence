import { NextResponse } from 'next/server'
import { requirePermission, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { PRODUCT_INCLUDE, toProductDTO } from '@/lib/mappers'
import { numericParam, readJson, toNum } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/products/[id] → {product: ProductDTO} (404 unknown). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireUser()
    const id = numericParam((await ctx.params).id)
    const row = await db.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE })
    if (!row) throw new HttpError(404, 'Product not found')
    return NextResponse.json({ product: toProductDTO(row) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

interface PatchProductBody {
  sku?: unknown
  name?: unknown
  category?: unknown
  unit?: unknown
  unitCost?: unknown
  reorderPoint?: unknown
  dailyUsage?: unknown
  safetyStock?: unknown
  valueClass?: unknown
  notes?: unknown
  active?: unknown
  supplierIds?: unknown
}

/** PATCH /api/products/[id] (perm 'configure') → {product: ProductDTO}. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requirePermission('configure')
    const id = numericParam((await ctx.params).id)
    const body = await readJson<PatchProductBody>(req)

    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Product not found')

    const data: Record<string, unknown> = {}
    if (body.sku !== undefined) {
      const sku = typeof body.sku === 'string' ? body.sku.trim() : ''
      if (!sku) throw new HttpError(400, 'SKU cannot be empty')
      const dupe = await db.product.findFirst({ where: { sku, NOT: { id } } })
      if (dupe) throw new HttpError(400, `SKU "${sku}" already exists`)
      data.sku = sku
    }
    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) throw new HttpError(400, 'Name cannot be empty')
      data.name = name
    }
    if (body.category !== undefined) data.category = String(body.category).trim()
    if (body.unit !== undefined) data.unit = String(body.unit).trim()
    for (const f of ['unitCost', 'reorderPoint', 'dailyUsage', 'safetyStock'] as const) {
      if (body[f] !== undefined) {
        const n = toNum(body[f], f)
        if (n < 0) throw new HttpError(400, `${f} must be a non-negative number`)
        data[f] = n
      }
    }
    if (body.valueClass !== undefined) {
      const vc = String(body.valueClass).toUpperCase()
      if (!['HIGH', 'MEDIUM', 'LOW'].includes(vc)) throw new HttpError(400, 'valueClass must be HIGH, MEDIUM or LOW')
      data.valueClass = vc
    }
    if (body.notes !== undefined) data.notes = body.notes === null ? null : String(body.notes)
    if (body.active !== undefined) data.active = Boolean(body.active)

    let supplierIds: number[] | null = null
    if (Array.isArray(body.supplierIds)) {
      supplierIds = [...new Set(body.supplierIds.map((sid) => toNum(sid, 'supplierIds[]')))]
      if (supplierIds.length > 0) {
        const found = await db.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true } })
        if (found.length !== supplierIds.length) throw new HttpError(400, 'One or more supplierIds are unknown')
      }
    }

    await db.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) await tx.product.update({ where: { id }, data })
      if (supplierIds !== null) {
        await tx.productSupplier.deleteMany({ where: { productId: id } })
        if (supplierIds.length > 0) {
          await tx.productSupplier.createMany({
            data: supplierIds.map((supplierId, i) => ({
              productId: id,
              supplierId,
              preferred: i === 0,
              costPrice: 0,
              minOrderQty: 0,
              orderMultiple: 1,
            })),
          })
        }
      }
    })

    const row = await db.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE })
    return NextResponse.json({ product: toProductDTO(row) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
