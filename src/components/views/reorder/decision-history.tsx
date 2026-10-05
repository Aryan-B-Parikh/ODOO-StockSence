'use client'

import { Check, History, Minus } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { fmtDateTime, fmtQty, timeAgo } from '@/lib/format'
import type { ReorderSuggestionDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Decision history — compact rows for suggestions that were ACCEPTED
 * (with the receipt they created) or DISMISSED.
 */
export function DecisionHistory({ suggestions }: { suggestions: ReorderSuggestionDTO[] }) {
  const decided = suggestions
    .filter((s) => s.status === 'ACCEPTED' || s.status === 'DISMISSED')
    .sort((a, b) => (b.decidedAt ?? b.updatedAt).localeCompare(a.decidedAt ?? a.updatedAt))

  return (
    <section aria-label="Decision history">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4 text-primary" aria-hidden="true" />
            Decision history
          </CardTitle>
          <CardDescription>Accepted suggestions (with their receipts) and dismissed ones</CardDescription>
        </CardHeader>
        <CardContent>
          {decided.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No decisions yet — accepted and dismissed suggestions land here.
            </p>
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto pr-1">
              {decided.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full',
                      s.status === 'ACCEPTED'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'bg-stone-500/10 text-stone-500'
                    )}
                  >
                    {s.status === 'ACCEPTED' ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      <span className="font-mono text-xs font-semibold">{s.sku}</span>
                      <span className="ml-1.5 text-muted-foreground">{s.productName}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.status === 'ACCEPTED' ? 'Ordered' : 'Dismissed'} {fmtQty(s.suggestedQty, s.unit)} ·{' '}
                      {s.preferredName}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {s.status === 'ACCEPTED' && s.receiptCode ? (
                      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                        {s.receiptCode}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block cursor-help text-[11px] text-muted-foreground tabular">
                          {timeAgo(s.decidedAt ?? s.updatedAt)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{fmtDateTime(s.decidedAt ?? s.updatedAt)}</TooltipContent>
                    </Tooltip>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
