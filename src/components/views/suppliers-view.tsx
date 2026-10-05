'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Building2, Link2, Plus, RotateCcw, Star, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'

import { EmptyState } from '@/components/shared'
import { PageHeader } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { SupplierDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { fadeUp, staggerContainer } from './dashboard/motion'
import { SupplierCard } from './suppliers/supplier-card'
import { SupplierDetailDialog } from './suppliers/supplier-detail-dialog'
import { SupplierFormDialog } from './suppliers/supplier-form-dialog'

function SummaryCard({
  label, value, icon, iconClass, valueClass,
}: {
  label: string
  value: string
  icon: React.ReactNode
  iconClass: string
  valueClass?: string
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', iconClass)}>{icon}</span>
        </div>
        <div className={cn('mt-2 text-2xl font-semibold tracking-tight tabular', valueClass)}>{value}</div>
      </CardContent>
    </Card>
  )
}

function SuppliersSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading suppliers">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

/**
 * Suppliers — the vendor directory. Lead times, MOQ, order multiples,
 * reliability and damage rate are exactly what the Phase 3 reorder math uses;
 * keep them accurate and the suggestions stay explainable.
 */
export function SuppliersView() {
  const permissions = useAuthStore((s) => s.user?.permissions)
  const canConfigure = permissions?.includes('configure') ?? false

  const [detailId, setDetailId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const query = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get<{ suppliers: SupplierDTO[] }>('/api/suppliers'),
    refetchInterval: 30_000,
  })

  const suppliers = query.data?.suppliers ?? []

  const summary = useMemo(() => {
    const total = suppliers.length
    const avgLead = total > 0 ? suppliers.reduce((a, s) => a + s.leadTimeDays, 0) / total : 0
    const linkCount = suppliers.reduce((a, s) => a + s.productCount, 0)
    const preferredCount = suppliers.reduce(
      (a, s) => a + s.products.filter((p) => p.preferred).length,
      0
    )
    return { total, avgLead, linkCount, preferredCount }
  }, [suppliers])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        subtitle="Vendor directory — lead times, MOQ and reliability feed the reorder suggestions"
        icon={<Building2 className="size-5" />}
        actions={
          canConfigure ? (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> New Supplier
            </Button>
          ) : undefined
        }
      />

      {query.isPending && <SuppliersSkeleton />}

      {query.isError && (
        <EmptyState
          icon={Building2}
          title="Couldn't load suppliers"
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
          {/* Summary strip — computed client-side from the supplier list */}
          <motion.section
            aria-label="Supplier summary"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 gap-3 md:grid-cols-4"
          >
            <motion.div variants={fadeUp}>
              <SummaryCard
                label="Suppliers"
                value={String(summary.total)}
                icon={<Building2 className="size-3.5" />}
                iconClass="bg-teal-500/10 text-teal-600"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <SummaryCard
                label="Avg lead time"
                value={`${Number(summary.avgLead.toFixed(1))}d`}
                icon={<Truck className="size-3.5" />}
                iconClass="bg-amber-500/10 text-amber-700 dark:text-amber-400"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <SummaryCard
                label="Linked products"
                value={String(summary.linkCount)}
                icon={<Link2 className="size-3.5" />}
                iconClass="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <SummaryCard
                label="Preferred for"
                value={`${summary.preferredCount} ${summary.preferredCount === 1 ? 'SKU' : 'SKUs'}`}
                icon={<Star className="size-3.5" />}
                iconClass="bg-primary/10 text-primary"
              />
            </motion.div>
          </motion.section>

          {/* Supplier cards */}
          {suppliers.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No suppliers yet"
              description="Add your vendors with their lead times and order terms — the reorder engine uses them for every suggestion."
              action={
                canConfigure ? (
                  <Button size="sm" onClick={() => setFormOpen(true)}>
                    <Plus className="size-4" aria-hidden="true" /> New Supplier
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <motion.section
              aria-label="Supplier directory"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {suppliers.map((s) => (
                <motion.div key={s.id} variants={fadeUp}>
                  <SupplierCard supplier={s} onOpen={() => setDetailId(s.id)} />
                </motion.div>
              ))}
            </motion.section>
          )}
        </>
      )}

      {detailId != null && (
        <SupplierDetailDialog
          key={detailId}
          supplierId={detailId}
          open
          onClose={() => setDetailId(null)}
        />
      )}

      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}
