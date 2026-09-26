import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getMovers, getQuote } from '@/lib/market/engine'
import { STOCKS } from '@/lib/market/universe'
import { computePortfolio } from '@/lib/portfolio'
import { llmComplete, type HistoryMessage } from '@/app/api/_lib/llm'
import type { ChatMessageDTO } from '@/lib/types'
import type { ChatMessage } from '@prisma/client'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT =
  'You are StockSense AI Analyst, a helpful market assistant for the StockSense platform. ' +
  'Data provided is SIMULATED market data. Be concise (under 200 words), use markdown formatting, ' +
  'reference the provided live context when relevant. Never guarantee returns; include a light ' +
  'disclaimer when giving anything resembling advice.'

const MAX_MESSAGE_CHARS = 4000

function toDTO(row: ChatMessage): ChatMessageDTO {
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Find universe stocks mentioned in the user message (symbol or name match). */
function findMentionedSymbols(message: string, limit = 3): string[] {
  const found: string[] = []
  for (const def of STOCKS) {
    const symbolRe = new RegExp(`\\b${escapeRegExp(def.symbol)}\\b`, 'i')
    if (symbolRe.test(message)) {
      found.push(def.symbol)
      continue
    }
    const firstWord = def.name.split(/[\s,.&()/]+/)[0] ?? ''
    if (firstWord.length > 2) {
      const nameRe = new RegExp(`\\b${escapeRegExp(firstWord)}`, 'i')
      if (nameRe.test(message)) found.push(def.symbol)
    }
  }
  return found.slice(0, limit)
}

/** Build the live market-context block injected into the user prompt. */
async function buildContext(message: string): Promise<string> {
  const lines: string[] = [`[MARKET CONTEXT — simulated live data as of ${new Date().toISOString()}]`]

  const movers = getMovers()
  const fmt = (q: { symbol: string; name: string; price: number; changePct: number }) =>
    `${q.symbol} (${q.name}) $${q.price} ${q.changePct >= 0 ? '+' : ''}${q.changePct}%`
  lines.push(
    `Top gainers: ${movers.gainers.slice(0, 3).map(fmt).join('; ')}`,
    `Top losers: ${movers.losers.slice(0, 3).map(fmt).join('; ')}`,
  )

  const watchRows = await db.watchItem.findMany()
  if (watchRows.length > 0) {
    const watch = watchRows
      .map((w) => {
        const q = getQuote(w.symbol)
        return q ? `${q.symbol} $${q.price} (${q.changePct >= 0 ? '+' : ''}${q.changePct}%)` : w.symbol
      })
      .join(', ')
    lines.push(`User watchlist: ${watch}`)
  }

  const portfolio = await computePortfolio()
  if (portfolio.holdings.length > 0) {
    const holdings = portfolio.holdings
      .map(
        (h) =>
          `${h.symbol} ${h.quantity} sh @ $${h.avgCost} avg (now $${h.quote.price}, ${h.pnlPct >= 0 ? '+' : ''}${h.pnlPct}%)`,
      )
      .join('; ')
    lines.push(
      `User portfolio: total value $${portfolio.summary.totalValue}, cash $${portfolio.summary.cash.toFixed(2)}, holdings: ${holdings}`,
    )
  } else {
    lines.push(
      `User portfolio: no open positions, cash $${portfolio.summary.cash.toFixed(2)} of $100,000 seed`,
    )
  }

  const mentioned = findMentionedSymbols(message)
  for (const symbol of mentioned) {
    const q = getQuote(symbol)
    if (!q) continue
    lines.push(
      `Mentioned stock ${q.symbol} (${q.name}, ${q.sector}): price $${q.price} (${q.changePct >= 0 ? '+' : ''}${q.changePct}% today), ` +
        `P/E ${q.peRatio}, EPS $${q.eps}, div yield ${q.dividendYield}%, beta ${q.beta}, market cap $${q.marketCap}B, ` +
        `52W range $${q.week52Low}–$${q.week52High}`,
    )
  }

  return lines.join('\n')
}

/** POST /api/chat body { sessionId, message } → { reply } */
export async function POST(request: Request) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { sessionId: sessionIdRaw, message } = (body ?? {}) as Record<string, unknown>

    if (typeof sessionIdRaw !== 'string' || sessionIdRaw.trim().length === 0) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }
    if (typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }
    const sessionId = sessionIdRaw.trim()
    const userMessage = message.slice(0, MAX_MESSAGE_CHARS)

    // Last 10 messages of the session as conversation history (prior turns).
    const historyRows = await db.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    const history: HistoryMessage[] = historyRows
      .reverse()
      .map((r) => ({ role: r.role === 'assistant' ? 'assistant' : 'user', content: r.content }))

    // Persist the user message.
    await db.chatMessage.create({ data: { sessionId, role: 'user', content: userMessage } })

    const context = await buildContext(userMessage)
    const userPrompt = `${context}\n\nUSER QUESTION: ${userMessage}`

    let reply: string
    try {
      reply = await llmComplete(SYSTEM_PROMPT, userPrompt, history)
    } catch (llmErr) {
      console.error('chat LLM call failed:', llmErr)
      return NextResponse.json(
        { error: 'The AI analyst is taking a breather — please try again in a moment.' },
        { status: 503 },
      )
    }
    if (!reply.trim()) {
      return NextResponse.json(
        { error: 'The AI analyst is taking a breather — please try again in a moment.' },
        { status: 503 },
      )
    }

    await db.chatMessage.create({ data: { sessionId, role: 'assistant', content: reply } })
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('POST /api/chat failed:', err)
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 })
  }
}

/** GET /api/chat?sessionId= → { messages: ChatMessageDTO[] } (last 50 asc) */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = (searchParams.get('sessionId') ?? '').trim()

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    const rows = await db.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const messages = rows.reverse().map(toDTO)

    return NextResponse.json({ messages })
  } catch (err) {
    console.error('GET /api/chat failed:', err)
    return NextResponse.json({ error: 'Failed to load chat history' }, { status: 500 })
  }
}
