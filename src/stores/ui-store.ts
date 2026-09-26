'use client'

/**
 * StockSense — UI navigation store (Zustand).
 * The stock detail dialog & trade dialog are mounted once at the root and
 * controlled through this store, so any view can open them.
 */

import { create } from 'zustand'

export type ViewKey = 'dashboard' | 'markets' | 'news' | 'portfolio' | 'watchlist' | 'analyst'

interface UIState {
  activeView: ViewKey
  selectedSymbol: string | null
  detailOpen: boolean
  tradeSymbol: string | null
  tradeOpen: boolean
  searchOpen: boolean
  setView: (v: ViewKey) => void
  openStock: (symbol: string) => void
  closeStock: () => void
  openTrade: (symbol: string | null) => void
  closeTrade: () => void
  setSearchOpen: (v: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeView: 'dashboard',
  selectedSymbol: null,
  detailOpen: false,
  tradeSymbol: null,
  tradeOpen: false,
  searchOpen: false,

  setView: (v) => set({ activeView: v }),
  openStock: (symbol) => set({ selectedSymbol: symbol, detailOpen: true }),
  closeStock: () => set({ detailOpen: false }),
  openTrade: (symbol) => set({ tradeSymbol: symbol, tradeOpen: true }),
  closeTrade: () => set({ tradeOpen: false }),
  setSearchOpen: (v) => set({ searchOpen: v }),
}))

export const VIEW_LABELS: Record<ViewKey, string> = {
  dashboard: 'Dashboard',
  markets: 'Markets',
  news: 'News',
  portfolio: 'Portfolio',
  watchlist: 'Watchlist',
  analyst: 'AI Analyst',
}
