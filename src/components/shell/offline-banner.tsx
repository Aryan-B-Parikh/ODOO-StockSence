'use client'

import { motion } from 'framer-motion'
import { CloudUpload, RefreshCw, Trash2, WifiOff } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useOfflineStore, type QueuedAction } from '@/stores/offline-store'

/**
 * Offline status surface (Phase 2 — offline action queue).
 *
 * Rendered by the app shell directly under the topbar, in normal flow (it
 * pushes content down — it never overlays). Visible whenever the airplane-mode
 * simulation is on OR anything sits in the device queue. Amber = queued /
 * offline, red = failed — synced items simply disappear.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function OfflineBanner() {
  const simulatedOffline = useOfflineStore((s) => s.simulatedOffline)
  const queue = useOfflineStore((s) => s.queue)
  const setSimulatedOffline = useOfflineStore((s) => s.setSimulatedOffline)
  const replay = useOfflineStore((s) => s.replay)
  const clearFailed = useOfflineStore((s) => s.clearFailed)
  const [queueOpen, setQueueOpen] = useState(false)

  // The strip hides when there's nothing to report — but the component (and
  // with it the queue sheet) stays mounted while the sheet is open, so the
  // user can watch the queue drain to "empty" instead of the sheet snapping
  // shut under them on the last synced item.
  const visible = simulatedOffline || queue.length > 0
  if (!visible && !queueOpen) return null

  const failedCount = queue.filter((a) => a.status === 'FAILED').length
  const activeCount = queue.length - failedCount

  const message = simulatedOffline
    ? activeCount === 0
      ? 'Offline (airplane mode) — actions you take are saved on this device and sync automatically when reconnected.'
      : `Offline — ${plural(activeCount, 'action')} queued on this device · they'll sync automatically when reconnected`
    : activeCount === 0
      ? `${plural(failedCount, 'action')} rejected during sync — review it in the queue`
      : `${plural(activeCount, 'offline action')} queued on this device · syncing when reconnected`

  return (
    <>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="border-b border-amber-500/30 bg-amber-500/10"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 md:px-6">
            <WifiOff className="size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-xs leading-snug font-medium text-amber-800 dark:text-amber-200">
              {message}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {failedCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 border-red-500/40 bg-red-500/5 px-2 text-xs text-red-700 hover:bg-red-500/15 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
                  onClick={clearFailed}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Clear failed ({failedCount})
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-amber-500/40 bg-amber-500/10 px-2 text-xs text-amber-800 hover:bg-amber-500/20 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
                onClick={() => setQueueOpen(true)}
              >
                View queue{queue.length > 0 ? ` (${queue.length})` : ''}
              </Button>
              {/* Sync now — while airplane mode is on nothing can leave the device,
                  hence disabled (tooltip explains why). Span keeps the tooltip
                  working on a disabled button. */}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 border-amber-500/40 bg-amber-500/10 px-2 text-xs text-amber-800 hover:bg-amber-500/20 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
                        disabled={simulatedOffline}
                        onClick={() => void replay()}
                      >
                        <RefreshCw className="size-3.5" aria-hidden="true" />
                        Sync now
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {simulatedOffline
                      ? "Turn off airplane mode first — actions can't leave the device while it's on"
                      : 'Replay every queued action now'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </motion.div>
      )}

      <OfflineQueueSheet open={queueOpen} onOpenChange={setQueueOpen} onToggleSimulation={setSimulatedOffline} />
    </>
  )
}

function OfflineQueueSheet({
  open,
  onOpenChange,
  onToggleSimulation,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggleSimulation: (v: boolean) => void
}) {
  const queue = useOfflineStore((s) => s.queue)
  const simulatedOffline = useOfflineStore((s) => s.simulatedOffline)
  const remove = useOfflineStore((s) => s.remove)
  const clearFailed = useOfflineStore((s) => s.clearFailed)
  const failedCount = queue.filter((a) => a.status === 'FAILED').length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b pr-10">
          <SheetTitle className="flex items-center gap-2">
            <WifiOff className="size-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            Offline queue
          </SheetTitle>
          <SheetDescription>
            Actions saved on this device while disconnected. They replay in order once the connection is back — a
            rejected action is kept for review, never silently retried.
          </SheetDescription>
        </SheetHeader>

        {/* Airplane-mode simulation — the Phase 5 pilot-testing toggle */}
        <div className="border-b border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="airplane-switch" className="text-sm">
                Airplane-mode simulation
              </Label>
              <p className="text-xs leading-snug text-muted-foreground">
                For pilot testing — blocks every request as if the device lost connection.
              </p>
            </div>
            <Switch
              id="airplane-switch"
              checked={simulatedOffline}
              onCheckedChange={onToggleSimulation}
              aria-label="Toggle airplane-mode simulation"
            />
          </div>
        </div>

        {/* Queue list — long lists scroll (custom scrollbar via globals) */}
        <div className="flex-1 overflow-y-auto p-4">
          {queue.length === 0 ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center">
              <CloudUpload className="size-8 text-muted-foreground/50" aria-hidden="true" />
              <p className="text-sm font-medium">Queue is empty</p>
              <p className="max-w-52 text-xs text-muted-foreground">
                Actions you take while offline will appear here and sync automatically.
              </p>
            </div>
          ) : (
            <ol className="space-y-3" aria-label="Queued offline actions">
              {queue.map((action) => (
                <QueueItem key={action.id} action={action} onDiscard={() => remove(action.id)} />
              ))}
            </ol>
          )}
        </div>

        {failedCount > 0 && (
          <div className="border-t p-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-red-500/40 bg-red-500/5 text-red-700 hover:bg-red-500/15 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
              onClick={clearFailed}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Clear {plural(failedCount, 'failed action')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

const STATUS_STYLES: Record<QueuedAction['status'], string> = {
  QUEUED: 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  SYNCING: 'animate-pulse border-amber-500/40 bg-amber-500/25 text-amber-800 dark:text-amber-200',
  FAILED: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
}

function QueueItem({ action, onDiscard }: { action: QueuedAction; onDiscard: () => void }) {
  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm leading-snug font-medium">{action.label}</p>
        <Badge variant="outline" className={cn('shrink-0 text-[10px]', STATUS_STYLES[action.status])}>
          {action.status}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <code className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {action.method} {action.path}
        </code>
        <span className="text-[11px] text-muted-foreground">queued {timeAgo(action.queuedAt)}</span>
        {action.attempts > 0 && (
          <span className="text-[11px] text-muted-foreground">
            · {action.attempts} {action.attempts === 1 ? 'attempt' : 'attempts'}
          </span>
        )}
      </div>
      {action.status === 'FAILED' && (
        <div className="space-y-2 rounded-md border border-red-500/30 bg-red-500/5 p-2">
          <p className="text-xs leading-snug text-red-700 dark:text-red-300">
            <span className="font-semibold">Rejected:</span> {action.error ?? 'unknown error'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 border-red-500/40 bg-transparent text-xs text-red-700 hover:bg-red-500/15 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
            onClick={onDiscard}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Discard
          </Button>
        </div>
      )}
    </li>
  )
}
