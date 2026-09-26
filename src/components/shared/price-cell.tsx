'use client'

import { cn } from '@/lib/utils'
import { useMarketStore } from '@/stores/market-store'

interface PriceCellProps {
  symbol: string
  /** Fallback price while no tick has arrived yet */
  basePrice?: number
  className?: string
  /** Show flash background on live change */
  flash?: boolean
}

/** Live price cell driven by the WebSocket market store. */
export function PriceCell({ symbol, basePrice, className, flash = true }: PriceCellProps) {
  const live = useMarketStore((s) => s.quotes[symbol])
  const dir = useMarketStore((s) => s.flash[symbol])
  const price = live?.p ?? basePrice
  return (
    <span
      key={dir ? `${live?.t}-${dir}` : undefined}
      className={cn(
        'inline-block rounded px-1 tabular',
        flash && dir === 'up' && 'flash-up',
        flash && dir === 'down' && 'flash-down',
        className,
      )}
    >
      {price != null
        ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—'}
    </span>
  )
}

/** Live change% pill driven by the WebSocket market store. */
export function LiveChangePct({
  symbol,
  baseChangePct,
  className,
}: {
  symbol: string
  baseChangePct?: number
  className?: string
}) {
  const live = useMarketStore((s) => s.quotes[symbol])
  const pct = live?.c ?? baseChangePct ?? 0
  const up = pct > 0.005
  const down = pct < -0.005
  return (
    <span
      className={cn(
        'tabular font-medium',
        up && 'text-emerald-600 dark:text-emerald-400',
        down && 'text-red-600 dark:text-red-400',
        !up && !down && 'text-muted-foreground',
        className,
      )}
    >
      {pct > 0 ? '+' : ''}
      {pct.toFixed(2)}%
    </span>
  )
}
