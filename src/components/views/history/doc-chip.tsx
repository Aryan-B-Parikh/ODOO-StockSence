'use client'

import { cn } from '@/lib/utils'

/**
 * docType → chip color (kept in sync with the dashboard activity list).
 * No blue/indigo anywhere — emerald/teal/amber/stone/orange/zinc palette.
 */
export const DOC_STYLES: Record<string, string> = {
  RECEIPT: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  DELIVERY: 'border-stone-500/30 bg-stone-500/10 text-stone-600 dark:text-stone-300',
  TRANSFER: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400',
  ADJUSTMENT: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  COUNT: 'border-amber-700/30 bg-amber-700/10 text-amber-800 dark:text-amber-300',
  OPENING: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
}

/** Colored document-code chip (e.g. RCPT-1006 in emerald for a receipt). */
export function DocChip({
  docType,
  docCode,
  className,
}: {
  docType: string
  docCode: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium',
        DOC_STYLES[docType] ?? DOC_STYLES.OPENING,
        className
      )}
    >
      {docCode}
    </span>
  )
}

/** Subtle ledger-field chip (ON_HAND / RESERVED / INCOMING / IN_TRANSIT / DAMAGED). */
export function FieldChip({ field, className }: { field: string; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground',
        className
      )}
    >
      {field}
    </span>
  )
}
