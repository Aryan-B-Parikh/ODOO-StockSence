/**
 * StockSense — granular permission model (Phase 0).
 *
 * Permissions are a LIST OF ACTIONS assigned to roles, not a hard-wired pair.
 * Warehouse Staff + Inventory Manager cover the MVP; an Administrator role can
 * be added later without redesigning anything.
 */

export const PERMISSION_ACTIONS = [
  'receive', // post & receive goods receipts
  'pick', // create delivery orders / mark picked
  'pack', // mark deliveries packed (stock physically leaves)
  'transfer', // create & receive internal transfers
  'count', // run cycle counts
  'adjust', // create stock adjustments
  'approve-adjustment', // approve HIGH-severity adjustments
  'approve-reorder', // accept/dismiss reorder suggestions
  'configure', // manage products, suppliers, users, system settings
] as const

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

export const ROLE_LABELS: Record<string, string> = {
  WAREHOUSE_STAFF: 'Warehouse Staff',
  INVENTORY_MANAGER: 'Inventory Manager',
  ADMINISTRATOR: 'Owner / Administrator',
}

export const ROLE_DEFAULTS: Record<string, PermissionAction[]> = {
  WAREHOUSE_STAFF: ['receive', 'pick', 'pack', 'transfer', 'count', 'adjust'],
  INVENTORY_MANAGER: [...PERMISSION_ACTIONS],
  ADMINISTRATOR: [...PERMISSION_ACTIONS],
}

export function hasPermission(permissions: string[], action: PermissionAction): boolean {
  return permissions.includes(action)
}
