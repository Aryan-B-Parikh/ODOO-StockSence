'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  RotateCcw,
  ScrollText,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { PageHeader } from '@/components/shell/page-header'
import { fadeUp } from '@/components/views/dashboard/motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { deltaColor, fmtDateTime, fmtQty, fmtSignedQty, timeAgo, titleCase } from '@/lib/format'
import type { LedgerEntryDTO, LedgerListDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

import { DocChip, FieldChip } from './history/doc-chip'

const PAGE_SIZE = 25
/** Every docType the ledger can contain — union'd with the server-reported list. */
const KNOWN_DOC_TYPES = ['RECEIPT', 'DELIVERY', 'TRANSFER', 'ADJUSTMENT', 'COUNT', 'OPENING'] as const

interface HistoryFilters {
  docType: string
  q: string
  from: string
  to: string
}

/**
 * Move History — the immutable ledger (the app's crown jewel).
 * GET /api/ledger with filters + offset pagination. The ledger never changes,
 * so there is no auto-refetch — only a manual refresh button.
 */
export function HistoryView() {
  // --- filter state (qInput is debounced into q) ---
  const [docType, setDocType] = useState('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput)
      setOffset(0) // a new search always starts from the first page
    }, 300)
    return () => clearTimeout(t)
  }, [qInput])

  const filters: HistoryFilters = { docType, q: qInput ? q : '', from, to }
  const hasActiveFilters = Boolean(filters.docType || filters.q || filters.from || filters.to)

  const search = (() => {
    const params = new URLSearchParams()
    if (filters.docType) params.set('docType', filters.docType)
    if (filters.q) params.set('q', filters.q)
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(offset))
    return params.toString()
  })()

  const query = useQuery({
    queryKey: ['ledger', filters, offset],
    queryFn: () => api.get<LedgerListDTO>(`/api/ledger?${search}`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false, // immutable — refresh manually
  })

  const data = query.data
  const total = data?.total ?? 0
  const showingFrom = total === 0 ? 0 : offset + 1
  const showingTo = Math.min(offset + PAGE_SIZE, total)
  const docTypeOptions = useMemo(() => {
    const extra = (data?.docTypes ?? []).filter((t) => !KNOWN_DOC_TYPES.includes(t as (typeof KNOWN_DOC_TYPES)[number]))
    return [...KNOWN_DOC_TYPES, ...extra]
  }, [data?.docTypes])

  function clearFilters() {
    setDocType('')
    setQInput('')
    setQ('')
    setFrom('')
    setTo('')
    setOffset(0)
  }

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Move History"
        subtitle="Immutable ledger of every quantity change — nothing is ever edited or deleted"
        icon={<ScrollText className="size-5" />}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RotateCcw className={cn('size-3.5', query.isFetching && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <motion.div variants={fadeUp} initial="hidden" animate="visible">
        <div
          role="note"
          className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-sm text-muted-foreground"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p>
            <span className="font-medium text-foreground">Immutable audit trail</span> — every entry references
            the document it came from, with previous and new quantities. Click a row for the full detail.
          </p>
        </div>
      </motion.div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={docType || 'all'}
          onValueChange={(v) => {
            setDocType(v === 'all' ? '' : v)
            setOffset(0)
          }}
        >
          <SelectTrigger size="sm" className="w-[150px]" aria-label="Filter by document type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {docTypeOptions.map((t) => (
              <SelectItem key={t} value={t}>
                {titleCase(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search code, document, SKU or reason…"
            className="h-8 pl-8 text-sm"
            aria-label="Search ledger entries"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setOffset(0)
            }}
            className="h-8 w-[140px] text-sm"
            aria-label="From date"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setOffset(0)
            }}
            className="h-8 w-[140px] text-sm"
            aria-label="To date"
          />
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="size-3.5" aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>

      {/* Ledger table */}
      {query.isPending && <HistorySkeleton />}

      {query.isError && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="font-semibold">Ledger unavailable</p>
            <p className="text-sm text-muted-foreground">
              {query.error instanceof Error ? query.error.message : 'Could not load the ledger.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              <RotateCcw className="size-3.5" aria-hidden="true" /> Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {query.isSuccess && data && (
        <motion.div variants={fadeUp} initial="hidden" animate="visible">
          <Card className="gap-0 py-0">
            {/* single scroll container for both axes — sticky header sticks to it */}
            <div className="overflow-hidden rounded-xl">
              <div className="[&_[data-slot=table-container]]:max-h-[65vh] [&_[data-slot=table-container]]:overflow-auto">
                <Table className="min-w-[1080px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="sticky top-0 z-10 w-9 bg-card" aria-label="Expand" />
                      <TableHead className="sticky top-0 z-10 bg-card">Entry</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">Document</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">When</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">Product</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">Location</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">Field</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">Change</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">Reason</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-card">By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.entries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="py-12 text-center">
                          <p className="text-sm font-medium">No ledger entries match these filters</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Every quantity change in the warehouse is recorded here — try clearing the filters.
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.entries.map((entry) => (
                        <LedgerRow
                          key={entry.id}
                          entry={entry}
                          expanded={expanded.has(entry.id)}
                          onToggle={() => toggleExpanded(entry.id)}
                        />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2.5">
              <p className="text-xs text-muted-foreground">
                Showing <span className="font-medium text-foreground tabular">{showingFrom}</span>–
                <span className="font-medium text-foreground tabular">{showingTo}</span> of{' '}
                <span className="font-medium text-foreground tabular">{total.toLocaleString('en-US')}</span> entries
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0 || query.isPlaceholderData}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="size-3.5" aria-hidden="true" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= total || query.isPlaceholderData}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next <ChevronRight className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  )
}

/** One ledger row + its expandable detail row. */
function LedgerRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: LedgerEntryDTO
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <TableRow
        onClick={onToggle}
        className="cursor-pointer"
        data-state={expanded ? 'open' : undefined}
      >
        <TableCell className="text-muted-foreground">
          <ChevronDown
            className={cn('size-4 transition-transform', expanded && 'rotate-180 text-primary')}
            aria-hidden="true"
          />
        </TableCell>
        <TableCell className="font-mono text-xs font-medium" title={entry.code}>
          {entry.code}
        </TableCell>
        <TableCell>
          <div className="flex flex-col items-start gap-0.5">
            <DocChip docType={entry.docType} docCode={entry.docCode} />
            <span className="text-[10px] text-muted-foreground">{titleCase(entry.docType)}</span>
          </div>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="tabular">{timeAgo(entry.createdAt)}</span>
            </TooltipTrigger>
            <TooltipContent>{fmtDateTime(entry.createdAt)}</TooltipContent>
          </Tooltip>
        </TableCell>
        <TableCell>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[170px] cursor-help">
                <div className="truncate font-mono text-xs font-medium">{entry.sku}</div>
                <div className="truncate text-[11px] text-muted-foreground">{entry.productName}</div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {entry.sku} — {entry.productName}
            </TooltipContent>
          </Tooltip>
        </TableCell>
        <TableCell>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block max-w-[190px] cursor-help truncate text-xs text-muted-foreground">
                {entry.locationPath}
              </span>
            </TooltipTrigger>
            <TooltipContent>{entry.locationPath}</TooltipContent>
          </Tooltip>
        </TableCell>
        <TableCell>
          <FieldChip field={entry.field} />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5 font-mono text-xs tabular">
            <span className="text-muted-foreground">{fmtQty(entry.prevQty)}</span>
            <span aria-hidden="true" className="text-muted-foreground">→</span>
            <span className="font-semibold">{fmtQty(entry.newQty)}</span>
            <span className={cn('font-semibold', deltaColor(entry.diff))}>
              {fmtSignedQty(entry.diff, entry.unit)}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block max-w-[210px] cursor-help truncate text-xs text-muted-foreground">
                {entry.reason ?? '—'}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs whitespace-normal text-left">
              {entry.reason ?? 'No reason recorded'}
            </TooltipContent>
          </Tooltip>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {entry.performedByName ?? 'System'}
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={10} className="px-4 py-3">
            <div className="grid gap-3 rounded-lg border bg-card p-3.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <DetailBlock label="Full reason">
                <p className="whitespace-normal leading-relaxed">{entry.reason ?? 'No reason recorded'}</p>
              </DetailBlock>
              <DetailBlock label="Performed by">
                <p>{entry.performedByName ?? 'System'}</p>
                <p className="mt-1 text-muted-foreground">{entry.locationPath}</p>
              </DetailBlock>
              <DetailBlock label="Timestamps">
                <p>
                  <span className="text-muted-foreground">Recorded: </span>
                  {fmtDateTime(entry.createdAt)}
                </p>
                <p className="mt-1 text-muted-foreground">{timeAgo(entry.createdAt)}</p>
              </DetailBlock>
              <DetailBlock label="Entry & document">
                <p className="font-mono">{entry.code}</p>
                <p className="mt-1">
                  <DocChip docType={entry.docType} docCode={entry.docCode} />
                </p>
              </DetailBlock>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="text-foreground">{children}</div>
    </div>
  )
}

function HistorySkeleton() {
  return (
    <Card className="gap-0 py-0" aria-busy="true" aria-label="Loading ledger">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Skeleton className="h-8 w-[150px]" />
        <Skeleton className="h-8 flex-1 max-w-sm" />
        <Skeleton className="h-8 w-[140px]" />
        <Skeleton className="h-8 w-[140px]" />
      </div>
      <div className="space-y-2 p-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </Card>
  )
}
