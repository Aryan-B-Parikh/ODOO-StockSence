'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Info, ShoppingCart } from 'lucide-react'

import { PageHeader } from '@/components/shell/page-header'
import { fadeUp, staggerContainer } from '@/components/views/dashboard/motion'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { ReorderListDTO } from '@/lib/types'

import { DecisionHistory } from './reorder/decision-history'
import { StatusTable } from './reorder/status-table'
import { SuggestionCard, SuggestionsEmptyState } from './reorder/suggestion-card'

/**
 * Reorder — Phase 3's showpiece: explainable, supplier-aware purchase
 * suggestions. GET /api/reorder · 60s refresh. Accepting a suggestion
 * creates a real expected receipt; dismissing parks it for 7 days.
 */
export function ReorderView() {
  const query = useQuery({
    queryKey: ['reorder'],
    queryFn: () => api.get<ReorderListDTO>('/api/reorder'),
    refetchInterval: 60_000,
  })

  const suggestions = query.data?.suggestions ?? []
  const pending = suggestions.filter((s) => s.status === 'PENDING')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reorder"
        subtitle="Explainable, supplier-aware purchase suggestions — every suggestion shows its math"
        icon={<ShoppingCart className="size-5" />}
      />

      {/* Explainer */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible">
        <div
          role="note"
          className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-sm text-muted-foreground"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p>
            <span className="font-medium text-foreground">Projected available = on-hand + incoming − reserved.</span>{' '}
            A product needs reordering when projected available falls below its reorder point. Every suggestion
            explains itself.
          </p>
        </div>
      </motion.div>

      {/* PENDING suggestions */}
      {query.isPending && (
        <div className="space-y-4" aria-busy="true" aria-label="Loading reorder suggestions">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}

      {query.isError && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="font-semibold">Reorder suggestions unavailable</p>
            <p className="text-sm text-muted-foreground">
              {query.error instanceof Error ? query.error.message : 'Could not load suggestions.'}
            </p>
            <button
              type="button"
              className="text-sm text-primary underline-offset-4 hover:underline"
              onClick={() => void query.refetch()}
            >
              Retry
            </button>
          </CardContent>
        </Card>
      )}

      {query.isSuccess && (
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-4"
          aria-label={`Reorder suggestions (${pending.length} pending)`}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Awaiting a decision
              <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground tabular">
                {pending.length}
              </span>
            </h2>
          </div>
          {pending.length === 0 ? <SuggestionsEmptyState /> : pending.map((s) => <SuggestionCard key={s.id} suggestion={s} />)}
        </motion.section>
      )}

      {/* Decision history */}
      {query.isSuccess && <DecisionHistory suggestions={suggestions} />}

      {/* All products at a glance */}
      <StatusTable />
    </div>
  )
}
