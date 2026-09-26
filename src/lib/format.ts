/**
 * StockSense — formatting helpers
 */

export function fmtUSD(n: number | null | undefined, dp = 2): string {
  if (n == null || !isFinite(n)) return '—'
  const abs = Math.abs(n)
  return (n < 0 ? '-' : '') + '$' + abs.toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
}

export function fmtSignedUSD(n: number | null | undefined, dp = 2): string {
  if (n == null || !isFinite(n)) return '—'
  return (n > 0 ? '+' : n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
}

export function fmtPct(n: number | null | undefined, signed = true): string {
  if (n == null || !isFinite(n)) return '—'
  const s = n.toFixed(2) + '%'
  return signed && n > 0 ? '+' + s : s
}

export function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n == null || !isFinite(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(0)
}

export function fmtMarketCap(billions: number | null | undefined): string {
  if (billions == null || !isFinite(billions)) return '—'
  if (billions >= 1000) return '$' + (billions / 1000).toFixed(2) + 'T'
  return '$' + billions.toFixed(1) + 'B'
}

export function timeAgo(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Text color class for a percent change value. */
export function priceColor(n: number): string {
  if (n > 0.005) return 'text-emerald-600 dark:text-emerald-400'
  if (n < -0.005) return 'text-red-600 dark:text-red-400'
  return 'text-muted-foreground'
}

export function priceBg(n: number): string {
  if (n > 0.005) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  if (n < -0.005) return 'bg-red-500/10 text-red-600 dark:text-red-400'
  return 'bg-muted text-muted-foreground'
}

/** Deterministic soft color palette (no blue/indigo) for stock avatars. */
const AVATAR_COLORS = [
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-lime-500/15 text-lime-700 dark:text-lime-300',
  'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  'bg-stone-500/15 text-stone-700 dark:text-stone-300',
]

export function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
