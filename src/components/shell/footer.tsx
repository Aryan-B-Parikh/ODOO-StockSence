'use client'

/**
 * Sticky footer — sits at the viewport bottom on short pages (root is
 * min-h-screen flex-col + this element carries mt-auto) and is pushed down
 * naturally when content overflows. Respects mobile safe-area insets.
 */
export function AppFooter() {
  return (
    <footer className="mt-auto mb-20 border-t bg-card/60 md:mb-0">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-center gap-1.5 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[11px] text-muted-foreground sm:flex-row sm:justify-between md:px-6">
        <span className="flex items-center gap-1.5">
          <span className="relative flex size-1.5" aria-hidden="true">
            <span className="pulse-dot absolute inline-flex size-full rounded-full bg-emerald-500" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          StockSense · Riverside Distribution Center
        </span>
        <span className="flex items-center gap-1.5">
          <span className="rounded-full border bg-background px-1.5 py-px font-mono text-[10px] leading-4">
            v1.2
          </span>
          Demo environment — data reconciles against the immutable ledger
        </span>
      </div>
    </footer>
  )
}
