'use client'

import { cn } from '@/lib/utils'
import { avatarColor } from '@/lib/format'

interface StockAvatarProps {
  symbol: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZES = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
  xl: 'h-12 w-12 text-base',
}

/** Circular stock "logo" with deterministic color + symbol initials. */
export function StockAvatar({ symbol, size = 'md', className }: StockAvatarProps) {
  const initials = symbol.includes('.')
    ? symbol.split('.')[0].slice(0, 2)
    : symbol.slice(0, 2)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold tracking-tight',
        avatarColor(symbol),
        SIZES[size],
        className,
      )}
      aria-label={symbol}
    >
      {initials}
    </span>
  )
}
