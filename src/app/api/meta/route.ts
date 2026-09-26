import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import type { MetaDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/meta → MetaDTO (warehouses, locations, suppliers, products, categories). */
export async function GET() {
  try {
    await requireUser()
    const [warehouses, locations, suppliers, products] = await Promise.all([
      db.warehouse.findMany({ orderBy: { code: 'asc' } }),
      db.location.findMany({ include: { rack: { include: { zone: { include: { warehouse: true } } } } }, orderBy: { fullPath: 'asc' } }),
      db.supplier.findMany({ orderBy: { name: 'asc' } }),
      db.product.findMany({ where: { active: true }, include: { stocks: true }, orderBy: { sku: 'asc' } }),
    ])

    const meta: MetaDTO = {
      warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
      locations: locations.map((l) => ({
        id: l.id,
        fullPath: l.fullPath,
        warehouseName: l.rack.zone.warehouse.name,
        zoneName: l.rack.zone.name,
        rackCode: l.rack.code,
        code: l.code,
      })),
      suppliers: suppliers.map((s) => ({ id: s.id, name: s.name, leadTimeDays: s.leadTimeDays })),
      products: products.map((p) => {
        const onHand = p.stocks.reduce((a, s) => a + s.onHand, 0)
        const reserved = p.stocks.reduce((a, s) => a + s.reserved, 0)
        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          category: p.category,
          onHand,
          reserved,
          available: onHand - reserved,
        }
      }),
      categories: [...new Set(products.map((p) => p.category))].sort(),
    }
    return NextResponse.json(meta)
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
