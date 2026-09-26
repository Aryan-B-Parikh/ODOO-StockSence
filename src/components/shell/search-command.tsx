'use client'

import { useQuery } from '@tanstack/react-query'
import { Package, SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { SearchResultDTO } from '@/lib/types'
import { useUIStore } from '@/stores/ui-store'

/**
 * Global product search (topbar). Popover + Command, debounced GET /api/search?q=.
 * Picking a result calls openProduct(id) → Products view + detail dialog.
 */
export function SearchCommand() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const openProduct = useUIStore((s) => s.openProduct)

  // debounce the query
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  // ⌘K / Ctrl+K opens & closes the search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<{ results: SearchResultDTO[] }>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.length > 0,
    staleTime: 30_000,
  })

  const results = data?.results ?? []

  const pick = (result: SearchResultDTO) => {
    setOpen(false)
    setQuery('')
    setDebounced('')
    openProduct(result.id)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setQuery('')
          setDebounced('')
        }
      }}
    >
      {/* desktop trigger */}
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Search products"
          className="hidden h-9 w-52 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:flex lg:w-72"
        >
          <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate text-left">Search products…</span>
          <kbd className="pointer-events-none rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>
      </PopoverTrigger>
      {/* mobile trigger */}
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 sm:hidden" aria-label="Search products">
          <SearchIcon className="size-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0" aria-describedby={undefined}>
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search by SKU or name…"
          />
          <CommandList>
            {isFetching && (
              <div className="space-y-2 p-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}
            {!isFetching && debounced.length > 0 && results.length === 0 && (
              <CommandEmpty>No products match “{debounced}”.</CommandEmpty>
            )}
            {debounced.length === 0 && (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                Type to search products by SKU or name
              </div>
            )}
            {results.length > 0 && (
              <CommandGroup heading="Products">
                {results.map((result) => (
                  <CommandItem
                    key={result.id}
                    value={`${result.sku} ${result.name}`}
                    onSelect={() => pick(result)}
                  >
                    <Package className="size-4 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-medium">{result.sku}</span>
                        <span className="truncate text-xs text-muted-foreground">{result.name}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {result.onHand} on hand · {result.available} available
                      </div>
                    </div>
                    {result.belowReorder && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
                      >
                        reorder
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
