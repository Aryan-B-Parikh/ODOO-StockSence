'use client'

import { CalendarDays, ChevronRight, Clock3, StickyNote } from 'lucide-react'

import { DocCodeChip, StatusBadge } from '@/components/shared'
import { Card, CardContent } from '@/components/ui/card'
import { fmtDate, timeUntilStr } from '@/lib/format'
import type { ReceiptDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

/** One receipt in the card grid — click to open the detail dialog. */
export function ReceiptCard({
  receipt,
  onOpen,
}: {
  receipt: ReceiptDTO
  onOpen: () => void
}) {
  const isLate = receipt.status === 'EXPECTED' && receipt.daysLate > 0
  const firstSkus = receipt.lines.slice(0, 2)

  return (
    <Card
      tabIndex={0}
      role="button"
      aria-label={`Open receipt ${receipt.code} from ${receipt.supplierName ?? 'no supplier'}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="cursor-pointer gap-0 py-0 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <DocCodeChip docType="RECEIPT" code={receipt.code} />
          <StatusBadge status={receipt.status} />
          {isLate && (
            <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400">
              <Clock3 className="size-3" aria-hidden="true" />
              {receipt.daysLate}d late
            </span>
          )}
          <ChevronRight
            className="ml-auto size-4 shrink-0 text-muted-foreground/60"
            aria-hidden="true"
          />
        </div>

        <div className="mt-2.5 min-w-0">
          <p className="truncate font-medium">{receipt.supplierName ?? 'No supplier'}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" aria-hidden="true" />
              Expected {fmtDate(receipt.expectedAt)}
              {receipt.status === 'EXPECTED' && !isLate && receipt.daysLate === 0 && (
                <span className="text-muted-foreground/80">(in {timeUntilStr(receipt.expectedAt)})</span>
              )}
            </span>
            {receipt.receivedAt && <span>· Received {fmtDate(receipt.receivedAt)}</span>}
          </p>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {firstSkus.map((l) => (
            <span key={l.id} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium">
              {l.sku}
            </span>
          ))}
          {receipt.lines.length > 2 && (
            <span className="text-[10px] text-muted-foreground">+{receipt.lines.length - 2} more</span>
          )}
          <span className="text-[10px] text-muted-foreground">
            · {receipt.lines.length} {receipt.lines.length === 1 ? 'line' : 'lines'}
          </span>
        </div>

        {receipt.note && (
          <p className={cn('mt-2.5 flex items-start gap-1.5 text-xs text-muted-foreground')}>
            <StickyNote className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            <span className="line-clamp-1 italic">{receipt.note}</span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
