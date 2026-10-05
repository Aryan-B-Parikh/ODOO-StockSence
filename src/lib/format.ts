/** StockSense — formatting helpers (inventory domain). */

export function fmtUSD(n: number | null | undefined, dp = 0): string {
  if (n == null || !isFinite(n)) return '—'
  const abs = Math.abs(n)
  return (n < 0 ? '-' : '') + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

export function fmtUSDCompact(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

export function fmtQty(n: number | null | undefined, unit?: string, dp = 0): string {
  if (n == null || !isFinite(n)) return '—'
  const rounded = Math.abs(n % 1) > 0 ? Number(n.toFixed(Math.max(dp, 2))) : n
  const s = rounded.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return unit ? `${s} ${unit}` : s
}

export function fmtSignedQty(n: number | null | undefined, unit?: string): string {
  if (n == null || !isFinite(n)) return '—'
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  const abs = Math.abs(n)
  const s = (Math.abs(abs % 1) > 0 ? Number(abs.toFixed(2)) : abs).toLocaleString('en-US', { maximumFractionDigits: 2 })
  return unit ? `${sign}${s} ${unit}` : `${sign}${s}`
}

export function fmtPct(n: number | null | undefined, dp = 0): string {
  if (n == null || !isFinite(n)) return '—'
  return `${n.toFixed(dp)}%`
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 0) return 'in ' + timeUntil(date)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function timeUntil(date: Date): string {
  const s = Math.floor((date.getTime() - Date.now()) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function timeUntilStr(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return timeUntil(date)
}

export function titleCase(s: string): string {
  return s.replace(/_+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** delta → tailwind text color */
export function deltaColor(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n === 0) return 'text-muted-foreground'
  return n > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'
}
