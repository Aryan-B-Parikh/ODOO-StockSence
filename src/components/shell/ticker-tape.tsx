'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useMarketStore } from '@/stores/market-store'
import { STOCKS } from '@/lib/market/universe'

/** Scrolling ticker tape of all live quotes (updates via WebSocket). */
export function TickerTape() {
  const quotes = useMarketStore((s) => s.quotes)
  const connected = useMarketStore((s) => s.connected)
  const lastTickAt = useMarketStore((s) => s.lastTickAt)
  const [, force] = useState(0)

  // If WS is down, re-render every 15s so REST-refreshed data still moves
  useEffect(() => {
    if (connected) return
    const t = setInterval(() => force((n) => n + 1), 15000)
    return () => clearInterval(t)
  }, [connected])

  const items = STOCKS.map((s) => {
    const live = quotes[s.symbol]
    return {
      symbol: s.symbol,
      price: live?.p,
      changePct: live?.c,
    }
  })

  const render = (item: (typeof items)[number], i: number) => {
    const up = (item.changePct ?? 0) > 0.005
    const down = (item.changePct ?? 0) < -0.005
    return (
      <span key={`${item.symbol}-${i}`} className="mx-4 inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="font-semibold text-foreground/90">{item.symbol}</span>
        <span className="tabular text-foreground/70">
          {item.price != null ? item.price.toFixed(2) : '···'}
        </span>
        <span
          className={cn(
            'tabular text-[11px] font-medium',
            up && 'text-emerald-400',
            down && 'text-red-400',
            !up && !down && 'text-zinc-400',
          )}
        >
          {item.changePct != null ? `${item.changePct > 0 ? '▲' : item.changePct < 0 ? '▼' : '•'} ${Math.abs(item.changePct).toFixed(2)}%` : ''}
        </span>
      </span>
    )
  }

  return (
    <div
      className="marquee-wrap relative overflow-hidden border-b bg-zinc-950 text-[12px] text-zinc-300 dark:bg-zinc-950/60"
      role="marquee"
      aria-label="Live market ticker"
    >
      <div className="animate-marquee flex w-max py-1.5" key={lastTickAt ? Math.floor(lastTickAt / 10000) : 0}>
        {/* Duplicate the list for a seamless loop */}
        <div className="flex">{items.map(render)}</div>
        <div className="flex" aria-hidden>
          {items.map(render)}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-zinc-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-zinc-950 to-transparent" />
    </div>
  )
}
