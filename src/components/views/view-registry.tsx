'use client'

import type { ComponentType } from 'react'

import { useUIStore } from '@/stores/ui-store'

import { DashboardView } from './dashboard-view'
import { ProductsView } from './products-view'
import { ReceiptsView } from './receipts-view'
import { DeliveriesView } from './deliveries-view'
import { TransfersView } from './transfers-view'
import { AdjustmentsView } from './adjustments-view'
import { CountsView } from './counts-view'
import { HistoryView } from './history-view'
import { AlertsView } from './alerts-view'
import { ReorderView } from './reorder-view'

/**
 * View registry — maps every ui-store view key to its view component.
 *
 * ⚠️ OWNERSHIP NOTE (Task 2 agents):
 * The nine non-dashboard entries currently point at STUB files. Each stub is
 * fully self-contained and must be REPLACED (whole file) by the owning agent:
 *   products-view.tsx, receipts-view.tsx          → Task 2-a
 *   deliveries-view.tsx, transfers-view.tsx,
 *   adjustments-view.tsx                          → Task 2-b
 *   counts-view.tsx, history-view.tsx,
 *   alerts-view.tsx, reorder-view.tsx             → Task 2-c
 * Keep the exact same NAMED export (see each stub's doc comment) and the
 * registry keeps working without any change here.
 */
export const VIEW_COMPONENTS: Record<string, ComponentType> = {
  dashboard: DashboardView,
  products: ProductsView,
  receipts: ReceiptsView,
  deliveries: DeliveriesView,
  transfers: TransfersView,
  adjustments: AdjustmentsView,
  counts: CountsView,
  history: HistoryView,
  alerts: AlertsView,
  reorder: ReorderView,
}

/** Renders the active view. Keyed by view so switching remounts (fresh motion + state). */
export function ActiveView() {
  const view = useUIStore((s) => s.view)
  const View = VIEW_COMPONENTS[view] ?? DashboardView
  return (
    <div key={view}>
      <View />
    </div>
  )
}
