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

import type { ViewKey } from '@/stores/ui-store'

export interface NavItem {
  key: ViewKey
  label: string
  icon: LucideIcon
  subtitle: string
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
      { key: 'alerts', label: 'Alerts & Review', icon: Siren, subtitle: 'Severity-ranked exceptions and review flags' },
      { key: 'reorder', label: 'Reorder', icon: ShoppingCart, subtitle: 'Explainable, supplier-aware purchase suggestions' },
    ],
  },
]

export const NAV_BY_VIEW: Record<ViewKey, NavItem> = Object.fromEntries(
  NAV_SECTIONS.flatMap((section) => section.items.map((item) => [item.key, item]))
) as Record<ViewKey, NavItem>
