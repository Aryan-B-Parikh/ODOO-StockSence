'use client'

import type { ComponentType } from 'react'

import { useUIStore } from '@/stores/ui-store'

import { DashboardView } from './dashboard-view'
import { ProductsView } from './products-view'
import { SuppliersView } from './suppliers-view'
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
 * Each view is a self-contained file exporting one NAMED component; add new
 * views by importing them here and adding their key to the map (the key must
 * exist in VIEW_KEYS in the ui-store).
 */
export const VIEW_COMPONENTS: Record<string, ComponentType> = {
  dashboard: DashboardView,
  products: ProductsView,
  suppliers: SuppliersView,
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
