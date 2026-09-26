/**
 * StockSense — server-side LLM helper (z-ai-web-dev-sdk).
 * Backend/API use ONLY — never import from client components.
 */

import ZAI from 'z-ai-web-dev-sdk'

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Run a chat completion. The system prompt is passed as the first
 * 'assistant' message, optional multi-turn history follows, and the
 * user prompt is last. Thinking is disabled for fast, cheap replies.
 */
export async function llmComplete(
  systemPrompt: string,
  userPrompt: string,
  history: HistoryMessage[] = [],
): Promise<string> {
  const zai = await ZAI.create()
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userPrompt },
    ],
    thinking: { type: 'disabled' },
  })
  return completion.choices?.[0]?.message?.content ?? ''
}

/** Strip markdown code fences some models wrap around JSON. */
export function stripCodeFences(text: string): string {
  let t = text.trim()
  if (t.startsWith('```')) {
    // ```json ... ``` or ``` ... ```
    t = t.replace(/^```[a-zA-Z]*\s*\n?/, '')
    t = t.replace(/\n?```\s*$/, '')
  }
  return t.trim()
}

/** Best-effort JSON parse of an LLM reply; returns null when invalid. */
export function safeJsonParse<T>(text: string): T | null {
  const cleaned = stripCodeFences(text)
  try {
    return JSON.parse(cleaned) as T
  } catch {
    // Try to grab the first {...} block if the model added prose around it.
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as T
      } catch {
        return null
      }
    }
    return null
  }
}
