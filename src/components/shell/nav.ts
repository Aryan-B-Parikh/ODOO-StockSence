import {
  ArrowLeftRight,
  Building2,
  ClipboardCheck,
  LayoutDashboard,
  Package,
  ScrollText,
  ShoppingCart,
  Siren,
  SlidersHorizontal,
  Truck,
  ScanLine,
  type LucideIcon,
} from 'lucide-react'

import type { PermissionAction } from '@/lib/permissions'
import type { ViewKey } from '@/stores/ui-store'

export interface NavItem {
  key: ViewKey
  label: string
  icon: LucideIcon
  subtitle: string
  requiredPermission?: PermissionAction
}

/** Sidebar sections — shared by the desktop rail, the mobile sheet and the topbar. */
export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operations',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, subtitle: 'Live overview of stock, value and exceptions' },
      { key: 'products', label: 'Products', icon: Package, subtitle: 'Catalog with split quantities per location' },
      { key: 'suppliers', label: 'Suppliers', icon: Building2, subtitle: 'Vendor directory with lead times, MOQ and reliability' },
      { key: 'receipts', label: 'Receipts', icon: Truck, subtitle: 'Expected and received inbound goods' },
      { key: 'deliveries', label: 'Deliveries', icon: ClipboardCheck, subtitle: 'Customer orders from reservation to dispatch' },
      { key: 'transfers', label: 'Transfers', icon: ArrowLeftRight, subtitle: 'Internal moves between locations' },
      { key: 'adjustments', label: 'Adjustments', icon: SlidersHorizontal, subtitle: 'Count variances with severity routing' },
      { key: 'counts', label: 'Cycle Counts', icon: ScanLine, subtitle: 'Scheduled and ad-hoc stock counts' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { key: 'history', label: 'Move History', icon: ScrollText, subtitle: 'Immutable ledger of every quantity change' },
      {
        key: 'alerts',
        label: 'Alerts & Review',
        icon: Siren,
        subtitle: 'Severity-ranked exceptions and review flags',
        requiredPermission: 'approve-adjustment',
      },
      {
        key: 'reorder',
        label: 'Reorder',
        icon: ShoppingCart,
        subtitle: 'Explainable, supplier-aware purchase suggestions',
        requiredPermission: 'approve-reorder',
      },
    ],
  },
]

export const NAV_BY_VIEW: Record<ViewKey, NavItem> = Object.fromEntries(
  NAV_SECTIONS.flatMap((section) => section.items.map((item) => [item.key, item]))
) as Record<ViewKey, NavItem>

/** Checks whether a set of user permissions can access a given view. */
export function canAccessView(permissions: string[] | undefined, viewKey: ViewKey): boolean {
  const item = NAV_BY_VIEW[viewKey]
  if (!item || !item.requiredPermission) return true
  return Boolean(permissions?.includes(item.requiredPermission))
}
