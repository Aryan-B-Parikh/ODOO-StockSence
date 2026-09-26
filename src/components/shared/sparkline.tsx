'use client'

import { cn } from '@/lib/utils'
import { useId } from 'react'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  /** Override trend detection; defaults to last >= first */
  positive?: boolean
  className?: string
  showArea?: boolean
}

/** Lightweight inline SVG sparkline (no chart lib overhead). */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  positive,
  className,
  showArea = true,
}: SparklineProps) {
  const gid = useId().replace(/[:]/g, '')
  if (!data || data.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden />
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 2
  const stepX = (width - pad * 2) / (data.length - 1)

  const pts = data.map((v, i) => {
    const x = pad + i * stepX
    const y = height - pad - ((v - min) / range) * (height - pad * 2)
    return [x, y] as const
  })

  const isPositive = positive ?? data[data.length - 1] >= data[0]
  const stroke = isPositive ? 'var(--color-chart-1)' : 'var(--color-chart-2)'
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`
  const last = pts[pts.length - 1]

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      aria-hidden
    >
      {showArea && (
        <>
          <defs>
            <linearGradient id={`sg-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={isPositive ? 0.28 : 0.26} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#sg-${gid})`} />
        </>
      )}
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={1.8} fill={stroke} />
    </svg>
  )
}
