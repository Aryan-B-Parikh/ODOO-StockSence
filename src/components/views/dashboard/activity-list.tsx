'use client'

import { motion } from 'framer-motion'
import { ArrowRight, ScrollText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { deltaColor, fmtSignedQty, timeAgo, titleCase } from '@/lib/format'
import type { LedgerEntryDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'

import { fadeUp } from './motion'

/** docType → chip color (no blue/indigo anywhere). */
const DOC_STYLES: Record<string, string> = {
  RECEIPT: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  DELIVERY: 'border-stone-500/30 bg-stone-500/10 text-stone-600 dark:text-stone-300',
  TRANSFER: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400',
  ADJUSTMENT: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  COUNT: 'border-amber-700/30 bg-amber-700/10 text-amber-800 dark:text-amber-300',
  OPENING: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
}

function DocChip({ docType, docCode }: { docType: string; docCode: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium',
        DOC_STYLES[docType] ?? DOC_STYLES.OPENING
      )}
    >
      {docCode}
    </span>
  )
}

/** Row 5 — latest ledger movements (compact, scrollable). */
export function ActivityList({ activity }: { activity: LedgerEntryDTO[] }) {
  const setView = useUIStore((s) => s.setView)

  return (
    <motion.section variants={fadeUp} initial="hidden" animate="visible" aria-label="Recent activity">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="size-4 text-primary" aria-hidden="true" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest movements from the immutable ledger</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setView('history')}>
              Full history <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No movements recorded yet.</p>
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto pr-1">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2.5" title={entry.code}>
                  <DocChip docType={entry.docType} docCode={entry.docCode} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs font-medium">{entry.sku}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {titleCase(entry.field)} · {entry.locationPath}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={cn('text-xs font-semibold tabular', deltaColor(entry.diff))}>
                      {fmtSignedQty(entry.diff, entry.unit)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {timeAgo(entry.createdAt)}
                      {entry.performedByName ? ` · ${entry.performedByName}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </motion.section>
  )
}
