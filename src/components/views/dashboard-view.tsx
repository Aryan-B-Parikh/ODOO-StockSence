'use client'

import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard } from 'lucide-react'

import { PageHeader } from '@/components/shell/page-header'
import { api } from '@/lib/api'
import type { DashboardDTO } from '@/lib/types'
import { useAuthStore } from '@/stores/auth-store'

import { ActivityList } from './dashboard/activity-list'
import { AttentionPanel } from './dashboard/attention-panel'
import { ChartsRow } from './dashboard/charts-row'
import { KpiCards } from './dashboard/kpi-cards'
import { MetricsPanel } from './dashboard/metrics-panel'
import { RackGrid } from './dashboard/rack-grid'
import { DashboardError, DashboardSkeleton } from './dashboard/states'

/**
 * Dashboard — live warehouse overview.
 * GET /api/dashboard · 30s auto-refresh · skeleton while loading ·
 * friendly retry-able error state (the API may still be booting).
 */
export function DashboardView() {
  const userName = useAuthStore((s) => s.user?.name)

  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardDTO>('/api/dashboard'),
    refetchInterval: 30_000,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={
          userName
            ? `Live overview of stock, value and what needs attention — welcome, ${userName.split(' ')[0]}`
            : 'Live overview of stock, value and what needs attention'
        }
        icon={<LayoutDashboard className="size-5" />}
      />

      {query.isPending && <DashboardSkeleton />}

      {query.isError && (
        <DashboardError error={query.error} onRetry={() => void query.refetch()} />
      )}

      {query.isSuccess && query.data && (
        <>
          <KpiCards kpis={query.data.kpis} />
          <AttentionPanel attention={query.data.attention} />
          <ChartsRow valueByCategory={query.data.valueByCategory} flows={query.data.flows} />
          <MetricsPanel metrics={query.data.metrics} />
          <RackGrid racks={query.data.racks} />
          <ActivityList activity={query.data.activity} />
        </>
      )}
    </div>
  )
}
