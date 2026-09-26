import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { llmComplete, safeJsonParse } from '@/app/api/_lib/llm'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT =
  'You are a financial news analyst. Given a headline and summary, produce: ' +
  '(1) a 2-3 sentence crisp AI summary, (2) sentiment score between -1 and 1, ' +
  '(3) impact for the stock (HIGH/MEDIUM/LOW). ' +
  'Reply with STRICT JSON {"summary":string,"sentiment":number,"impact":string}'

interface AiSummaryResult {
  summary: string
  sentiment: number
  impact: string
}

function parseResult(raw: string, fallbackSummary: string, fallbackSentiment: number, fallbackImpact: string): AiSummaryResult {
  const parsed = safeJsonParse<Partial<AiSummaryResult>>(raw)
  if (!parsed || typeof parsed.summary !== 'string' || parsed.summary.length === 0) {
    return { summary: fallbackSummary, sentiment: fallbackSentiment, impact: fallbackImpact }
  }
  const sentiment = typeof parsed.sentiment === 'number' ? Math.max(-1, Math.min(1, parsed.sentiment)) : fallbackSentiment
  const impact =
    typeof parsed.impact === 'string' && ['HIGH', 'MEDIUM', 'LOW'].includes(parsed.impact.toUpperCase())
      ? parsed.impact.toUpperCase()
      : fallbackImpact
  return { summary: parsed.summary, sentiment, impact }
}

/** POST /api/news/[id]/ai-summary → { summary, sentiment, impact } (LLM, cached in DB) */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params
    const id = Number.parseInt(rawId, 10)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid news id' }, { status: 400 })
    }

    const item = await db.newsItem.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: `News item ${id} not found` }, { status: 404 })
    }

    // Cached from a previous successful LLM run.
    if (item.aiSummary) {
      return NextResponse.json({
        summary: item.aiSummary,
        sentiment: item.sentiment,
        impact: item.impact,
        cached: true,
      })
    }

    const userPrompt = [
      `Headline: ${item.headline}`,
      item.symbol ? `Stock: ${item.symbol}` : 'Scope: macro markets (no specific stock)',
      `Summary: ${item.summary}`,
    ].join('\n')

    try {
      const reply = await llmComplete(SYSTEM_PROMPT, userPrompt)
      const result = parseResult(reply, item.summary, item.sentiment, item.impact)

      // Cache the summary text on the news item.
      await db.newsItem.update({ where: { id }, data: { aiSummary: result.summary } })

      return NextResponse.json(result)
    } catch (llmErr) {
      console.error('ai-summary LLM call failed:', llmErr)
      // Local fallback — still a 200 so the UI can render something useful.
      return NextResponse.json({
        summary: item.summary,
        sentiment: item.sentiment,
        impact: item.impact,
        fallback: true,
      })
    }
  } catch (err) {
    console.error('POST /api/news/[id]/ai-summary failed:', err)
    return NextResponse.json({ error: 'Failed to generate AI summary' }, { status: 500 })
  }
}

/** GET /api/news/[id]/ai-summary → cached summary (no LLM call). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params
    const id = Number.parseInt(rawId, 10)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid news id' }, { status: 400 })
    }

    const item = await db.newsItem.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: `News item ${id} not found` }, { status: 404 })
    }

    if (!item.aiSummary) {
      return NextResponse.json({ summary: null, sentiment: null, impact: null })
    }
    return NextResponse.json({
      summary: item.aiSummary,
      sentiment: item.sentiment,
      impact: item.impact,
      cached: true,
    })
  } catch (err) {
    console.error('GET /api/news/[id]/ai-summary failed:', err)
    return NextResponse.json({ error: 'Failed to load AI summary' }, { status: 500 })
  }
}
