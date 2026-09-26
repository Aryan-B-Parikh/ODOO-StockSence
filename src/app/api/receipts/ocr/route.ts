import { NextResponse } from 'next/server'

import { readJson } from '@/app/api/_lib/route-helpers'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/http'
import { clampQuantity, matchProductLine, type OcrLine, type OcrLineInput } from '@/lib/ocr'
import ZAI from 'z-ai-web-dev-sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_LINES = 25

/** The VLM prompt: strict JSON, no fences, plain numbers, uppercase SKUs. */
const VLM_PROMPT = [
  'You are reading a photo of a warehouse invoice or packing slip.',
  'Extract every product line item from the document.',
  'Return ONLY a JSON array — no markdown fences, no commentary, no trailing commas — in exactly this shape:',
  '[{"sku": string, "name": string, "quantity": number}]',
  'Rules: sku is the product code as printed, UPPERCASE ("" if the line has none);',
  'name is the product name as printed ("" if unreadable);',
  'quantity is a plain number (no units, no "pcs", no thousands separators; use 1 when the line shows none).',
  'If the photo contains no readable product lines, return [].',
].join(' ')

interface OcrBody {
  imageBase64?: unknown
}

/** Strip markdown fences / stray text around a JSON array and parse it. */
function parseModelJson(content: string): { sku: string; name: string; quantity: number }[] {
  const trimmed = content.trim()
  // strip ```json … ``` fences if the model added them anyway
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
  // grab the outermost [...] — ignores any prose around it
  const start = unfenced.indexOf('[')
  const end = unfenced.lastIndexOf(']')
  const slice = start >= 0 && end > start ? unfenced.slice(start, end + 1) : '[]'
  const parsed: unknown = JSON.parse(slice)
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter(
      (l): l is Record<string, unknown> =>
        typeof l === 'object' && l !== null && typeof (l as Record<string, unknown>).quantity !== 'undefined'
    )
    .map((l) => ({
      sku: typeof l.sku === 'string' ? l.sku.trim().toUpperCase() : '',
      name: typeof l.name === 'string' ? l.name.trim() : '',
      quantity: clampQuantity(l.quantity),
    }))
    .filter((l) => l.sku !== '' || l.name !== '')
}

/**
 * POST /api/receipts/ocr (perm 'receive') { imageBase64 } →
 * { lines: [{ sku, name, quantity, matchedProductId, matchedSku, matchType }] }
 *
 * Photo/OCR pre-fill for receipts: reads an invoice photo with the VLM and
 * server-side matches each extracted line against the product catalogue.
 * Never mutates anything — the client shows a review panel before any line
 * is added, and manual line entry always remains available.
 */
export async function POST(req: Request) {
  try {
    await requirePermission('receive')
    const body = await readJson<OcrBody>(req)

    let image = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : ''
    if (image === '') {
      throw new HttpError(400, 'Send { "imageBase64": "<data URL or raw base64>" } of the invoice photo.')
    }
    // accept raw base64 too — normalise to a data URL for the VLM
    if (!image.startsWith('data:')) image = `data:image/jpeg;base64,${image.replace(/^,+/, '')}`

    // ---- VLM call (server-side only) ----
    let raw: string
    try {
      const zai = await ZAI.create()
      const response = await zai.chat.completions.createVision({
        model: 'glm-4.6v',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VLM_PROMPT },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      })
      raw = response.choices[0]?.message?.content ?? ''
    } catch (err) {
      console.error('[receipts/ocr] VLM call failed:', err)
      throw new HttpError(400, "Couldn't read that photo — the vision service failed. Add lines manually or paste the invoice text.")
    }

    // ---- parse defensively (never 500 on a chatty model) ----
    let items: OcrLineInput[]
    try {
      items = parseModelJson(raw).slice(0, MAX_LINES)
    } catch {
      console.error('[receipts/ocr] unparseable VLM response:', raw.slice(0, 500))
      throw new HttpError(400, "Couldn't read that photo — no lines recognised. Add lines manually or paste the invoice text.")
    }
    if (items.length === 0) {
      throw new HttpError(400, "Couldn't read that photo — no lines recognised. Add lines manually or paste the invoice text.")
    }

    // ---- match against the catalogue (exact SKU → ci-SKU → fuzzy name) ----
    const catalogue = await db.product.findMany({
      where: { active: true },
      select: { id: true, sku: true, name: true },
      orderBy: { sku: 'asc' },
    })
    const lines: OcrLine[] = items.map((item) => {
      const { product, matchType } = matchProductLine(item, catalogue)
      return {
        sku: item.sku,
        name: item.name,
        quantity: clampQuantity(item.quantity),
        matchedProductId: product?.id ?? null,
        matchedSku: product?.sku ?? null,
        matchType,
      }
    })

    return NextResponse.json({ lines })
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
