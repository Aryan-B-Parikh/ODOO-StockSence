import { NextResponse } from 'next/server'
import { requirePermission, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { PRODUCT_INCLUDE, toProductDTO } from '@/lib/mappers'
import type { ProductDTO, ProductListDTO } from '@/lib/types'
import { readJson, toNum } from '@/app/api/_lib/route-helpers'

export const dynamic = 'force-dynamic'

const SORTABLE = new Set([
  'sku', 'name', 'category', 'unit', 'unitCost', 'reorderPoint', 'dailyUsage', 'safetyStock',
  'valueClass', 'onHand', 'reserved', 'available', 'incoming', 'inTransit', 'damaged', 'stockValue',
])

/** GET /api/products ?search=&category=&belowReorder=1&stockout=1&sort=&order= → ProductListDTO. */
export async function GET(req: Request) {
  try {
    await requireUser()
    const sp = new URL(req.url).searchParams
    const search = sp.get('search')?.trim().toLowerCase() ?? ''
    const category = sp.get('category')?.trim() ?? ''
    const belowOnly = sp.get('belowReorder') === '1'
    const stockoutOnly = sp.get('stockout') === '1'
    const sort = sp.get('sort')?.trim() || 'sku'
    const order = sp.get('order')?.trim().toLowerCase() === 'desc' ? 'desc' : 'asc'

    const rows = await db.product.findMany({ where: { active: true }, include: PRODUCT_INCLUDE })
    const all = rows.map(toProductDTO)

    // Summary + categories describe the full catalogue (not the filtered subset).
    const summary: ProductListDTO['summary'] = {
      totalSkus: all.length,
      totalStockValue: all.reduce((a, p) => a + p.stockValue, 0),
      belowReorder: all.filter((p) => p.belowReorder).length,
      stockoutRisk: all.filter((p) => p.stockoutRisk).length,
    }
    const categories = [...new Set(all.map((p) => p.category))].sort()

    let products = all
    if (search) products = products.filter((p) => p.sku.toLowerCase().includes(search) || p.name.toLowerCase().includes(search))
    if (category) products = products.filter((p) => p.category === category)
    if (belowOnly) products = products.filter((p) => p.belowReorder)
    if (stockoutOnly) products = products.filter((p) => p.stockoutRisk)

    const key = (SORTABLE.has(sort) ? sort : 'sku') as keyof ProductDTO
    products = products.slice().sort((a, b) => {
      const va = a[key]
      const vb = b[key]
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return order === 'desc' ? -cmp : cmp
    })

    return NextResponse.json({ products, categories, summary })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

interface CreateProductBody {
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
  supplierIds?: unknown
}

/** POST /api/products (perm 'configure') → {product: ProductDTO}. */
export async function POST(req: Request) {
  try {
    await requirePermission('configure')
    const body = await readJson<CreateProductBody>(req)

    const sku = typeof body.sku === 'string' ? body.sku.trim() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const category = typeof body.category === 'string' ? body.category.trim() : ''
    const unit = typeof body.unit === 'string' ? body.unit.trim() : ''
    if (!sku) throw new HttpError(400, 'SKU is required')
    if (!name) throw new HttpError(400, 'Name is required')
    if (!category) throw new HttpError(400, 'Category is required')
    if (!unit) throw new HttpError(400, 'Unit is required')

    const numFields = ['unitCost', 'reorderPoint', 'dailyUsage', 'safetyStock'] as const
    const nums: Record<string, number> = {}
    for (const f of numFields) {
      const n = toNum(body[f], f)
      if (n < 0) throw new HttpError(400, `${f} must be a non-negative number`)
      nums[f] = n
    }
    const valueClass = typeof body.valueClass === 'string' ? body.valueClass.toUpperCase() : 'MEDIUM'
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(valueClass)) throw new HttpError(400, 'valueClass must be HIGH, MEDIUM or LOW')

    const existing = await db.product.findUnique({ where: { sku } })
    if (existing) throw new HttpError(400, `SKU "${sku}" already exists`)

    const rawSupplierIds: unknown[] = Array.isArray(body.supplierIds) ? body.supplierIds : []
    const supplierIds: number[] = [...new Set(rawSupplierIds.map((id: unknown) => toNum(id, 'supplierIds[]')))]
    if (supplierIds.length > 0) {
      const found = await db.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true } })
      if (found.length !== supplierIds.length) throw new HttpError(400, 'One or more supplierIds are unknown')
    }

    const created = await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku,
          name,
          category,
          unit,
          unitCost: nums.unitCost,
          reorderPoint: nums.reorderPoint,
          dailyUsage: nums.dailyUsage,
          safetyStock: nums.safetyStock,
          valueClass,
          notes: typeof body.notes === 'string' ? body.notes : null,
        },
      })
      if (supplierIds.length > 0) {
        await tx.productSupplier.createMany({
          data: supplierIds.map((supplierId, i) => ({
            productId: product.id,
            supplierId,
            preferred: i === 0,
            costPrice: 0,
            minOrderQty: 0,
            orderMultiple: 1,
          })),
        })
      }
      return product
    })

    const row = await db.product.findUnique({ where: { id: created.id }, include: PRODUCT_INCLUDE })
    if (!row) throw new HttpError(404, 'Product not found')
    return NextResponse.json({ product: toProductDTO(row) })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
