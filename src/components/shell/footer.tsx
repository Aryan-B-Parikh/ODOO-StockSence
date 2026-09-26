'use client'

import { useMarketStore } from '@/stores/market-store'

/** Sticky footer with disclaimer + connection status. */
export function AppFooter() {
  const connected = useMarketStore((s) => s.connected)
  const tickCount = useMarketStore((s) => s.tickCount)
  return (
    <footer className="mt-auto border-t bg-background/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-semibold text-foreground/70">StockSense</span> — AI-powered market
          intelligence demo. All market data is <span className="font-medium">simulated</span> and
          AI content is generated; nothing here is financial advice.
        </p>
        <p className="flex items-center gap-3">
          <span className="tabular">{tickCount.toLocaleString()} ticks received</span>
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500 pulse-dot' : 'bg-red-500'}`}
              aria-hidden
            />
            {connected ? 'Streaming' : 'Reconnecting…'}
          </span>
        </p>
      </div>
    </footer>
  )
}
