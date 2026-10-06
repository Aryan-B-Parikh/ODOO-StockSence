'use client'

import { create } from 'zustand'

export const VIEW_KEYS = [
  'dashboard',
  'products',
  'suppliers',
  'receipts',
  'deliveries',
  'transfers',
  'adjustments',
  'counts',
  'history',
  'alerts',
  'reorder',
  'users',
] as const

export type ViewKey = (typeof VIEW_KEYS)[number]

export function isViewKey(v: string): v is ViewKey {
  return (VIEW_KEYS as readonly string[]).includes(v)
}

interface UIState {
  view: ViewKey
  setView: (view: ViewKey) => void
  /** Product detail dialog target (consumed by the Products view). */
  productDetailId: number | null
  /** Opens a product detail and navigates to the Products view. */
  openProduct: (id: number) => void
  closeProduct: () => void
  /** Optional meta side-panel (forms reference data) — used by Task 2 views. */
  metaPanelOpen: boolean
  setMetaPanelOpen: (open: boolean) => void
}

function syncHash(view: ViewKey) {
  if (typeof window === 'undefined') return
  const target = `#view=${view}`
  if (window.location.hash !== target) {
    window.history.replaceState(null, '', target)
  }
}

export const useUIStore = create<UIState>((set) => ({
  view: 'dashboard',
  setView: (view) => {
    set({ view })
    syncHash(view)
  },
  productDetailId: null,
  openProduct: (id) => {
    set({ productDetailId: id, view: 'products' })
    syncHash('products')
  },
  closeProduct: () => set({ productDetailId: null }),
  metaPanelOpen: false,
  setMetaPanelOpen: (open) => set({ metaPanelOpen: open }),
}))

/**
 * Deep-link support: parse `#view=xxx` on mount and follow hashchange events
 * (e.g. browser back/forward). Returns a cleanup fn — call from an effect.
 */
export function initUiHashSync(): () => void {
  if (typeof window === 'undefined') return () => {}
  const apply = () => {
    const match = window.location.hash.match(/^#view=([a-z-]+)/)
    const v = match?.[1]
    if (v && isViewKey(v) && useUIStore.getState().view !== v) {
      useUIStore.setState({ view: v })
    }
  }
  apply()
  window.addEventListener('hashchange', apply)
  return () => window.removeEventListener('hashchange', apply)
}
