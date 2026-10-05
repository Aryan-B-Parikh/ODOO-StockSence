'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail,
  RefreshCw,
  Send,
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface StoredEmail {
  id: string
  to: string | string[]
  subject: string
  html: string
  text: string
  timestamp: string
}

export function MailInboxSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery<{ count: number; emails: StoredEmail[] }>({
    queryKey: ['mail-inbox'],
    queryFn: async () => {
      const res = await fetch('/api/mail/inbox')
      if (!res.ok) throw new Error('Failed to load email log')
      return res.json()
    },
    enabled: open,
    refetchInterval: open ? 5000 : false,
  })

  const lowStockMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/mail/low-stock', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to trigger scan')
      return res.json()
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Low-stock evaluation complete', {
        description: `Dispatched alerts for ${data.lowStockCount || 0} product(s).`,
      })
      refetch()
    },
    onError: (err: unknown) => {
      toast.error('Trigger failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    },
  })

  const digestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/mail/digest', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to dispatch shift digest')
      return res.json()
    },
    onSuccess: (data) => {
      toast.success('Daily shift digest dispatched', {
        description: `Dispatched to: ${(data.recipients || []).join(', ')}`,
      })
      refetch()
    },
    onError: (err: unknown) => {
      toast.error('Dispatch failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    },
  })

  const emails = data?.emails ?? []

  const getBadge = (subject: string) => {
    if (subject.includes('LOW-STOCK')) {
      return { label: 'LOW-STOCK', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' }
    }
    if (subject.includes('Password Reset') || subject.includes('OTP')) {
      return { label: 'AUTH OTP', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30' }
    }
    if (subject.includes('DISPATCH') || subject.includes('Order')) {
      return { label: 'DISPATCH', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' }
    }
    if (subject.includes('GOODS RECEIPT') || subject.includes('GRN')) {
      return { label: 'VENDOR GRN', className: 'bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30' }
    }
    if (subject.includes('DIGEST')) {
      return { label: 'SHIFT DIGEST', className: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30' }
    }
    return { label: 'EMAIL', className: 'bg-stone-500/15 text-stone-700 dark:text-stone-400 border-stone-500/30' }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-lg p-0 gap-0">
        <SheetHeader className="p-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Mail className="size-4" />
              </span>
              <div>
                <SheetTitle className="text-base font-semibold leading-tight">
                  Notification Hub & Audit
                </SheetTitle>
                <SheetDescription className="text-xs">
                  Inspect outbound email dispatches & trigger automated workflows
                </SheetDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => refetch()}
              title="Refresh log"
            >
              <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
            </Button>
          </div>

          {/* Quick Triggers */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={lowStockMutation.isPending}
              onClick={() => lowStockMutation.mutate()}
              className="h-8 text-xs border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300"
            >
              <AlertTriangle className="size-3 mr-1.5 text-amber-500" />
              Scan Low-Stock
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={digestMutation.isPending}
              onClick={() => digestMutation.mutate()}
              className="h-8 text-xs border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300"
            >
              <Calendar className="size-3 mr-1.5 text-emerald-500" />
              Send Shift Digest
            </Button>
          </div>
        </SheetHeader>

        {/* List of Emails */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && emails.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
              Loading email dispatch records…
            </div>
          ) : emails.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No emails dispatched yet. Trigger an action above or perform a delivery/receipt.
            </div>
          ) : (
            emails.map((e) => {
              const badge = getBadge(e.subject)
              const isExpanded = expandedId === e.id
              const recipientStr = Array.isArray(e.to) ? e.to.join(', ') : e.to

              return (
                <div
                  key={e.id}
                  className="rounded-lg border bg-card p-3 shadow-xs hover:border-emerald-500/30 transition-all text-xs space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border',
                        badge.className
                      )}
                    >
                      {badge.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                      <Clock className="size-2.5" />
                      {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-semibold text-foreground text-xs leading-snug">{e.subject}</h4>
                    <p className="text-muted-foreground text-[11px] truncate mt-0.5">
                      To: <span className="font-mono text-foreground/80">{recipientStr}</span>
                    </p>
                  </div>

                  <div className="pt-1 flex items-center justify-between border-t border-border/50">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : e.id)}
                      className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      {isExpanded ? (
                        <>
                          Hide preview <ChevronUp className="size-3" />
                        </>
                      ) : (
                        <>
                          View body <ChevronDown className="size-3" />
                        </>
                      )}
                    </button>
                    <span className="text-[10px] text-muted-foreground">Console / SMTP Dispatched</span>
                  </div>

                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t text-[11px] bg-muted/40 p-2.5 rounded font-sans leading-relaxed space-y-2 max-h-60 overflow-y-auto">
                      <div
                        className="prose prose-xs max-w-none text-foreground"
                        dangerouslySetInnerHTML={{ __html: e.html }}
                      />
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
