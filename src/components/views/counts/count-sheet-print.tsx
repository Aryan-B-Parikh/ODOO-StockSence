'use client'

import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { api } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import type { CycleCountDTO, ProductDTO } from '@/lib/types'

/**
 * Print-friendly count sheet (Phase 5 pilot — warehouse staff carry paper
 * tally sheets). The component renders a `.print-only .print-sheet` document:
 * invisible on screen, pure black-on-white on paper (styled entirely from
 * src/styles/print.css so the app theme/dark-mode can never leak in).
 */

/** line id → shelf path (PRODUCT-scope counts span several locations). */
export type CountSheetLocations = Record<number, { fullPath: string }>

export function CountSheetPrint({
  count,
  locations,
  hideSystemQty = false,
}: {
  count: CycleCountDTO
  /** Optional per-line location lookup (line id → path). LOCATION-scope
   *  counts use count.locationPath; missing entries print a write-in cell. */
  locations?: CountSheetLocations
  /** Blind count: omit the System qty column and mark the sheet. */
  hideSystemQty?: boolean
}) {
  const scopeLine =
    count.scope === 'LOCATION'
      ? `LOCATION: ${count.locationPath ?? '—'}`
      : `PRODUCT: ${count.productSku ?? '—'} — ${count.productName ?? ''}`

  return (
    <div className="print-only print-sheet" aria-hidden="true">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6mm' }}>
        <div>
          <div className="ps-title">Riverside Distribution Center</div>
          <div className="ps-subtitle">Cycle Count Sheet</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="ps-code">{count.code}</div>
          <div className="ps-meta">{count.cadence} cadence</div>
        </div>
      </div>

      {/* Scope + due date + note */}
      <div className="ps-meta" style={{ marginTop: '3mm' }}>
        <div>
          <strong>{count.scope === 'LOCATION' ? 'Location' : 'Product'}:</strong>{' '}
          <span className="ps-mono">
            {count.scope === 'LOCATION' ? count.locationPath : `${count.productSku} — ${count.productName}`}
          </span>
        </div>
        <div>
          <strong>Due date:</strong> {fmtDate(count.dueDate)}
          {count.status === 'OPEN' && count.daysOverdue > 0 ? ` — OVERDUE by ${count.daysOverdue} day(s)` : ''}
          {'  ·  '}
          <strong>Lines:</strong> {count.lines.length}
          {hideSystemQty ? (
            <>
              {'  ·  '}
              <span className="ps-blind">BLIND COUNT</span>
            </>
          ) : null}
        </div>
        {count.note ? (
          <div>
            <strong>Note:</strong> {count.note}
          </div>
        ) : null}
      </div>

      {/* Counter info */}
      <div className="ps-meta" style={{ marginTop: '4mm' }}>
        Counted by: <span className="ps-blank" /> &nbsp;&nbsp; Date: <span className="ps-blank" style={{ minWidth: '28mm' }} />
      </div>

      {/* Tally table */}
      <table>
        <thead>
          <tr>
            <th className="ps-col-check">✓</th>
            <th className="ps-col-sku">SKU</th>
            <th>Product</th>
            <th>Location</th>
            <th className="ps-col-unit">Unit</th>
            {hideSystemQty ? null : <th className="ps-col-system">System qty</th>}
            <th className="ps-col-counted">Counted</th>
            <th className="ps-col-variance">Variance</th>
          </tr>
        </thead>
        <tbody>
          {count.lines.map((line) => {
            const path =
              count.scope === 'LOCATION' ? count.locationPath : (locations?.[line.id]?.fullPath ?? null)
            return (
              <tr key={line.id}>
                <td className="ps-col-check">
                  <span className="ps-check" />
                </td>
                <td className="ps-mono">{line.sku}</td>
                <td>{line.productName}</td>
                <td className="ps-mono">{path ?? <span className="ps-blank" style={{ minWidth: '24mm' }} />}</td>
                <td>{line.unit}</td>
                {hideSystemQty ? null : (
                  <td className="ps-col-system ps-mono">{line.systemQty.toLocaleString('en-US')}</td>
                )}
                <td className="ps-cell-counted" />
                <td />
              </tr>
            )
          })}
          {count.lines.length === 0 && (
            <tr>
              <td colSpan={hideSystemQty ? 7 : 8} style={{ textAlign: 'center', padding: '6mm' }}>
                This count has no lines.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Verification footer */}
      <div className="ps-meta" style={{ marginTop: '2mm' }}>
        Verified by: <span className="ps-blank" /> &nbsp;&nbsp; Signature: <span className="ps-blank" style={{ minWidth: '44mm' }} />
      </div>
      <div className="ps-small" style={{ marginTop: '3mm' }}>
        Generated by StockSense · {count.code} · {fmtDate(new Date())}
        {hideSystemQty ? ' · blind count — system quantities withheld' : ''}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Print flow hook — shared by the count card and the count detail dialog.
// ---------------------------------------------------------------------------

/**
 * Resolve per-line shelf paths for PRODUCT-scope counts. Count lines and the
 * product's stock records are created from the same StockLevel rows in stable
 * DB order, so they pair index-wise — but only trust it when counts line up.
 */
async function resolveLineLocations(
  count: CycleCountDTO,
  queryClient: QueryClient
): Promise<CountSheetLocations | undefined> {
  if (count.scope !== 'PRODUCT' || count.productId == null) return undefined
  try {
    const res = await queryClient.fetchQuery({
      queryKey: ['products', 'detail', count.productId],
      queryFn: () => api.get<{ product: ProductDTO }>(`/api/products/${count.productId}`),
    })
    const stocks = res.product.stockByLocation
    if (stocks.length !== count.lines.length) return undefined
    const map: CountSheetLocations = {}
    count.lines.forEach((line, i) => {
      map[line.id] = { fullPath: stocks[i].fullPath }
    })
    return map
  } catch {
    return undefined // fall back to write-in location cells
  }
}

/**
 * Renders the sheet into document.body (a portal, so it escapes any dialog),
 * waits a frame for layout/paint, opens the browser print dialog, and
 * unmounts the sheet on `afterprint` (with a timeout fallback).
 */
export function useCountSheetPrint() {
  const queryClient = useQueryClient()
  const [sheet, setSheet] = useState<{
    count: CycleCountDTO
    locations?: CountSheetLocations
    hideSystemQty: boolean
  } | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const print = useCallback(
    async (count: CycleCountDTO, opts?: { hideSystemQty?: boolean }) => {
      const locations = await resolveLineLocations(count, queryClient)
      if (!mounted.current) return
      setSheet({ count, locations, hideSystemQty: !!opts?.hideSystemQty })

      // Give the browser two frames (or 300ms) to lay out + paint the sheet.
      await new Promise<void>((resolve) => {
        let done = false
        const finish = () => {
          if (!done) {
            done = true
            resolve()
          }
        }
        requestAnimationFrame(() => requestAnimationFrame(finish))
        setTimeout(finish, 300)
      })
      if (!mounted.current) return

      const cleanup = () => {
        window.removeEventListener('afterprint', cleanup)
        clearTimeout(fallback)
        if (mounted.current) setSheet(null)
      }
      const fallback = setTimeout(cleanup, 120_000)
      window.addEventListener('afterprint', cleanup)
      window.print()
    },
    [queryClient]
  )

  const portal = sheet
    ? createPortal(
        <CountSheetPrint
          count={sheet.count}
          locations={sheet.locations}
          hideSystemQty={sheet.hideSystemQty}
        />,
        document.body
      )
    : null

  return { print, portal, printing: sheet !== null }
}
