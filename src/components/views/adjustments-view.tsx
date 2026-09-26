'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, SlidersHorizontal } from 'lucide-react'

import { PageHeader } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import type { AdjustmentDTO, AdjustmentListDTO } from '@/lib/types'
import { useAuthStore } from '@/stores/auth-store'

import { AdjustmentDetailDialog } from './adjustments/adjustment-detail'
import { AdjustmentRows, ListSkeleton } from './adjustments/adjustment-rows'
import { ErrorState } from './adjustments/bits'
import { NewAdjustmentDialog } from './adjustments/new-adjustment-dialog'

const TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'POSTED', label: 'Posted' },
  { value: 'REJECTED', label: 'Rejected' },
] as const

const SEVERITIES = [
  { value: 'ALL', label: 'All severities' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
] as const

/**
 * Adjustments view — count variances with severity routing.
 * GET /api/adjustments · 20s auto-refresh · tabs per status + severity filter.
 */
export function AdjustmentsView() {
  const canAdjust = useAuthStore((s) => s.user?.permissions.includes('adjust') ?? false)

  const [severity, setSeverity] = useState<string>('ALL')
  const [selected, setSelected] = useState<AdjustmentDTO | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const query = useQuery({
    queryKey: ['adjustments'],
    queryFn: () => api.get<AdjustmentListDTO>('/api/adjustments'),
    refetchInterval: 20_000,
  })

  const adjustments = query.data?.adjustments ?? []
  const filtered = (status: string) =>
    adjustments.filter((a) => (status === 'ALL' || a.status === status) && (severity === 'ALL' || a.severity === severity))
  const anyResults = filtered('ALL').length > 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Adjustments"
        subtitle="Count variances with severity routing — under 2% posts automatically, over 15% waits for approval"
        icon={<SlidersHorizontal className="size-5" />}
        actions={
          canAdjust && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> New Adjustment
            </Button>
          )
        }
      />

      <Tabs defaultValue="ALL">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="w-full max-w-full justify-start overflow-x-auto sm:w-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="flex-none px-3">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger size="sm" className="w-40 shrink-0" aria-label="Filter by severity">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {query.isPending && <ListSkeleton />}

        {query.isError && (
          <ErrorState
            message={query.error instanceof Error ? query.error.message : 'Failed to load adjustments'}
            onRetry={() => void query.refetch()}
          />
        )}

        {query.isSuccess &&
          TABS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-4">
              <AdjustmentRows
                adjustments={filtered(tab.value)}
                tabLabel={tab.label === 'Pending Approval' ? 'pending approval' : tab.label.toLowerCase()}
                canCreate={canAdjust}
                onNew={() => setCreateOpen(true)}
                onSelect={(a) => {
                  setSelected(a)
                  setDetailOpen(true)
                }}
              />
            </TabsContent>
          ))}

        {query.isSuccess && !anyResults && severity !== 'ALL' && (
          <p className="text-center text-xs text-muted-foreground">
            No adjustments match the <span className="font-medium">{severity.toLowerCase()}</span> severity filter.
          </p>
        )}
      </Tabs>

      <AdjustmentDetailDialog
        adjustment={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={setSelected}
      />

      <NewAdjustmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
