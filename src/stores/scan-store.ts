'use client'

import { create } from 'zustand'

import { useUIStore } from '@/stores/ui-store'

/**
 * Scan dialog state (Phase 2 — barcode/QR scan input + scan-to-scan).
 *
 * A single ScanDialog instance is mounted in the Topbar and driven by this
 * store, so any surface can open it:
 *
 *  - `openScan()` — global mode (topbar button / "S" shortcut): resolves
 *    locations, SKUs and document codes.
 *  - `openScan({ mode: 'location', field })` — location mode (the New
 *    Transfer dialog's scan-to-scan fields): only locations resolve; a hit
 *    is written to `pendingTransferFrom/To`.
 *
 * The pending pair is also the handoff for the global scan's "New transfer
 * from/to here" quick actions: `requestNewTransfer()` queues the location,
 * flags `newTransferOpen` (consumed by the Transfers view) and navigates
 * there. `NewTransferDialog` consumes the pending pair while open.
 */

export type ScanMode = 'global' | 'location'
export type TransferScanField = 'from' | 'to'

interface ScanState {
  /** Scan dialog visibility + active mode. */
  scanOpen: boolean
  scanMode: ScanMode
  /** Which transfer route field a location-mode scan fills (null in global mode). */
  scanField: TransferScanField | null
  openScan: (opts?: { mode?: ScanMode; field?: TransferScanField }) => void
  closeScan: () => void

  /** Handoff into the New Transfer dialog (scan quick actions + scan-to-scan). */
  pendingTransferFrom: number | null
  pendingTransferTo: number | null
  /** One-shot flag asking the Transfers view to open its New Transfer dialog. */
  newTransferOpen: boolean
  /** Queue a scanned location for a transfer route field (consumed by the dialog). null clears it. */
  setTransferTarget: (field: TransferScanField, locationId: number | null) => void
  /** Queue a location, open the New Transfer dialog on the Transfers view. */
  requestNewTransfer: (field: TransferScanField, locationId: number) => void
  /** Clear the one-shot open flag (Transfers view). */
  ackNewTransferOpen: () => void
  /** Clear the queued route handoff (New Transfer dialog, once applied). */
  clearTransferTargets: () => void
}

const closeScanPatch = { scanOpen: false, scanMode: 'global' as ScanMode, scanField: null }

export const useScanStore = create<ScanState>((set, get) => ({
  scanOpen: false,
  scanMode: 'global',
  scanField: null,

  openScan: (opts) =>
    set({
      scanOpen: true,
      scanMode: opts?.mode ?? 'global',
      scanField: opts?.field ?? null,
    }),
  closeScan: () => set(closeScanPatch),

  pendingTransferFrom: null,
  pendingTransferTo: null,
  newTransferOpen: false,

  setTransferTarget: (field, locationId) =>
    set(field === 'from' ? { pendingTransferFrom: locationId } : { pendingTransferTo: locationId }),

  requestNewTransfer: (field, locationId) => {
    get().setTransferTarget(field, locationId)
    set({ ...closeScanPatch, newTransferOpen: true })
    useUIStore.getState().setView('transfers')
  },

  ackNewTransferOpen: () => set({ newTransferOpen: false }),

  clearTransferTargets: () => set({ pendingTransferFrom: null, pendingTransferTo: null }),
}))
