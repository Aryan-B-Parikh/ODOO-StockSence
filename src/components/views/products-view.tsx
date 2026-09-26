'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  AlertTriangle, DollarSign, Filter, OctagonX, Package, PackageSearch, Plus, RotateCcw, Search, X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState, getProductStatus, QuantityPill, StatusBadge } from '@/components/shared'
import { PageHeader } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Toggle } from '@/components/ui/toggle'
import { api } from '@/lib/api'
import { fmtUSD, fmtUSDCompact } from '@/lib/format'
import type { ProductListDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'

import { fadeUp, staggerContainer } from './dashboard/motion'
import { ProductDetailDialog } from './products/product-detail-dialog'
import { NewProductDialog } from './products/new-product-dialog'

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

function ProductsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading products">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}

/**
 * Products — the catalogue with split quantities. Every quantity column
 * comes straight from the engine (available = on-hand − reserved, never
 * oversold). Click a row for the full product drill-down.
 */
export function ProductsView() {
  const permissions = useAuthStore((s) => s.user?.permissions)
  const canConfigure = permissions?.includes('configure') ?? false

  const productDetailId = useUIStore((s) => s.productDetailId)
  const closeProduct = useUIStore((s) => s.closeProduct)
  const openProduct = useUIStore((s) => s.openProduct)

  // Filters — search + category go to the API, the two risk toggles filter
  // client-side on the computed DTO flags for instant feedback.
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [belowOnly, setBelowOnly] = useState(false)
  const [stockoutOnly, setStockoutOnly] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const query = useQuery({
    queryKey: ['products', search, category],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (category !== 'all') params.set('category', category)
      const qs = params.toString()
      return api.get<ProductListDTO>(`/api/products${qs ? `?${qs}` : ''}`)
    },
    refetchInterval: 30_000,
  })

  const data = query.data
  const products = useMemo(() => {
    const list = data?.products ?? []
    return list.filter(
      (p) => (!belowOnly || p.belowReorder) && (!stockoutOnly || p.stockoutRisk)
    )
  }, [data, belowOnly, stockoutOnly])

  const filtersActive =
    search !== '' || category !== 'all' || belowOnly || stockoutOnly
  const clearFilters = () => {
    setSearchInput('')
    setSearch('')
    setCategory('all')
    setBelowOnly(false)
    setStockoutOnly(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        subtitle="Catalogue with split quantities — available = on-hand − reserved, per SKU"
        icon={<Package className="size-5" />}
        actions={
          canConfigure ? (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="size-4" aria-hidden="true" /> New Product
            </Button>
          ) : undefined
        }
      />

      {query.isPending && <ProductsSkeleton />}

      {query.isError && (
        <EmptyState
          icon={PackageSearch}
          title="Couldn't load the catalogue"
          description={query.error instanceof Error ? query.error.message : 'The API may still be starting up.'}
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              <RotateCcw className="size-4" aria-hidden="true" /> Retry
            </Button>
          }
        />
      )}

      {data && (
        <>
          {/* Summary strip — always describes the FULL catalogue */}
          <motion.section
            aria-label="Catalogue summary"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 gap-3 md:grid-cols-4"
          >
            <motion.div variants={fadeUp}>
              <SummaryCard
                label="Active SKUs"
                value={String(data.summary.totalSkus)}
                icon={<Package className="size-3.5" />}
                iconClass="bg-emerald-500/10 text-emerald-600"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <SummaryCard
                label="Total Stock Value"
                value={fmtUSDCompact(data.summary.totalStockValue)}
                icon={<DollarSign className="size-3.5" />}
                iconClass="bg-teal-500/10 text-teal-600"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <SummaryCard
                label="Below Reorder"
                value={String(data.summary.belowReorder)}
                icon={<AlertTriangle className="size-3.5" />}
                iconClass="bg-amber-500/10 text-amber-600"
                valueClass={data.summary.belowReorder > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <SummaryCard
                label="Stockouts"
                value={String(data.summary.stockoutRisk)}
                icon={<OctagonX className="size-3.5" />}
                iconClass="bg-red-500/10 text-red-600"
                valueClass={data.summary.stockoutRisk > 0 ? 'text-red-600 dark:text-red-400' : undefined}
              />
            </motion.div>
          </motion.section>

          {/* Filters */}
          <motion.section variants={fadeUp} initial="hidden" animate="visible" aria-label="Filters">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative flex-1 sm:min-w-56 sm:max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search SKU or name…"
                  aria-label="Search products"
                  className="pl-8"
                />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full sm:w-44" aria-label="Filter by category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {data.categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Toggle
                  variant="outline"
                  size="sm"
                  pressed={belowOnly}
                  onPressedChange={setBelowOnly}
                  aria-label="Show only products below reorder point"
                  className={cn(
                    'gap-1.5',
                    belowOnly &&
                      'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400'
                  )}
                >
                  <AlertTriangle className="size-3.5" aria-hidden="true" /> Below reorder
                </Toggle>
                <Toggle
                  variant="outline"
                  size="sm"
                  pressed={stockoutOnly}
                  onPressedChange={setStockoutOnly}
                  aria-label="Show only stockout-risk products"
                  className={cn(
                    'gap-1.5',
                    stockoutOnly &&
                      'border-red-500/50 bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-400'
                  )}
                >
                  <OctagonX className="size-3.5" aria-hidden="true" /> Stockout risk
                </Toggle>
              </div>
            </div>
            {filtersActive && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Filter className="size-3" aria-hidden="true" />
                <span>
                  Showing {products.length} of {data.summary.totalSkus} SKUs
                </span>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  <X className="size-3" aria-hidden="true" /> Clear
                </button>
              </div>
            )}
          </motion.section>

          {/* Catalogue table */}
          <motion.section variants={fadeUp} initial="hidden" animate="visible" aria-label="Product catalogue">
            <Card className="py-0">
              <CardContent className="p-0">
                {products.length === 0 ? (
                  <EmptyState
                    icon={PackageSearch}
                    title="No products match"
                    description="Try clearing the search or risk filters — or create a new SKU."
                    className="border-0"
                    action={
                      filtersActive ? (
                        <Button variant="outline" size="sm" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[62rem]">
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="pl-4">Product</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Unit Cost</TableHead>
                          <TableHead className="text-right">On-hand</TableHead>
                          <TableHead className="text-right">Reserved</TableHead>
                          <TableHead className="text-right">Available</TableHead>
                          <TableHead className="text-right">Incoming</TableHead>
                          <TableHead className="text-right">In transit</TableHead>
                          <TableHead className="text-right">Damaged</TableHead>
                          <TableHead className="text-right">Reorder Pt.</TableHead>
                          <TableHead className="pr-4 text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map((p) => {
                          const status = getProductStatus(p)
                          return (
                            <TableRow
                              key={p.id}
                              tabIndex={0}
                              role="button"
                              aria-label={`Open details for ${p.sku} — ${p.name}`}
                              onClick={() => openProduct(p.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  openProduct(p.id)
                                }
                              }}
                              className="cursor-pointer"
                            >
                              <TableCell className="pl-4">
                                <div className="font-mono text-xs font-medium">{p.sku}</div>
                                <div className="max-w-52 truncate text-xs text-muted-foreground" title={p.name}>
                                  {p.name}
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="rounded-md border border-stone-500/30 bg-stone-500/10 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 dark:text-stone-300">
                                  {p.category}
                                </span>
                              </TableCell>
                              <TableCell className="text-right tabular">{fmtUSD(p.unitCost, 2)}</TableCell>
                              <TableCell className="text-right"><QuantityPill value={p.onHand} /></TableCell>
                              <TableCell className="text-right"><QuantityPill value={p.reserved} /></TableCell>
                              <TableCell className="text-right font-semibold">
                                <QuantityPill value={p.available} tone="accent" zeroMuted={false} />
                              </TableCell>
                              <TableCell className="text-right">
                                <QuantityPill value={p.incoming} tone={p.incoming > 0 ? 'warn' : 'default'} />
                              </TableCell>
                              <TableCell className="text-right"><QuantityPill value={p.inTransit} /></TableCell>
                              <TableCell className="text-right">
                                <QuantityPill value={p.damaged} tone={p.damaged > 0 ? 'bad' : 'default'} />
                              </TableCell>
                              <TableCell className="text-right">
                                <QuantityPill value={p.reorderPoint} />
                                <span className="ml-1 text-[10px] text-muted-foreground">{p.unit}</span>
                              </TableCell>
                              <TableCell className="pr-4 text-right">
                                <StatusBadge status={status.status} label={status.label} />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.section>
        </>
      )}

      {productDetailId != null && (
        <ProductDetailDialog
          key={productDetailId}
          productId={productDetailId}
          open
          onClose={closeProduct}
        />
      )}

      <NewProductDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        categories={data?.categories ?? []}
      />
    </div>
  )
}
