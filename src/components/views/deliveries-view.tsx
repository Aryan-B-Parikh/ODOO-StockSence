'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, Plus } from 'lucide-react'

import { PageHeader } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import type { DeliveryDTO, DeliveryListDTO } from '@/lib/types'
import { useAuthStore } from '@/stores/auth-store'

import { ErrorState } from './deliveries/bits'
import { DeliveryDetailDialog } from './deliveries/delivery-detail'
import { DeliveryRows, ListSkeleton } from './deliveries/delivery-rows'
import { NewDeliveryDialog } from './deliveries/new-delivery-dialog'

const TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'PICKED', label: 'Picked' },
  { value: 'PACKED', label: 'Packed' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const

/**
 * Deliveries view — customer orders from reservation to dispatch.
 * GET /api/deliveries · 20s auto-refresh · tabs per pipeline state.
 */
export function DeliveriesView() {
  const canPick = useAuthStore((s) => s.user?.permissions.includes('pick') ?? false)

  const [selected, setSelected] = useState<DeliveryDTO | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const query = useQuery({
    queryKey: ['deliveries'],
    queryFn: () => api.get<DeliveryListDTO>('/api/deliveries'),
    refetchInterval: 20_000,
  })

  const deliveries = query.data?.deliveries ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deliveries"
        subtitle="Customer orders from reservation to dispatch — packing is where stock physically leaves"
        icon={<ClipboardCheck className="size-5" />}
        actions={
          canPick && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> New Delivery
            </Button>
          )
        }
      />

      <Tabs defaultValue="ALL">
        <TabsList className="w-full max-w-full justify-start overflow-x-auto sm:w-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-none px-3">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {query.isPending && <ListSkeleton />}

        {query.isError && (
          <ErrorState
            message={query.error instanceof Error ? query.error.message : 'Failed to load deliveries'}
            onRetry={() => void query.refetch()}
          />
        )}

        {query.isSuccess &&
          TABS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-4">
              <DeliveryRows
                deliveries={tab.value === 'ALL' ? deliveries : deliveries.filter((d) => d.status === tab.value)}
                tabLabel={tab.label}
                canCreate={canPick}
                onNew={() => setCreateOpen(true)}
                onSelect={(d) => {
                  setSelected(d)
                  setDetailOpen(true)
                }}
              />
            </TabsContent>
          ))}
      </Tabs>

      <DeliveryDetailDialog
        delivery={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={setSelected}
      />

      <NewDeliveryDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
