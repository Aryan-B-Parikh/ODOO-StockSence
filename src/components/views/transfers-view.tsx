'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Plus } from 'lucide-react'

import { PageHeader } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import type { TransferDTO, TransferListDTO } from '@/lib/types'
import { useAuthStore } from '@/stores/auth-store'
import { useScanStore } from '@/stores/scan-store'

import { ErrorState } from './transfers/bits'
import { NewTransferDialog } from './transfers/new-transfer-dialog'
import { TransferDetailDialog } from './transfers/transfer-detail'
import { ListSkeleton, TransferRows } from './transfers/transfer-rows'

const TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'IN_TRANSIT', label: 'In Transit' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const

/**
 * Transfers view — internal moves between locations.
 * GET /api/transfers · 20s auto-refresh · source Available → In transit → destination Available.
 */
export function TransfersView() {
  const canTransfer = useAuthStore((s) => s.user?.permissions.includes('transfer') ?? false)

  const [selected, setSelected] = useState<TransferDTO | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [createOpenLocal, setCreateOpenLocal] = useState(false)

  // Scan handoff: the global scan dialog's "New transfer from/to here" quick
  // action navigates here and asks for the dialog — derived into `open` (no
  // effect needed). The prefilled route comes from the scan store's pending
  // pair, consumed inside NewTransferDialog.
  const newTransferOpen = useScanStore((s) => s.newTransferOpen)
  const ackNewTransferOpen = useScanStore((s) => s.ackNewTransferOpen)
  const createOpen = createOpenLocal || newTransferOpen

  const query = useQuery({
    queryKey: ['transfers'],
    queryFn: () => api.get<TransferListDTO>('/api/transfers'),
    refetchInterval: 20_000,
  })

  const transfers = query.data?.transfers ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfers"
        subtitle="Internal moves between locations — in-transit stock only becomes available at the destination once received"
        icon={<ArrowLeftRight className="size-5" />}
        actions={
          canTransfer && (
            <Button onClick={() => setCreateOpenLocal(true)}>
              <Plus className="size-4" aria-hidden="true" /> New Transfer
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
            message={query.error instanceof Error ? query.error.message : 'Failed to load transfers'}
            onRetry={() => void query.refetch()}
          />
        )}

        {query.isSuccess &&
          TABS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-4">
              <TransferRows
                transfers={tab.value === 'ALL' ? transfers : transfers.filter((t) => t.status === tab.value)}
                tabLabel={tab.label}
                canCreate={canTransfer}
                onNew={() => setCreateOpenLocal(true)}
                onSelect={(t) => {
                  setSelected(t)
                  setDetailOpen(true)
                }}
              />
            </TabsContent>
          ))}
      </Tabs>

      <TransferDetailDialog
        transfer={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={setSelected}
      />

      <NewTransferDialog
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpenLocal(next)
          if (!next) ackNewTransferOpen()
        }}
      />
    </div>
  )
}
