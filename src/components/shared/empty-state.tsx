'use client'

import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Friendly empty state card (no results, no data, errors with a retry action). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-12 text-center',
        className
      )}
      role="status"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold tracking-tight">{title}</p>
        {description && (
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="flex flex-wrap items-center justify-center gap-2 pt-1">{action}</div>}
    </div>
  )
}
