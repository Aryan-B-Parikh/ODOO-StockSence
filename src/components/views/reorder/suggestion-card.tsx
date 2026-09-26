'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Check, PackageCheck, ShoppingCart, Truck, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { fadeUp } from '@/components/views/dashboard/motion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { api } from '@/lib/api'
import { fmtQty, timeAgo } from '@/lib/format'
import type { ReorderSuggestionDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

/**
 * A PENDING reorder suggestion — Phase 3's showpiece. Every suggestion
 * explains itself: quantities, reorder-point math, the supplier-aware
 * suggested quantity, and the plain-language reason block.
 */
export function SuggestionCard({ suggestion }: { suggestion: ReorderSuggestionDTO }) {
  const queryClient = useQueryClient()
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [dismissOpen, setDismissOpen] = useState(false)

  const canDecide = (useAuthStore((s) => s.user?.permissions ?? [])).includes('approve-reorder')

  const acceptMutation = useMutation({
    mutationFn: () => api.post<{ suggestion: ReorderSuggestionDTO }>(`/api/reorder/${suggestion.id}/accept`),
    onSuccess: (res) => {
      toast.success(
        res.suggestion.receiptCode
          ? `Receipt ${res.suggestion.receiptCode} created — incoming stock updated`
          : 'Receipt created — incoming stock updated'
      )
      setAcceptOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['reorder'] })
      void queryClient.invalidateQueries({ queryKey: ['receipts'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['attention'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const dismissMutation = useMutation({
    mutationFn: () => api.post<{ suggestion: ReorderSuggestionDTO }>(`/api/reorder/${suggestion.id}/dismiss`),
    onSuccess: () => {
      toast.success(`Suggestion for ${suggestion.sku} dismissed — it reappears in 7 days if still needed`)
      setDismissOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['reorder'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['attention'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  // Progress of projected available against the reorder point.
  const reorderRatio =
    suggestion.reorderPoint > 0
      ? Math.min(100, Math.round((suggestion.projectedAvailable / suggestion.reorderPoint) * 100))
      : 100
  const belowPoint = suggestion.projectedAvailable < suggestion.reorderPoint

  return (
    <motion.div variants={fadeUp}>
      <Card className="gap-4">
        <CardHeader className="gap-2">
          {/* Header row: product identity + the order headline */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{suggestion.sku}</span>
                <span className="truncate text-sm text-muted-foreground">{suggestion.productName}</span>
                <Badge variant="outline" className="border-stone-500/30 bg-stone-500/10 text-stone-600 dark:text-stone-300">
                  {suggestion.category}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Truck className="size-3.5" aria-hidden="true" />
                  {suggestion.preferredName} · {suggestion.preferredLeadDays}-day lead
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  MOQ {fmtQty(suggestion.minOrderQty, suggestion.unit)} · multiple{' '}
                  {fmtQty(suggestion.orderMultiple, suggestion.unit)}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold tracking-tight text-emerald-600 tabular">
                Order {fmtQty(suggestion.suggestedQty, suggestion.unit)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                suggested by the engine · created {timeAgo(suggestion.createdAt)}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* The full reason block — the plan-style 4-line explanation. */}
          <div className="rounded-lg border-l-4 border-emerald-500 bg-muted/50 px-4 py-3">
            <p className="whitespace-pre-line font-mono text-xs leading-relaxed text-foreground">
              {suggestion.reason}
            </p>
          </div>

          {/* Stat chips + progress */}
          <div className="flex flex-wrap items-stretch gap-2">
            <StatChip label="On-hand" value={fmtQty(suggestion.onHand, suggestion.unit)} />
            <StatChip label="Reserved" value={fmtQty(suggestion.reserved, suggestion.unit)} />
            <StatChip label="Incoming" value={fmtQty(suggestion.incoming, suggestion.unit)} />
            <StatChip
              label="Projected available"
              value={fmtQty(suggestion.projectedAvailable, suggestion.unit)}
              valueClass={belowPoint ? 'text-amber-600' : 'text-emerald-600'}
            />
            <StatChip label="Reorder point" value={fmtQty(suggestion.reorderPoint, suggestion.unit)} />
            <StatChip label="Daily usage" value={fmtQty(suggestion.dailyUsage, `${suggestion.unit}/day`)} />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Projected {fmtQty(suggestion.projectedAvailable, suggestion.unit)} vs reorder point{' '}
                {fmtQty(suggestion.reorderPoint, suggestion.unit)}
              </span>
              <span className={cn('font-semibold tabular', belowPoint ? 'text-amber-600' : 'text-emerald-600')}>
                {reorderRatio}% covered
              </span>
            </div>
            <Progress
              value={reorderRatio}
              aria-label="Projected available vs reorder point"
              className={cn('h-2 bg-muted', belowPoint && '[&_[data-slot=progress-indicator]]:bg-amber-500')}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <PackageCheck className="size-3.5 shrink-0" aria-hidden="true" />
              Accepting opens an expected receipt — units count as incoming until they arrive.
            </p>
            {canDecide ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setDismissOpen(true)} disabled={dismissMutation.isPending}>
                  <X className="size-3.5" aria-hidden="true" />
                  Dismiss
                </Button>
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => setAcceptOpen(true)}
                  disabled={acceptMutation.isPending}
                >
                  <ShoppingCart className="size-3.5" aria-hidden="true" />
                  Accept → create receipt
                </Button>
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground">Deciding requires the “approve-reorder” permission.</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Accept confirm */}
      <AlertDialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Create a receipt for {fmtQty(suggestion.suggestedQty, suggestion.unit)} of {suggestion.productName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Accepting creates an expected receipt {fmtQty(suggestion.suggestedQty, suggestion.unit)} from{' '}
              {suggestion.preferredName} — its units raise “incoming” until received.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={(e) => {
                e.preventDefault()
                acceptMutation.mutate()
              }}
            >
              {acceptMutation.isPending ? 'Creating…' : 'Accept & create receipt'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dismiss confirm */}
      <AlertDialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss the suggestion for {suggestion.sku}?</AlertDialogTitle>
            <AlertDialogDescription>
              Dismissed suggestions reappear after 7 days if still below the reorder point.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); dismissMutation.mutate() }}>
              {dismissMutation.isPending ? 'Dismissing…' : 'Dismiss suggestion'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}

function StatChip({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex min-w-[104px] flex-col gap-0.5 rounded-lg border bg-muted/30 px-3 py-2">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className={cn('text-sm font-semibold tabular', valueClass)}>{value}</span>
    </div>
  )
}

/** Empty state when no PENDING suggestions exist. */
export function SuggestionsEmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
      <Check className="size-6 text-emerald-600" aria-hidden="true" />
      <p className="text-sm font-medium">No reorder suggestions — all stock is above its reorder point 🎉</p>
      <p className="text-xs text-muted-foreground">
        The engine re-checks projected available stock against reorder points on every visit.
      </p>
    </div>
  )
}
