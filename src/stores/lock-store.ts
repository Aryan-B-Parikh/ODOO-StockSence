'use client'

import { create } from 'zustand'

/**
 * Kiosk lock screen state (Phase 2 — "PIN/fingerprint unlock").
 *
 * Warehouse tablets are shared: staff lock the screen with a PIN instead of
 * signing out — the server-side session stays alive. State is persisted per
 * user under `stocksense.lock.<userId>` in localStorage as
 * `{ locked: boolean, pinHash: string | null }`.
 *
 * Only the SHA-256 hash of the PIN is ever stored — never the raw PIN.
 */

/** PINs are 4 digits — long enough for a kiosk gate, short enough to tap. */
export const PIN_LENGTH = 4

/** Hash a PIN with SHA-256 (hex). The raw PIN is never persisted anywhere. */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`stocksense.pin.v1.${pin}`)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // Non-secure-context fallback (djb2) — still never stores the raw PIN.
  let h = 5381
  for (const byte of data) h = ((h * 33) ^ byte) >>> 0
  return `djb2.${h.toString(16)}`
}

interface StoredLock {
  locked: boolean
  pinHash: string | null
}

const storageKey = (userId: number) => `stocksense.lock.${userId}`

function readStored(userId: number): StoredLock {
  if (typeof window === 'undefined') return { locked: false, pinHash: null }
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return { locked: false, pinHash: null }
    const parsed = JSON.parse(raw) as Partial<StoredLock>
    const pinHash = typeof parsed.pinHash === 'string' && parsed.pinHash ? parsed.pinHash : null
    // A user can never be locked out without a PIN on record.
    return { locked: parsed.locked === true && pinHash !== null, pinHash }
  } catch {
    return { locked: false, pinHash: null }
  }
}

function persist(userId: number, data: StoredLock) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(data))
  } catch {
    // Storage blocked/full — the lock still works for this page session.
  }
}

interface LockState {
  locked: boolean
  hasPin: boolean
  /** SHA-256 hex of the current user's PIN (null when no PIN is set). */
  pinHash: string | null
  userId: number | null
  /** Lock the kiosk screen (requires a PIN to have been set). */
  lock: () => void
  /** Unlock after a successful PIN verification. */
  unlock: () => void
  /** Record a new PIN hash (does NOT lock — callers decide what happens next). */
  setPinHash: (hash: string) => void
  /** Wipe the stored PIN + lock state for the current user (sign-out reset). */
  clearPin: () => void
  /** Hydrate per-user state from localStorage. Called by the shell on mount
   *  (and again on user switch — reading the new user's key resets state). */
  initLock: (userId: number) => void
}

export const useLockStore = create<LockState>((set, get) => ({
  locked: false,
  hasPin: false,
  pinHash: null,
  userId: null,

  initLock: (userId) => {
    const stored = readStored(userId)
    set({
      userId,
      locked: stored.locked,
      pinHash: stored.pinHash,
      hasPin: stored.pinHash !== null,
    })
  },

  lock: () => {
    const { userId, pinHash } = get()
    if (userId === null || !pinHash) return
    persist(userId, { locked: true, pinHash })
    set({ locked: true })
  },

  unlock: () => {
    const { userId, pinHash } = get()
    if (userId === null) return
    if (pinHash) persist(userId, { locked: false, pinHash })
    set({ locked: false })
  },

  setPinHash: (hash) => {
    const { userId } = get()
    if (userId === null) return
    persist(userId, { locked: false, pinHash: hash })
    set({ pinHash: hash, hasPin: true, locked: false })
  },

  clearPin: () => {
    const { userId } = get()
    if (userId === null) return
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(storageKey(userId))
      } catch {
        // nothing else to do
      }
    }
    set({ locked: false, hasPin: false, pinHash: null })
  },
}))
