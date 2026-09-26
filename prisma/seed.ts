/**
 * StockSense — Seed script
 * Populates: Stock profiles + News for today/yesterday + demo portfolio &
 * watchlist so the app feels alive on first launch.
 *
 * Run: bun prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client'
import { getAllProfiles, getQuote } from '../src/lib/market/engine'
import { generateRecentNews } from '../src/lib/market/news'

const db = new PrismaClient()

async function seedStocks() {
  const profiles = getAllProfiles()
  for (const p of profiles) {
    await db.stock.upsert({
      where: { symbol: p.symbol },
      update: {},
      create: {
        symbol: p.symbol,
        name: p.name,
        sector: p.sector,
        exchange: p.exchange,
        description: p.description,
        ceo: p.ceo,
        hq: p.hq,
        employees: p.employees,
        website: p.website,
        founded: p.founded,
      },
    })
  }
  console.log(`✔ Seeded ${profiles.length} stock profiles`)
}

async function seedNews() {
  const now = new Date()
  const items = generateRecentNews().filter((n) => n.publishedAt <= now)
  let count = 0
  for (const n of items) {
    await db.newsItem.upsert({
      where: { dateKey_slot: { dateKey: n.dateKey, slot: n.slot } },
      update: {},
      create: {
        dateKey: n.dateKey,
        slot: n.slot,
        symbol: n.symbol,
        headline: n.headline,
        summary: n.summary,
        source: n.source,
        sentiment: n.sentiment,
        sentimentLabel: n.sentimentLabel,
        impact: n.impact,
        publishedAt: n.publishedAt,
      },
    })
    count++
  }
  console.log(`✔ Seeded ${count} news items`)
}

async function seedWatchlist() {
  const symbols = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN']
  for (const s of symbols) {
    const exists = await db.watchItem.findUnique({ where: { symbol: s } })
    if (!exists) {
      await db.watchItem.create({
        data: {
          symbol: s,
          note: null,
          alertAbove: null,
          alertBelow: null,
        },
      })
    }
  }
  console.log(`✔ Seeded watchlist (${symbols.join(', ')})`)
}

async function seedPortfolio() {
  const existing = await db.transaction.count()
  if (existing > 0) {
    console.log(`ℹ Portfolio already has ${existing} transactions — skipping`)
    return
  }
  // Demo trades executed ~3 weeks ago at prices near the then-simulated level.
  const trades: { symbol: string; side: 'BUY' | 'SELL'; quantity: number; dayOffset: number }[] = [
    { symbol: 'AAPL', side: 'BUY', quantity: 40, dayOffset: 21 },
    { symbol: 'MSFT', side: 'BUY', quantity: 25, dayOffset: 21 },
    { symbol: 'NVDA', side: 'BUY', quantity: 80, dayOffset: 14 },
    { symbol: 'GOOGL', side: 'BUY', quantity: 30, dayOffset: 14 },
    { symbol: 'JPM', side: 'BUY', quantity: 45, dayOffset: 10 },
    { symbol: 'KO', side: 'BUY', quantity: 60, dayOffset: 10 },
    { symbol: 'TSLA', side: 'BUY', quantity: 30, dayOffset: 7 },
    { symbol: 'NVDA', side: 'SELL', quantity: 20, dayOffset: 3 },
  ]
  for (const t of trades) {
    const executedAt = new Date(Date.now() - t.dayOffset * 24 * 3600 * 1000 - 3 * 3600 * 1000)
    // Approximate historical price via the deterministic engine (close of that day).
    const histDate = executedAt.toISOString().slice(0, 10)
    const { getCloseOn } = await import('../src/lib/market/engine')
    const price = getCloseOn(t.symbol, histDate)
    await db.transaction.create({
      data: {
        symbol: t.symbol,
        side: t.side,
        quantity: t.quantity,
        price: Math.round(price * 100) / 100,
        fee: 0.99,
        note: 'Demo trade',
        executedAt,
      },
    })
  }
  console.log(`✔ Seeded ${trades.length} demo transactions`)
  void getQuote
}

async function main() {
  console.log('🌱 Seeding StockSense database…')
  await seedStocks()
  await seedNews()
  await seedWatchlist()
  await seedPortfolio()
  console.log('✅ Seed complete')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
