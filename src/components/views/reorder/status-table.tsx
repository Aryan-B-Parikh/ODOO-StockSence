'use client'

import { useQuery } from '@tanstack/react-query'
import { Boxes } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { fmtQty } from '@/lib/format'
import type { ProductListDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * All products reorder status — the at-a-glance completeness table.
 * Projected available is computed client-side: on-hand + incoming − reserved.
 * Sorted: stockouts first, then below-reorder, then the rest (by SKU).
 */
export function StatusTable() {
  const query = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get<ProductListDTO>('/api/products'),
  })

  const products = [...(query.data?.products ?? [])].sort((a, b) => {
    const rank = (p: (typeof products)[number]) => (p.stockoutRisk ? 0 : p.belowReorder ? 1 : 2)
    return rank(a) - rank(b) || a.sku.localeCompare(b.sku)
  })

  return (
    <section aria-label="All products reorder status">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="size-4 text-primary" aria-hidden="true" />
            All products reorder status
          </CardTitle>
          <CardDescription>
            Projected available = on-hand + incoming − reserved, compared against each reorder point
          </CardDescription>
        </CardHeader>
        <CardContent>
          {query.isPending && (
            <div className="space-y-2" aria-busy="true" aria-label="Loading products">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          )}

          {query.isError && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Couldn&apos;t load the product list — {query.error instanceof Error ? query.error.message : 'try again from the Products view.'}
            </p>
          )}

          {query.isSuccess && (
            <div className="[&_[data-slot=table-container]]:max-h-96 [&_[data-slot=table-container]]:overflow-auto rounded-lg border">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky top-0 z-10 bg-card">SKU</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Product</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-right">On-hand</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-right">Reserved</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-right">Incoming</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-right">Projected</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-right">Reorder point</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => {
                    const projected = p.onHand + p.incoming - p.reserved
                    const status = p.stockoutRisk
                      ? { label: 'Stockout', className: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400' }
                      : p.belowReorder
                        ? { label: 'Below reorder', className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400' }
                        : { label: 'OK', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' }
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs font-medium">{p.sku}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {p.name}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular">
                          {fmtQty(p.onHand, p.unit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular text-muted-foreground">
                          {fmtQty(p.reserved, p.unit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular text-muted-foreground">
                          {fmtQty(p.incoming, p.unit)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono text-xs font-semibold tabular',
                            p.belowReorder && 'text-amber-600'
                          )}
                        >
                          {fmtQty(projected, p.unit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular">
                          {fmtQty(p.reorderPoint, p.unit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={status.className}>
                            {status.label}
                          </Badge>
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
    </section>
  )
}
