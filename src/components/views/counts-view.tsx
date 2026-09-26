'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, ScanLine } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/shell/page-header'
import { staggerContainer } from '@/components/views/dashboard/motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import type { CountListDTO } from '@/lib/types'
import { useAuthStore } from '@/stores/auth-store'

import { CountCard, CountsEmptyState } from './counts/count-card'
import { CountDetailDialog, CountsSkeleton } from './counts/count-detail-dialog'
import { NewCountDialog } from './counts/new-count-dialog'

const TABS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const

type TabValue = (typeof TABS)[number]['value']

/**
 * Cycle Counts — scheduled and ad-hoc tallies. Submitting a count compares
 * the physical tally with system quantities; only a real variance opens an
 * adjustment (routed through the severity engine).
 */
export function CountsView() {
  const [tab, setTab] = useState<TabValue>('OPEN')
  const [detailId, setDetailId] = useState<number | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const permissions = useAuthStore((s) => s.user?.permissions ?? [])
  const canCount = permissions.includes('count')

  const query = useQuery({
    queryKey: ['counts'],
    queryFn: () => api.get<CountListDTO>('/api/counts'),
    refetchInterval: 30_000,
  })

  const counts = query.data?.counts ?? []
  const forTab = counts.filter((c) => c.status === tab)
  const tabCounts: Record<string, number> = {
    OPEN: counts.filter((c) => c.status === 'OPEN').length,
    COMPLETED: counts.filter((c) => c.status === 'COMPLETED').length,
    CANCELLED: counts.filter((c) => c.status === 'CANCELLED').length,
  }
  const detail = detailId !== null ? (counts.find((c) => c.id === detailId) ?? null) : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cycle Counts"
        subtitle="Physical tallies against system quantities — variances become explained adjustments"
        icon={<ScanLine className="size-5" />}
        actions={
          canCount && (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="size-3.5" aria-hidden="true" />
              New Count
            </Button>
          )
        }
      />

      {query.isPending && <CountsSkeleton />}

      {query.isError && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="font-semibold">Counts unavailable</p>
            <p className="text-sm text-muted-foreground">
              {query.error instanceof Error ? query.error.message : 'Could not load cycle counts.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {query.isSuccess && (
        <>
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                  <span className="ml-1 rounded-full bg-muted-foreground/10 px-1.5 text-[10px] font-semibold tabular">
                    {tabCounts[t.value]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            aria-label={`${TABS.find((t) => t.value === tab)?.label} counts`}
          >
            {forTab.length === 0 ? (
              <CountsEmptyState status={tab} />
            ) : (
              forTab.map((count) => (
                <CountCard
                  key={count.id}
                  count={count}
                  canCount={canCount}
                  onOpen={() => setDetailId(count.id)}
                />
              ))
            )}
          </motion.div>
        </>
      )}

      <CountDetailDialog
        count={detail}
        open={detailId !== null}
        onOpenChange={(o) => {
          if (!o) setDetailId(null)
        }}
      />
      <NewCountDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}
