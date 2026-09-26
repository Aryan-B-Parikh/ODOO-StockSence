'use client'

import { cn } from '@/lib/utils'
import { titleCase } from '@/lib/format'

/**
 * Severity badge — LOW emerald · MEDIUM amber · HIGH red ·
 * CRITICAL dark red (blocked-by-engine adjustments).
 */
const SEVERITY_STYLES: Record<string, string> = {
  LOW: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  MEDIUM: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  HIGH: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  CRITICAL: 'border-red-800 bg-red-800 text-white',
}

export function SeverityBadge({
  severity,
  label,
  className,
}: {
  severity: string
  label?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium',
        SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.LOW,
        className
      )}
    >
      {label ?? titleCase(severity)}
    </span>
  )
}
