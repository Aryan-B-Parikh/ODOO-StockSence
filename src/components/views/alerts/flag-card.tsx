'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ShieldQuestion } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { fmtDateTime, timeAgo, titleCase } from '@/lib/format'
import type { ExceptionFlagDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'

/** flag severity → dot + chip colors. */
const SEVERITY_DOT: Record<string, string> = {
  LOW: 'bg-emerald-500',
  MEDIUM: 'bg-amber-500',
  HIGH: 'bg-red-500',
}

const TYPE_CHIP: Record<string, string> = {
  REPEATED_MISMATCH: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400',
  STAFF_ANOMALY: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  MODERATE_VARIANCE: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
}

/**
 * One review flag — an exception the inventory engine raised while posting
 * adjustments (repeated mismatches, staff anomalies, moderate variances).
 * OPEN flags can be marked reviewed (permission 'approve-adjustment').
 */
export function FlagCard({ flag }: { flag: ExceptionFlagDTO }) {
  const queryClient = useQueryClient()
  const setView = useUIStore((s) => s.setView)
  const canReview = (useAuthStore((s) => s.user?.permissions ?? [])).includes('approve-adjustment')
  const isOpen = flag.status === 'OPEN'

  const reviewMutation = useMutation({
    mutationFn: () => api.post(`/api/attention/flags/${flag.id}/review`),
    onSuccess: () => {
      toast.success('Flag marked as reviewed')
      void queryClient.invalidateQueries({ queryKey: ['attention'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <Card className={cn('gap-3', !isOpen && 'opacity-80')}>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn('size-2 shrink-0 rounded-full', SEVERITY_DOT[flag.severity] ?? 'bg-amber-500')}
            aria-label={`${flag.severity.toLowerCase()} severity`}
          />
          <span
            className={cn(
              'shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide',
              TYPE_CHIP[flag.type] ?? TYPE_CHIP.MODERATE_VARIANCE
            )}
          >
            {titleCase(flag.type)}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-[11px] text-muted-foreground tabular">{timeAgo(flag.createdAt)}</span>
              </TooltipTrigger>
              <TooltipContent>{fmtDateTime(flag.createdAt)}</TooltipContent>
            </Tooltip>
            <Badge
              variant="outline"
              className={cn(
                isOpen
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              )}
            >
              {isOpen ? 'Open' : 'Reviewed'}
            </Badge>
          </div>
        </div>

        <p className="text-sm leading-relaxed">{flag.message}</p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {flag.refCode ? (
            <button
              type="button"
              onClick={() => setView('adjustments')}
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
              title={`Open ${flag.refCode} in Adjustments`}
            >
              {flag.refCode} →
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">No reference document</span>
          )}

          {isOpen && canReview && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => reviewMutation.mutate()}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? (
                <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              )}
              Mark reviewed
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Empty state for the review-flags section. */
export function FlagsEmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center gap-1.5 rounded-lg border border-dashed py-10 text-center">
      <ShieldQuestion className="size-6 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
      <p className="text-sm font-medium">No review flags</p>
      <p className="text-xs text-muted-foreground">
        Flags appear here when the engine detects unusual adjustment patterns worth a look.
      </p>
    </div>
  )
}
