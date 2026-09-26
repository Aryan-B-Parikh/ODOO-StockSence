'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Clock3, Plus, RotateCcw, Truck, TruckElectric } from 'lucide-react'
import { useMemo, useState } from 'react'

import { EmptyState } from '@/components/shared'
import { PageHeader } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toggle } from '@/components/ui/toggle'
import { api } from '@/lib/api'
import type { ReceiptListDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { fadeUp, staggerContainer } from './dashboard/motion'
import { NewReceiptDialog } from './receipts/new-receipt-dialog'
import { ReceiptCard } from './receipts/receipt-card'
import { ReceiptDetailDialog } from './receipts/receipt-detail-dialog'

type StatusTab = 'ALL' | 'EXPECTED' | 'RECEIVED' | 'CANCELLED'

function ReceiptsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading receipts">
      <Skeleton className="h-11 w-full max-w-md rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

/**
 * Receipts — inbound goods. Expected receipts raise 'incoming'; receiving
 * converts it to on-hand (good) or damaged. Delayed expectations are flagged
 * red and feed the Needs Attention panel.
 */
export function ReceiptsView() {
  const permissions = useAuthStore((s) => s.user?.permissions)
  const canReceive = permissions?.includes('receive') ?? false

  const [tab, setTab] = useState<StatusTab>('ALL')
  const [delayedOnly, setDelayedOnly] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const query = useQuery({
    queryKey: ['receipts'],
    queryFn: () => api.get<ReceiptListDTO>('/api/receipts'),
    refetchInterval: 20_000,
  })

  const receipts = query.data?.receipts ?? []
  const counts = useMemo(
    () => ({
      ALL: receipts.length,
      EXPECTED: receipts.filter((r) => r.status === 'EXPECTED').length,
      RECEIVED: receipts.filter((r) => r.status === 'RECEIVED').length,
      CANCELLED: receipts.filter((r) => r.status === 'CANCELLED').length,
      DELAYED: receipts.filter((r) => r.status === 'EXPECTED' && r.daysLate > 0).length,
    }),
    [receipts]
  )

  const filtered = useMemo(
    () =>
      receipts.filter(
        (r) =>
          (tab === 'ALL' || r.status === tab) &&
          (!delayedOnly || (r.status === 'EXPECTED' && r.daysLate > 0))
      ),
    [receipts, tab, delayedOnly]
  )

  const selected = selectedId != null ? receipts.find((r) => r.id === selectedId) : undefined

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipts"
        subtitle="Inbound goods — an expectation raises incoming, receiving makes it available"
        icon={<Truck className="size-5" />}
        actions={
          canReceive ? (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> New Receipt
            </Button>
          ) : undefined
        }
      />

      {query.isPending && <ReceiptsSkeleton />}

      {query.isError && (
        <EmptyState
          icon={Truck}
          title="Couldn't load receipts"
          description={query.error instanceof Error ? query.error.message : 'The API may still be starting up.'}
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              <RotateCcw className="size-4" aria-hidden="true" /> Retry
            </Button>
          }
        />
      )}

      {query.data && (
        <>
          {/* Status filter + delayed toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
              <TabsList aria-label="Filter receipts by status" className="flex-wrap sm:flex-nowrap">
                {(['ALL', 'EXPECTED', 'RECEIVED', 'CANCELLED'] as const).map((t) => (
                  <TabsTrigger key={t} value={t} className="gap-1.5">
                    {t === 'ALL' ? 'All' : t === 'EXPECTED' ? 'Expected' : t === 'RECEIVED' ? 'Received' : 'Cancelled'}
                    <span className="rounded-full bg-muted-foreground/10 px-1.5 text-[10px] font-semibold tabular">
                      {counts[t]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Toggle
              variant="outline"
              size="sm"
              pressed={delayedOnly}
              onPressedChange={setDelayedOnly}
              aria-label="Show only delayed receipts"
              className={cn(
                'gap-1.5',
                delayedOnly &&
                  'border-red-500/50 bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-400'
              )}
            >
              <Clock3 className="size-3.5" aria-hidden="true" /> Delayed only
              {counts.DELAYED > 0 && (
                <span className="rounded-full bg-red-500/15 px-1.5 text-[10px] font-semibold tabular">
                  {counts.DELAYED}
                </span>
              )}
            </Toggle>
          </div>

          {/* Card grid */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={TruckElectric}
              title={delayedOnly ? 'No delayed receipts' : 'No receipts in this state'}
              description={
                delayedOnly
                  ? 'Nothing is past its expected date — all inbound goods are on schedule.'
                  : 'Create a receipt to record inbound goods you expect to arrive.'
              }
              action={
                canReceive ? (
                  <Button variant="outline" size="sm" onClick={() => setNewOpen(true)}>
                    <Plus className="size-3.5" aria-hidden="true" /> New Receipt
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
              aria-label="Receipts"
            >
              {filtered.map((receipt) => (
                <motion.div key={receipt.id} variants={fadeUp}>
                  <ReceiptCard receipt={receipt} onOpen={() => setSelectedId(receipt.id)} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </>
      )}

      {selected && (
        <ReceiptDetailDialog
          key={selected.id}
          receipt={selected}
          open
          onClose={() => setSelectedId(null)}
        />
      )}

      <NewReceiptDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}
