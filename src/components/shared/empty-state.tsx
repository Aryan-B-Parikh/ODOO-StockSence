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
        'bg-grid relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed bg-card px-6 py-12 text-center',
        className
      )}
      role="status"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,transparent_25%,black_90%)]"
      />
      <div className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="relative space-y-1">
        <p className="font-semibold tracking-tight">{title}</p>
        {description && (
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <div className="relative flex flex-wrap items-center justify-center gap-2 pt-1">{action}</div>
      )}
    </div>
  )
}
