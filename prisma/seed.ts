/**
 * StockSense — seed: a full month of realistic warehouse history.
 *
 * The seed executes REAL operations through the inventory engine in strict
 * chronological order (openings → receipts → deliveries → transfers →
 * adjustments → counts), so every on-screen quantity reconciles exactly
 * against the Move History ledger. Timestamps are then backdated so the
 * story reads naturally.
 *
 * Run: bun prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'
import * as engine from '../src/lib/inventory'
import { PERMISSION_ACTIONS } from '../src/lib/permissions'

const db = new PrismaClient()

function hash(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

const daysAgo = (n: number, hour = 9) => {
  const d = new Date(Date.now() - n * 86400000)
  d.setUTCHours(hour, 15, 0, 0)
  return d
}
const inDays = (n: number) => daysAgo(-n)

async function backdate(kind: 'receipt' | 'delivery' | 'transfer' | 'adjustment' | 'count', code: string, at: Date, extra: Record<string, Date | null> = {}) {
  const where = { code }
  if (kind === 'receipt') await db.receipt.update({ where, data: { createdAt: at, ...extra } as never })
  else if (kind === 'delivery') await db.deliveryOrder.update({ where, data: { createdAt: at, ...extra } as never })
  else if (kind === 'transfer') await db.transfer.update({ where, data: { shippedAt: at, ...extra } as never })
  else if (kind === 'adjustment') await db.adjustment.update({ where, data: { createdAt: at, postedAt: at, ...extra } as never })
  else await db.cycleCount.update({ where, data: { ...extra } as never })
  await db.ledgerEntry.updateMany({ where: { docCode: code }, data: { createdAt: at } })
  await db.exceptionFlag.updateMany({ where: { refCode: code }, data: { createdAt: at } })
}

async function main() {
  console.log('— wiping…')
  for (const t of [
    'exceptionFlag', 'reorderSuggestion', 'cycleCountLine', 'cycleCount', 'adjustmentLine', 'adjustment',
    'transferLine', 'transfer', 'deliveryLine', 'deliveryOrder', 'receiptLine', 'receipt',
    'ledgerEntry', 'stockLevel', 'productSupplier', 'session', 'product', 'supplier', 'location', 'rack', 'zone', 'warehouse', 'user',
  ]) {
    await (db as never as Record<string, { deleteMany: () => Promise<unknown> }>)[t].deleteMany()
  }

  // ------------------------------------------------------------------ users
  console.log('— users…')
  const [owner, mia, dev, sam] = await Promise.all([
    db.user.create({ data: { email: 'owner@stocksense.app', name: 'Owner (Executive)', passwordHash: hash('Owner123!'), role: 'ADMINISTRATOR', permissions: JSON.stringify([...PERMISSION_ACTIONS]) } }),
    db.user.create({ data: { email: 'manager@stocksense.app', name: 'Mia Torres', passwordHash: hash('Manager123!'), role: 'INVENTORY_MANAGER', permissions: JSON.stringify([...PERMISSION_ACTIONS]) } }),
    db.user.create({ data: { email: 'staff@stocksense.app', name: 'Dev Patel', passwordHash: hash('Staff123!'), role: 'WAREHOUSE_STAFF', permissions: JSON.stringify(['receive', 'pick', 'pack', 'transfer', 'count', 'adjust']) } }),
    db.user.create({ data: { email: 'sam@stocksense.app', name: 'Sam Reyes', passwordHash: hash('Staff123!'), role: 'WAREHOUSE_STAFF', permissions: JSON.stringify(['receive', 'pick', 'pack', 'transfer', 'count', 'adjust']) } }),
  ])
  void owner
  void mia

  // -------------------------------------------------------- location tree
  console.log('— locations…')
  const wh = await db.warehouse.create({ data: { code: 'WH1', name: 'Riverside Distribution Center', address: '4180 Dock Rd, Riverside' } })
  const mkZone = async (code: string, name: string) => db.zone.create({ data: { warehouseId: wh.id, code, name } })
  const zoneA = await mkZone('A', 'Zone A · Bulk Storage')
  const zoneB = await mkZone('B', 'Zone B · Pick Faces')
  const zoneC = await mkZone('C', 'Zone C · Cold & Chemicals')

  const mkRack = (zoneId: number, code: string) => db.rack.create({ data: { zoneId, code, name: `Rack ${code}` } })
  const racks = {
    A1: await mkRack(zoneA.id, 'A1'), A2: await mkRack(zoneA.id, 'A2'), A3: await mkRack(zoneA.id, 'A3'),
    B1: await mkRack(zoneB.id, 'B1'), B2: await mkRack(zoneB.id, 'B2'),
    C1: await mkRack(zoneC.id, 'C1'),
  }

  const locIds: Record<string, number> = {}
  const mkLoc = async (rackCode: string, code: string) => {
    const rack = racks[rackCode as keyof typeof racks]
    const zoneName = rackCode.startsWith('A') ? 'Zone A' : rackCode.startsWith('B') ? 'Zone B' : 'Zone C'
    const l = await db.location.create({ data: { rackId: rack.id, code, fullPath: `WH1 · ${zoneName} · Rack ${rackCode} · Shelf ${code}` } })
    locIds[`${rackCode}-${code}`] = l.id
  }
  for (const s of ['S1', 'S2', 'S3']) await mkLoc('A1', s)
  for (const s of ['S1', 'S2', 'S3']) await mkLoc('A2', s)
  for (const s of ['S1', 'S2', 'S3']) await mkLoc('A3', s)
  for (const s of ['S1', 'S2', 'S3']) await mkLoc('B1', s)
  for (const s of ['S1', 'S2']) await mkLoc('B2', s)
  for (const s of ['S1', 'S2']) await mkLoc('C1', s)

  // -------------------------------------------------------------- suppliers
  console.log('— suppliers…')
  const sup = {
    steel: await db.supplier.create({ data: { name: 'Metro Steel Co.', contact: 'orders@metrosteel.example', leadTimeDays: 5, reliability: 0.92, damageRate: 0.015 } }),
    poly: await db.supplier.create({ data: { name: 'Northplast Polymers', contact: 'sales@northplast.example', leadTimeDays: 7, reliability: 0.95, damageRate: 0.01 } }),
    circuit: await db.supplier.create({ data: { name: 'CircuitHub Electronics', contact: 'po@circuithub.example', leadTimeDays: 10, reliability: 0.88, damageRate: 0.03 } }),
    pack: await db.supplier.create({ data: { name: 'BlueRidge Packaging', contact: 'hello@blueridge.example', leadTimeDays: 4, reliability: 0.97, damageRate: 0.008 } }),
    iron: await db.supplier.create({ data: { name: 'Ironclad Fasteners', contact: 'supply@ironclad.example', leadTimeDays: 3, reliability: 0.96, damageRate: 0.01 } }),
    lumen: await db.supplier.create({ data: { name: 'Lumen LED Supply', contact: 'asia@lumensupply.example', leadTimeDays: 12, reliability: 0.9, damageRate: 0.02 } }),
  }

  // --------------------------------------------------------------- products
  console.log('— products…')
  interface PDef { sku: string; name: string; category: string; unit: string; unitCost: number; reorderPoint: number; dailyUsage: number; safetyStock: number; valueClass: string; notes?: string; links: { s: keyof typeof sup; preferred?: boolean; costPrice: number; minOrderQty?: number; orderMultiple?: number }[] }
  const defs: PDef[] = [
    { sku: 'RM-STL-ROD10', name: 'Steel Rod 10mm', category: 'Raw Materials', unit: 'kg', unitCost: 2.4, reorderPoint: 75, dailyUsage: 12, safetyStock: 15, valueClass: 'HIGH', links: [{ s: 'steel', preferred: true, costPrice: 2.35, minOrderQty: 50, orderMultiple: 25 }, { s: 'iron', costPrice: 2.5, orderMultiple: 10 }] },
    { sku: 'RM-ALU-SHT2', name: 'Aluminum Sheet 2mm', category: 'Raw Materials', unit: 'kg', unitCost: 5.1, reorderPoint: 40, dailyUsage: 6, safetyStock: 8, valueClass: 'HIGH', links: [{ s: 'steel', preferred: true, costPrice: 5.0, minOrderQty: 100, orderMultiple: 50 }, { s: 'iron', costPrice: 5.3, orderMultiple: 20 }] },
    { sku: 'RM-COP-W25', name: 'Copper Wire 2.5mm', category: 'Raw Materials', unit: 'm', unitCost: 0.85, reorderPoint: 500, dailyUsage: 80, safetyStock: 100, valueClass: 'MEDIUM', links: [{ s: 'poly', preferred: true, costPrice: 0.8, minOrderQty: 500, orderMultiple: 100 }] },
    { sku: 'RM-HDP-GRN', name: 'HDPE Granules', category: 'Raw Materials', unit: 'kg', unitCost: 1.65, reorderPoint: 200, dailyUsage: 30, safetyStock: 40, valueClass: 'MEDIUM', links: [{ s: 'poly', preferred: true, costPrice: 1.6, minOrderQty: 200, orderMultiple: 50 }] },
    { sku: 'EL-DRV-60W', name: 'LED Driver 60W', category: 'Electronics', unit: 'pcs', unitCost: 8.75, reorderPoint: 60, dailyUsage: 9, safetyStock: 12, valueClass: 'HIGH', links: [{ s: 'circuit', preferred: true, costPrice: 8.2, minOrderQty: 20, orderMultiple: 10 }, { s: 'lumen', costPrice: 8.6, orderMultiple: 5 }] },
    { sku: 'EL-SEN-P100', name: 'Sensor Module P100', category: 'Electronics', unit: 'pcs', unitCost: 21.5, reorderPoint: 30, dailyUsage: 4, safetyStock: 6, valueClass: 'HIGH', links: [{ s: 'circuit', preferred: true, costPrice: 20.8, minOrderQty: 10, orderMultiple: 10 }] },
    { sku: 'EL-CTL-CX2', name: 'Controller Board CX2', category: 'Electronics', unit: 'pcs', unitCost: 47.0, reorderPoint: 15, dailyUsage: 2, safetyStock: 3, valueClass: 'HIGH', notes: 'Long-lead item — sole-sourced from CircuitHub.', links: [{ s: 'circuit', preferred: true, costPrice: 45.5, minOrderQty: 5, orderMultiple: 5 }] },
    { sku: 'EL-LST-5M', name: 'LED Strip 5m', category: 'Electronics', unit: 'roll', unitCost: 6.3, reorderPoint: 80, dailyUsage: 14, safetyStock: 20, valueClass: 'LOW', links: [{ s: 'lumen', preferred: true, costPrice: 5.9, minOrderQty: 20, orderMultiple: 10 }] },
    { sku: 'PK-CRT-4030', name: 'Carton Box 40×30', category: 'Packaging', unit: 'pcs', unitCost: 0.62, reorderPoint: 800, dailyUsage: 150, safetyStock: 200, valueClass: 'LOW', links: [{ s: 'pack', preferred: true, costPrice: 0.58, minOrderQty: 500, orderMultiple: 100 }] },
    { sku: 'PK-WRP-500', name: 'Stretch Wrap 500mm', category: 'Packaging', unit: 'roll', unitCost: 4.15, reorderPoint: 40, dailyUsage: 7, safetyStock: 10, valueClass: 'LOW', links: [{ s: 'pack', preferred: true, costPrice: 3.95, minOrderQty: 10, orderMultiple: 5 }] },
    { sku: 'PK-FOM-SHT', name: 'Packing Foam Sheet', category: 'Packaging', unit: 'pcs', unitCost: 0.95, reorderPoint: 300, dailyUsage: 55, safetyStock: 70, valueClass: 'LOW', links: [{ s: 'pack', preferred: true, costPrice: 0.9, minOrderQty: 100, orderMultiple: 50 }] },
    { sku: 'FS-BLT-M1050', name: 'Hex Bolt M10×50', category: 'Fasteners', unit: 'pcs', unitCost: 0.18, reorderPoint: 1500, dailyUsage: 260, safetyStock: 350, valueClass: 'MEDIUM', links: [{ s: 'iron', preferred: true, costPrice: 0.16, minOrderQty: 500, orderMultiple: 100 }] },
    { sku: 'FS-WSH-M10', name: 'Washer M10', category: 'Fasteners', unit: 'pcs', unitCost: 0.04, reorderPoint: 4000, dailyUsage: 700, safetyStock: 900, valueClass: 'LOW', links: [{ s: 'iron', preferred: true, costPrice: 0.035, minOrderQty: 1000, orderMultiple: 500 }] },
    { sku: 'FS-ANC-M12', name: 'Anchor Bolt M12', category: 'Fasteners', unit: 'pcs', unitCost: 0.42, reorderPoint: 600, dailyUsage: 90, safetyStock: 120, valueClass: 'MEDIUM', links: [{ s: 'iron', preferred: true, costPrice: 0.38, minOrderQty: 200, orderMultiple: 50 }, { s: 'steel', costPrice: 0.42, orderMultiple: 25 }] },
    { sku: 'CN-LUB-20L', name: 'Lubricant Oil 20L', category: 'Consumables', unit: 'L', unitCost: 3.2, reorderPoint: 120, dailyUsage: 18, safetyStock: 25, valueClass: 'MEDIUM', links: [{ s: 'poly', preferred: true, costPrice: 3.05, minOrderQty: 20, orderMultiple: 10 }] },
    { sku: 'CN-GLV-NIT', name: 'Nitrile Gloves', category: 'Consumables', unit: 'pair', unitCost: 0.55, reorderPoint: 400, dailyUsage: 95, safetyStock: 120, valueClass: 'LOW', links: [{ s: 'pack', preferred: true, costPrice: 0.5, minOrderQty: 100, orderMultiple: 50 }] },
    { sku: 'CN-GOG-SFT', name: 'Safety Goggles', category: 'Consumables', unit: 'pcs', unitCost: 2.1, reorderPoint: 80, dailyUsage: 12, safetyStock: 15, valueClass: 'LOW', links: [{ s: 'pack', preferred: true, costPrice: 1.9, minOrderQty: 20, orderMultiple: 10 }] },
    { sku: 'CH-NAOH-FLK', name: 'Sodium Hydroxide Flakes', category: 'Chemicals', unit: 'kg', unitCost: 1.95, reorderPoint: 90, dailyUsage: 13, safetyStock: 18, valueClass: 'MEDIUM', notes: 'Corrosive — Zone C only.', links: [{ s: 'poly', preferred: true, costPrice: 1.85, minOrderQty: 50, orderMultiple: 25 }] },
    { sku: 'CH-ACE-200', name: 'Acetone 200L Drum', category: 'Chemicals', unit: 'L', unitCost: 2.8, reorderPoint: 100, dailyUsage: 15, safetyStock: 20, valueClass: 'MEDIUM', notes: 'Flammable — Zone C only.', links: [{ s: 'poly', preferred: true, costPrice: 2.7, minOrderQty: 20, orderMultiple: 20 }] },
  ]
  const P: Record<string, { id: number; sku: string; unit: string }> = {}
  for (const d of defs) {
    const p = await db.product.create({ data: { sku: d.sku, name: d.name, category: d.category, unit: d.unit, unitCost: d.unitCost, reorderPoint: d.reorderPoint, dailyUsage: d.dailyUsage, safetyStock: d.safetyStock, valueClass: d.valueClass, notes: d.notes ?? null } })
    P[d.sku] = p
    for (const l of d.links) {
      await db.productSupplier.create({
        data: { productId: p.id, supplierId: sup[l.s].id, preferred: l.preferred ?? false, costPrice: l.costPrice, minOrderQty: l.minOrderQty ?? 0, orderMultiple: l.orderMultiple ?? 1 },
      })
    }
  }

  const L = (k: string) => locIds[k]
  const pid = (sku: string) => P[sku].id

  // ---------------------------------------------------------------- OPENINGS (t-20d)
  console.log('— opening stock…')
  const t20 = daysAgo(20, 8)
  const openings: [string, string, number, number?][] = [
    ['RM-STL-ROD10', 'A1-S1', 65], ['RM-STL-ROD10', 'A2-S2', 39.5],
    ['RM-ALU-SHT2', 'A3-S1', 20], ['RM-ALU-SHT2', 'A3-S2', 70],
    ['RM-COP-W25', 'A2-S3', 900],
    ['RM-HDP-GRN', 'A3-S1', 290],
    ['EL-DRV-60W', 'B1-S1', 40], ['EL-DRV-60W', 'B1-S3', 45],
    ['EL-SEN-P100', 'B1-S2', 32],
    ['EL-CTL-CX2', 'B1-S2', 2],
    ['EL-LST-5M', 'B2-S1', 220],
    ['PK-CRT-4030', 'B2-S2', 1250],
    ['PK-WRP-500', 'B2-S2', 65],
    ['PK-FOM-SHT', 'B2-S2', 420],
    ['FS-BLT-M1050', 'A1-S2', 1840], ['FS-BLT-M1050', 'A1-S3', 350],
    ['FS-WSH-M10', 'A1-S2', 5350],
    ['FS-ANC-M12', 'A1-S3', 980],
    ['CN-LUB-20L', 'C1-S1', 235],
    ['CN-GLV-NIT', 'B2-S1', 750],
    ['CN-GOG-SFT', 'B2-S1', 130],
    ['CH-NAOH-FLK', 'C1-S2', 140],
    ['CH-ACE-200', 'C1-S2', 160, 5],
  ]
  for (const [sku, loc, qty, damaged] of openings) {
    await engine.bumpStock(db, pid(sku), L(loc), { onHand: qty, ...(damaged ? { damaged } : {}) }, {
      docType: 'OPENING', docCode: 'OPENING', reason: 'Opening inventory load', performedBy: dev.id, at: t20,
    })
  }

  // --------------------------------------------- chronological history (engine ops)
  console.log('— history: ops…')

  // t-18d: Dev posts 1st moderate Steel variance (MEDIUM + flag)
  let r = await engine.createAdjustment(db, { reason: 'Quarter count variance — damaged rods set aside', lines: [{ productId: pid('RM-STL-ROD10'), locationId: L('A2-S2'), countedQty: 37.5 }] }, dev.id)
  await backdate('adjustment', r.adjustment.code, daysAgo(18))

  // t-15d: Dev small LED strip variance (LOW)
  r = await engine.createAdjustment(db, { reason: 'Bin tidy-up — offcut removed', lines: [{ productId: pid('EL-LST-5M'), locationId: L('B2-S1'), countedQty: 219 }] }, dev.id)
  await backdate('adjustment', r.adjustment.code, daysAgo(15))

  // t-17d receipt (Ironclad hex bolts) + t-16d delivery (Halden Works)
  let rc = await engine.createReceipt(db, { supplierId: sup.iron.id, expectedAt: daysAgo(17).toISOString(), note: 'Standing monthly fastener order', lines: [{ productId: pid('FS-BLT-M1050'), locationId: L('A1-S3'), expectedQty: 800 }] }, dev.id)
  let rl = (await db.receiptLine.findFirst({ where: { receiptId: rc.id } }))!
  await engine.receiveReceipt(db, rc.id, { lines: [{ lineId: rl.id, receivedQty: 800, damagedQty: 4 }] }, dev.id)
  await backdate('receipt', rc.code, daysAgo(17), { receivedAt: daysAgo(17, 11) })
  let dl = await engine.createDelivery(db, { customer: 'Halden Works', lines: [{ productId: pid('FS-ANC-M12'), locationId: L('A1-S3'), qty: 30 }] }, dev.id)
  await engine.markDeliveryPicked(db, dl.id, dev.id)
  await engine.markDeliveryPacked(db, dl.id, dev.id)
  await engine.markDeliveryDelivered(db, dl.id, dev.id)
  await backdate('delivery', dl.code, daysAgo(16, 10), { pickedAt: daysAgo(16, 10), packedAt: daysAgo(16, 11), deliveredAt: daysAgo(16, 14) })

  // t-13d: Metro Steel receipt (100kg, 2 damaged) + BuildCo delivery
  rc = await engine.createReceipt(db, { supplierId: sup.steel.id, expectedAt: daysAgo(13).toISOString(), lines: [{ productId: pid('RM-STL-ROD10'), locationId: L('A1-S1'), expectedQty: 100 }] }, dev.id)
  rl = (await db.receiptLine.findFirst({ where: { receiptId: rc.id } }))!
  await engine.receiveReceipt(db, rc.id, { lines: [{ lineId: rl.id, receivedQty: 100, damagedQty: 2 }] }, dev.id)
  await backdate('receipt', rc.code, daysAgo(13), { receivedAt: daysAgo(13, 10) })
  dl = await engine.createDelivery(db, { customer: 'BuildCo Ltd', note: 'Site order #7734', lines: [
    { productId: pid('RM-STL-ROD10'), locationId: L('A1-S1'), qty: 80 },
    { productId: pid('FS-ANC-M12'), locationId: L('A1-S3'), qty: 20 },
  ] }, dev.id)
  await engine.markDeliveryPicked(db, dl.id, dev.id)
  await engine.markDeliveryPacked(db, dl.id, dev.id)
  await engine.markDeliveryDelivered(db, dl.id, dev.id)
  await backdate('delivery', dl.code, daysAgo(13, 12), { pickedAt: daysAgo(12, 8), packedAt: daysAgo(12, 9), deliveredAt: daysAgo(12, 13) })

  // t-11d: Aluminum receipt
  rc = await engine.createReceipt(db, { supplierId: sup.steel.id, expectedAt: daysAgo(11).toISOString(), lines: [{ productId: pid('RM-ALU-SHT2'), locationId: L('A3-S1'), expectedQty: 65 }] }, dev.id)
  rl = (await db.receiptLine.findFirst({ where: { receiptId: rc.id } }))!
  await engine.receiveReceipt(db, rc.id, { lines: [{ lineId: rl.id, receivedQty: 65 }] }, dev.id)
  await backdate('receipt', rc.code, daysAgo(11), { receivedAt: daysAgo(11, 10) })

  // t-10d: 2nd Steel variance (MEDIUM) + Northside delivery (create t-10d, packed/delivered t-9d)
  r = await engine.createAdjustment(db, { reason: 'Re-check after rod claim — short', lines: [{ productId: pid('RM-STL-ROD10'), locationId: L('A2-S2'), countedQty: 35 }] }, dev.id)
  await backdate('adjustment', r.adjustment.code, daysAgo(10))
  dl = await engine.createDelivery(db, { customer: 'Northside Contractors', lines: [
    { productId: pid('PK-CRT-4030'), locationId: L('B2-S2'), qty: 400 },
    { productId: pid('FS-BLT-M1050'), locationId: L('A1-S3'), qty: 200 },
  ] }, dev.id)
  await engine.markDeliveryPicked(db, dl.id, dev.id)
  await engine.markDeliveryPacked(db, dl.id, dev.id)
  await engine.markDeliveryDelivered(db, dl.id, dev.id)
  await backdate('delivery', dl.code, daysAgo(10, 11), { pickedAt: daysAgo(9, 8), packedAt: daysAgo(9, 9), deliveredAt: daysAgo(9, 12) })

  // t-9d: monthly Rack B2 cycle count — clean, zero variance (no adjustment opened)
  let cnt = await engine.createCount(db, { scope: 'LOCATION', locationId: L('B2-S2'), dueDate: daysAgo(8).toISOString(), note: 'Monthly pack-face audit' }, dev.id)
  let cntLines = await db.cycleCountLine.findMany({ where: { countId: cnt.id } })
  await engine.submitCount(db, cnt.id, { lines: cntLines.map((l) => ({ lineId: l.id, countedQty: l.systemQty })) }, dev.id)
  await db.cycleCount.update({ where: { id: cnt.id }, data: { createdAt: daysAgo(9, 14), completedAt: daysAgo(8, 10) } })

  // t-7d→6d: Vector Installations delivery
  dl = await engine.createDelivery(db, { customer: 'Vector Installations', lines: [
    { productId: pid('RM-STL-ROD10'), locationId: L('A1-S1'), qty: 38 },
    { productId: pid('EL-LST-5M'), locationId: L('B2-S1'), qty: 60 },
  ] }, dev.id)
  await engine.markDeliveryPicked(db, dl.id, dev.id)
  await engine.markDeliveryPacked(db, dl.id, dev.id)
  await engine.markDeliveryDelivered(db, dl.id, dev.id)
  await backdate('delivery', dl.code, daysAgo(7, 10), { pickedAt: daysAgo(6, 8), packedAt: daysAgo(6, 9), deliveredAt: daysAgo(6, 15) })

  // t-6d: Sam small variance #1 (LOW)
  r = await engine.createAdjustment(db, { reason: 'Count check — pair missing from box', lines: [{ productId: pid('CN-GLV-NIT'), locationId: L('B2-S1'), countedQty: 749 }] }, sam.id)
  await backdate('adjustment', r.adjustment.code, daysAgo(6))

  // t-5d: internal transfer A3-S2 → B2-S2 (30kg aluminum), received same day
  let tr = await engine.createTransfer(db, { fromLocationId: L('A3-S2'), toLocationId: L('B2-S2'), note: 'Replenish pick face', lines: [{ productId: pid('RM-ALU-SHT2'), qty: 30 }] }, dev.id)
  await engine.receiveTransfer(db, tr.id, dev.id)
  await backdate('transfer', tr.code, daysAgo(5, 10), { receivedAt: daysAgo(5, 14) })

  // t-5d: Sam #2
  r = await engine.createAdjustment(db, { reason: 'Damaged sheet found', lines: [{ productId: pid('PK-FOM-SHT'), locationId: L('B2-S2'), countedQty: 419 }] }, sam.id)
  await backdate('adjustment', r.adjustment.code, daysAgo(5, 15))

  // t-4d→3d: CircuitHub LED driver receipt
  rc = await engine.createReceipt(db, { supplierId: sup.circuit.id, expectedAt: daysAgo(4).toISOString(), lines: [{ productId: pid('EL-DRV-60W'), locationId: L('B1-S1'), expectedQty: 80 }] }, dev.id)
  rl = (await db.receiptLine.findFirst({ where: { receiptId: rc.id } }))!
  await engine.receiveReceipt(db, rc.id, { lines: [{ lineId: rl.id, receivedQty: 80 }] }, dev.id)
  await backdate('receipt', rc.code, daysAgo(4), { receivedAt: daysAgo(3, 10) })

  // t-4d: Sam #3, #4
  r = await engine.createAdjustment(db, { reason: 'Scratched lens', lines: [{ productId: pid('CN-GOG-SFT'), locationId: L('B2-S1'), countedQty: 129 }] }, sam.id)
  await backdate('adjustment', r.adjustment.code, daysAgo(4, 12))
  r = await engine.createAdjustment(db, { reason: 'Roll damaged by forklift', lines: [{ productId: pid('PK-WRP-500'), locationId: L('B2-S2'), countedQty: 64 }] }, sam.id)
  await backdate('adjustment', r.adjustment.code, daysAgo(4, 16))

  // t-4d: cycle count for Rack B2 (completed t-8d… wait — chronology: created before ops at t-9d? Reorder below.)
  // t-3d: Sam #5
  r = await engine.createAdjustment(db, { reason: 'Miscount correction', lines: [{ productId: pid('FS-WSH-M10'), locationId: L('A1-S2'), countedQty: 5199 }] }, sam.id)
  await backdate('adjustment', r.adjustment.code, daysAgo(3))

  // t-2d: Sam #6
  r = await engine.createAdjustment(db, { reason: 'Bin sweep', lines: [{ productId: pid('FS-ANC-M12'), locationId: L('A1-S3'), countedQty: 949 }] }, sam.id)
  await backdate('adjustment', r.adjustment.code, daysAgo(2, 10))

  // t-2d: Dev posts the BIG one — 43% removal at Steel A2-S2 → HIGH, held for approval (+ REPEATED flag)
  r = await engine.createAdjustment(db, { reason: 'Water ingress in shelf S2 — rods suspected rusted', note: 'Full removal pending QA decision', lines: [{ productId: pid('RM-STL-ROD10'), locationId: L('A2-S2'), countedQty: 20 }] }, dev.id)
  await backdate('adjustment', r.adjustment.code, daysAgo(2, 15), { postedAt: null })

  // t-1d: Riverside Contractors (packed, not yet delivered)
  dl = await engine.createDelivery(db, { customer: 'Riverside Contractors', lines: [
    { productId: pid('CN-LUB-20L'), locationId: L('C1-S1'), qty: 25 },
    { productId: pid('FS-WSH-M10'), locationId: L('A1-S2'), qty: 150 },
  ] }, dev.id)
  await engine.markDeliveryPicked(db, dl.id, dev.id)
  await engine.markDeliveryPacked(db, dl.id, dev.id)
  await backdate('delivery', dl.code, daysAgo(1, 9), { pickedAt: daysAgo(1, 10), packedAt: daysAgo(1, 11) })

  // t-1d: HDPE transfer A3-S1 → C1-S1 still IN_TRANSIT
  tr = await engine.createTransfer(db, { fromLocationId: L('A3-S1'), toLocationId: L('C1-S1'), note: 'Cold-chain blending batch', lines: [{ productId: pid('RM-HDP-GRN'), qty: 30 }] }, dev.id)
  await backdate('transfer', tr.code, daysAgo(1, 13))

  // t-1d: Metro Fitouts — PICKED (reserved, not packed)
  dl = await engine.createDelivery(db, { customer: 'Metro Fitouts', lines: [
    { productId: pid('EL-SEN-P100'), locationId: L('B1-S2'), qty: 6 },
    { productId: pid('FS-BLT-M1050'), locationId: L('A1-S2'), qty: 40 },
  ] }, dev.id)
  await engine.markDeliveryPicked(db, dl.id, dev.id)
  await backdate('delivery', dl.code, daysAgo(1, 15), { pickedAt: daysAgo(1, 16) })

  // t-1d: Sam #7 — triggers the staff-anomaly review item
  r = await engine.createAdjustment(db, { reason: 'Second scratched lens found', lines: [{ productId: pid('CN-GOG-SFT'), locationId: L('B2-S1'), countedQty: 128 }] }, sam.id)
  await backdate('adjustment', r.adjustment.code, daysAgo(1, 17))

  // t-0d: GreenField Retail — RESERVED (fresh order, stock claimed but not picked)
  dl = await engine.createDelivery(db, { customer: 'GreenField Retail', note: 'Rush order — pick tomorrow AM', lines: [
    { productId: pid('RM-STL-ROD10'), locationId: L('A1-S1'), qty: 20 },
    { productId: pid('PK-CRT-4030'), locationId: L('B2-S2'), qty: 250 },
    { productId: pid('CN-GLV-NIT'), locationId: L('B2-S1'), qty: 100 },
  ] }, dev.id)

  // t-0d: delayed Sensor receipt (expected 4 days ago — CircuitHub late)
  rc = await engine.createReceipt(db, { supplierId: sup.circuit.id, expectedAt: daysAgo(4).toISOString(), note: 'CircuitHub running late — chased twice', lines: [{ productId: pid('EL-SEN-P100'), locationId: L('B1-S2'), expectedQty: 40 }] }, mia.id)

  // t-0d: on-time Stretch Wrap receipt due in 3 days
  rc = await engine.createReceipt(db, { supplierId: sup.pack.id, expectedAt: inDays(3).toISOString(), lines: [{ productId: pid('PK-WRP-500'), locationId: L('B2-S2'), expectedQty: 100 }] }, dev.id)

  // ------------------------------------------------------------ cycle counts
  console.log('— cycle counts…')
  // OPEN + overdue 2d: rack B1 (pick faces)
  cnt = await engine.createCount(db, { scope: 'LOCATION', locationId: L('B1-S2'), dueDate: daysAgo(2).toISOString(), note: 'Weekly high-value count — Rack B1 shelf S2' }, mia.id)
  await db.cycleCount.update({ where: { id: cnt.id }, data: { createdAt: daysAgo(4) } })

  // OPEN + due next week: Steel Rods weekly product count
  cnt = await engine.createCount(db, { scope: 'PRODUCT', productId: pid('RM-STL-ROD10'), dueDate: inDays(5).toISOString() }, mia.id)
  await db.cycleCount.update({ where: { id: cnt.id }, data: { createdAt: daysAgo(1) } })

  // ------------------------------------------------------------ reorder suggestions
  console.log('— reorder suggestions…')
  await engine.refreshSuggestions(db)

  // ------------------------------------------------------------------ verify
  console.log('— verification —')
  const needs = await engine.computeNeeds(db)
  const below = needs.filter((n) => n.belowReorder)
  const stockouts = needs.filter((n) => n.stockoutRisk)
  console.log(`below reorder: ${below.map((n) => `${n.sku} (${n.projectedAvailable}/${n.reorderPoint})`).join(', ')}`)
  console.log(`stockout risk: ${stockouts.map((n) => n.sku).join(', ') || 'none'}`)
  const suggestions = await db.reorderSuggestion.findMany({ include: { product: true } })
  console.log(`suggestions: ${suggestions.map((s) => `${s.product.sku}→${s.suggestedQty} ${s.status}`).join(' | ')}`)
  const steel = needs.find((n) => n.sku === 'RM-STL-ROD10')!
  console.log(`Steel Rods: onHand=${steel.onHand} reserved=${steel.reserved} incoming=${steel.incoming} projected=${steel.projectedAvailable}`)
  const flags = await db.exceptionFlag.count({ where: { status: 'OPEN' } })
  console.log(`open flags: ${flags}`)
  const ledgerCount = await db.ledgerEntry.count()
  const pending = await db.adjustment.count({ where: { status: 'PENDING_APPROVAL' } })
  const delayed = await db.receipt.count({ where: { status: 'EXPECTED', expectedAt: { lt: new Date() } } })
  console.log(`ledger entries: ${ledgerCount}, pending approvals: ${pending}, delayed receipts: ${delayed}`)
  console.log('✓ seed complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
