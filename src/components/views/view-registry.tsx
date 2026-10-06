'use client'

import { ShieldAlert } from 'lucide-react'
import type { ComponentType } from 'react'

import { canAccessView } from '@/components/shell/nav'
import { useAuthStore } from '@/stores/auth-store'
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
import { UsersView } from './users-view'

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
  users: UsersView,
}

function AccessDeniedView() {
  const setView = useUIStore((s) => s.setView)
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-destructive/20 bg-destructive/5 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldAlert className="size-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Access Restricted</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          You do not have permission to view or manage this module. Please switch to an authorized account.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setView('dashboard')}
        className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 cursor-pointer"
      >
        Return to Dashboard
      </button>
    </div>
  )
}

/** Renders the active view. Keyed by view so switching remounts (fresh motion + state). */
export function ActiveView() {
  const view = useUIStore((s) => s.view)
  const user = useAuthStore((s) => s.user)

  if (!canAccessView(user ?? undefined, view)) {
    return <AccessDeniedView />
  }

  const View = VIEW_COMPONENTS[view] ?? DashboardView
  return (
    <div key={view}>
      <View />
    </div>
  )
}
