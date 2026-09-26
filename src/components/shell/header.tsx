'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'
import { useUIStore, VIEW_LABELS, type ViewKey } from '@/stores/ui-store'
import { useMarketStore } from '@/stores/market-store'
import { LivePill } from '@/components/shared/badges'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from 'next-themes'
import {
  CandlestickChart,
  Search,
  Sun,
  Moon,
  LayoutDashboard,
  LineChart,
  Newspaper,
  Briefcase,
  Star,
  Sparkles,
} from 'lucide-react'

const NAV_ITEMS: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: 'markets', label: 'Markets', icon: <LineChart className="h-4 w-4" /> },
  { key: 'news', label: 'News', icon: <Newspaper className="h-4 w-4" /> },
  { key: 'portfolio', label: 'Portfolio', icon: <Briefcase className="h-4 w-4" /> },
  { key: 'watchlist', label: 'Watchlist', icon: <Star className="h-4 w-4" /> },
  { key: 'analyst', label: 'AI Analyst', icon: <Sparkles className="h-4 w-4" /> },
]

function Clock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const update = () =>
      setTime(
        new Date().toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
      )
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:inline-flex" aria-label="Current time in IST">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-dot" aria-hidden />
      <span className="tabular font-medium">{time}</span>
      <span className="text-[10px] opacity-70">IST</span>
    </span>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  // Hydration-safe mounted flag (server snapshot false, client true)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
    >
      {mounted && theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}

/** Top application header: brand, nav (desktop), search, live pill, clock, theme. */
export function AppHeader() {
  const { activeView, setView, setSearchOpen } = useUIStore()
  const connected = useMarketStore((s) => s.connected)

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3">
        {/* Brand */}
        <button
          className="flex items-center gap-2"
          onClick={() => setView('dashboard')}
          aria-label="StockSense home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <CandlestickChart className="h-5 w-5" aria-hidden />
          </span>
          <span className="hidden flex-col items-start leading-none sm:flex">
            <span className="text-[15px] font-bold tracking-tight">StockSense</span>
            <span className="text-[10px] font-medium text-muted-foreground">AI Market Intelligence</span>
          </span>
        </button>

        {/* Desktop nav */}
        <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                activeView === item.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              aria-current={activeView === item.key ? 'page' : undefined}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Clock />
          <LivePill connected={connected} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSearchOpen(true)}
            className="h-8 gap-2 text-muted-foreground"
            aria-label="Search stocks (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="pointer-events-none hidden rounded border bg-muted px-1 font-mono text-[10px] md:inline">
              ⌘K
            </kbd>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

/** Mobile bottom navigation bar (fixed, respects safe area). */
export function MobileNav() {
  const { activeView, setView } = useUIStore()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden"
      aria-label="Primary mobile"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-6">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => setView(item.key)}
            className={cn(
              'flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors',
              activeView === item.key ? 'text-primary' : 'text-muted-foreground',
            )}
            aria-current={activeView === item.key ? 'page' : undefined}
          >
            {item.icon}
            {item.label === 'AI Analyst' ? 'AI' : item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
