'use client'

/**
 * StockSense — live market store (Zustand).
 * Holds the latest WebSocket tick per symbol and exposes flash indicators.
 */

import { create } from 'zustand'

export interface LiveQuote {
  p: number // price
  c: number // changePct
  v: number // volume
  t: number // tick time (ms)
}

export interface TickPayload {
  t: number
  ticks: { symbol: string; p: number; c: number; v: number }[]
}

interface MarketState {
  quotes: Record<string, LiveQuote>
  flash: Record<string, 'up' | 'down'>
  connected: boolean
  lastTickAt: number | null
  tickCount: number
  applyTick: (payload: TickPayload) => void
  setConnected: (v: boolean) => void
  clearFlash: (symbol: string) => void
}

export const useMarketStore = create<MarketState>((set, get) => ({
  quotes: {},
  flash: {},
  connected: false,
  lastTickAt: null,
  tickCount: 0,

  applyTick: (payload) => {
    const prev = get().quotes
    const quotes = { ...prev }
    const flash = { ...get().flash }
    let changed = false
    for (const t of payload.ticks) {
      const old = prev[t.symbol]
      quotes[t.symbol] = { p: t.p, c: t.c, v: t.v, t: payload.t }
      if (old && old.p !== t.p) {
        flash[t.symbol] = t.p > old.p ? 'up' : 'down'
        changed = true
      }
    }
    set({ quotes, flash, lastTickAt: payload.t, tickCount: get().tickCount + 1 })
    if (changed) {
      // Clear flash indicators shortly after
      setTimeout(() => {
        const f = { ...get().flash }
        let cleared = false
        for (const t of payload.ticks) {
          if (f[t.symbol]) {
            delete f[t.symbol]
            cleared = true
          }
        }
        if (cleared) set({ flash: f })
      }, 850)
    }
  },

  setConnected: (v) => set({ connected: v }),
  clearFlash: (symbol) => {
    const f = { ...get().flash }
    if (f[symbol]) {
      delete f[symbol]
      set({ flash: f })
    }
  },
}))

/** Convenience selector: live quote for a symbol (or undefined). */
export function useLiveQuote(symbol: string | null | undefined): LiveQuote | undefined {
  return useMarketStore((s) => (symbol ? s.quotes[symbol] : undefined))
}
