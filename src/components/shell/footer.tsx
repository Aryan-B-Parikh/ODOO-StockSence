'use client'

/**
 * Sticky footer — sits at the viewport bottom on short pages (root is
 * min-h-screen flex-col + this element carries mt-auto) and is pushed down
 * naturally when content overflows. Respects mobile safe-area insets.
 */
export function AppFooter() {
  return (
    <footer className="mt-auto border-t bg-card/60">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-center gap-1 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[11px] text-muted-foreground sm:flex-row sm:justify-between md:px-6">
        <span>StockSense · Riverside Distribution Center</span>
        <span>Demo environment — data reconciles against the immutable ledger</span>
      </div>
    </footer>
  )
}
