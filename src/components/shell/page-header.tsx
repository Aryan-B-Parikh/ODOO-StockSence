'use client'

import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

/**
 * Shared page header used by every view inside the AppShell <main> region.
 * Convention for Task 2 views:
 *   <PageHeader title="Products" subtitle="…" icon={<Package className="size-5" />} actions={<Button>New Product</Button>} />
 */
export function PageHeader({ title, subtitle, icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon && (
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
