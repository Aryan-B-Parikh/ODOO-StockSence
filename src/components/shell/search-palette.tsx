'use client'

import { useEffect, useState } from 'react'
import { useUIStore, VIEW_LABELS } from '@/stores/ui-store'
import { api } from '@/lib/api'
import type { SearchResultDTO } from '@/lib/types'
import { StockAvatar } from '@/components/shared/stock-avatar'
import { LiveChangePct } from '@/components/shared/price-cell'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  LayoutDashboard,
  LineChart,
  Newspaper,
  Briefcase,
  Star,
  Sparkles,
  Search,
} from 'lucide-react'

const VIEW_ICONS: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard className="h-4 w-4" />,
  markets: <LineChart className="h-4 w-4" />,
  news: <Newspaper className="h-4 w-4" />,
  portfolio: <Briefcase className="h-4 w-4" />,
  watchlist: <Star className="h-4 w-4" />,
  analyst: <Sparkles className="h-4 w-4" />,
}

/** ⌘K global search palette: stock search + quick navigation. */
export function SearchPalette() {
  const { searchOpen, setSearchOpen, openStock, setView } = useUIStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultDTO[]>([])
  const [loading, setLoading] = useState(false)

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(!useUIStore.getState().searchOpen)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setSearchOpen])

  // Debounced search
  useEffect(() => {
    if (!searchOpen) return
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const data = await api.get<{ results: SearchResultDTO[] }>(
          `/api/search?q=${encodeURIComponent(query)}`,
        )
        setResults(data.results)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => clearTimeout(timer)
  }, [query, searchOpen])

  const selectStock = (symbol: string) => {
    openStock(symbol)
    setSearchOpen(false)
    setQuery('')
  }

  const selectView = (v: keyof typeof VIEW_LABELS) => {
    setView(v)
    setSearchOpen(false)
  }

  return (
    <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
      <CommandInput
        placeholder="Search stocks (symbol or company) or jump to a view…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {loading ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Searching…</div>
        ) : (
          <>
            <CommandEmpty>No results found.</CommandEmpty>
            {results.length > 0 && (
              <CommandGroup heading="Stocks">
                {results.map((r) => (
                  <CommandItem
                    key={r.symbol}
                    value={`${r.symbol} ${r.name}`}
                    onSelect={() => selectStock(r.symbol)}
                    className="cursor-pointer"
                  >
                    <StockAvatar symbol={r.symbol} size="sm" />
                    <span className="font-semibold">{r.symbol}</span>
                    <span className="truncate text-muted-foreground">{r.name}</span>
                    <span className="ml-auto flex items-center gap-2 tabular">
                      <span className="text-sm font-medium">
                        ${r.price?.toFixed(2) ?? '—'}
                      </span>
                      <LiveChangePct symbol={r.symbol} baseChangePct={r.changePct} />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup heading="Navigate">
              {(Object.keys(VIEW_LABELS) as (keyof typeof VIEW_LABELS)[]).map((v) => (
                <CommandItem key={v} value={`go to ${VIEW_LABELS[v]}`} onSelect={() => selectView(v)} className="cursor-pointer">
                  <span className="text-muted-foreground">{VIEW_ICONS[v]}</span>
                  {VIEW_LABELS[v]}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Tip">
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                <Search className="h-3 w-3" />
                Press <kbd className="rounded border bg-muted px-1">⌘K</kbd> anytime to search.
              </div>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
