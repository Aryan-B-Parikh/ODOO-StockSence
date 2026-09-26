'use client'

import { motion } from 'framer-motion'
import { Delete, LogOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth-store'
import { PIN_LENGTH, hashPin, useLockStore } from '@/stores/lock-store'
import { cn } from '@/lib/utils'

/**
 * Kiosk lock screen (Phase 2 — shared warehouse tablets).
 * Rendered by the app shell while `useLockStore().locked` is true: a fixed
 * overlay covers the whole app; the session stays alive server-side and the
 * user returns with their 4-digit PIN. Raw PINs are never stored — only a
 * SHA-256 hash (see stores/lock-store.ts).
 */

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

export function PinLockGate() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const pinHash = useLockStore((s) => s.pinHash)
  const unlock = useLockStore((s) => s.unlock)
  const clearPin = useLockStore((s) => s.clearPin)

  const [entry, setEntry] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [shakeKey, setShakeKey] = useState(0)
  const [busy, setBusy] = useState(false)

  // Refs mirror state so the global keydown listener always sees fresh values.
  const entryRef = useRef('')
  const busyRef = useRef(false)

  const setEntrySafe = useCallback((value: string) => {
    entryRef.current = value
    setEntry(value)
  }, [])

  const submit = useCallback(
    async (pin: string) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      try {
        const hash = await hashPin(pin)
        if (pinHash && hash === pinHash) {
          unlock()
          const first = user?.name.split(' ')[0]
          toast.success(first ? `Unlocked — welcome back, ${first}` : 'Unlocked')
        } else {
          setEntrySafe('')
          setAttempts((a) => a + 1)
          setShakeKey((k) => k + 1)
        }
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [pinHash, unlock, user, setEntrySafe]
  )

  const pressDigit = (digit: string) => {
    if (busyRef.current || entryRef.current.length >= PIN_LENGTH) return
    const next = entryRef.current + digit
    setEntrySafe(next)
    if (next.length === PIN_LENGTH) void submit(next)
  }

  const backspace = () => {
    if (busyRef.current || entryRef.current.length === 0) return
    setEntrySafe(entryRef.current.slice(0, -1))
  }

  // Keyboard support: digits append, Backspace removes, Enter submits, Tab is
  // trapped (nothing under the gate should receive focus or hotkeys).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        pressDigit(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        backspace()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (entryRef.current.length === PIN_LENGTH) void submit(entryRef.current)
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault() // nothing to dismiss / focus underneath a lock screen
      } else {
        // Let browser-native shortcuts (Ctrl/Cmd+R, F5, …) keep working, but
        // stop in-app hotkeys (⌘K search, Ctrl+L, …) from firing under the gate.
        if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) e.preventDefault()
        e.stopPropagation()
        return
      }
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  })

  const handleSignOut = async () => {
    // Signing out resets the demo PIN — next sign-in starts unlocked & PIN-less.
    clearPin()
    await logout()
    toast('Signed out', { description: 'Lock screen PIN was reset for this device.' })
  }

  const initials =
    user?.name
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() ?? '··'

  // Defensive: locked without a PIN hash (corrupt storage). Never trap the user.
  if (!pinHash) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/95 p-4 backdrop-blur"
        role="alertdialog"
        aria-modal="true"
        aria-label="Lock data missing"
      >
        <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-amber-500/15 text-2xl">📦</span>
          <p className="text-sm text-zinc-300">
            Lock data is missing for this device — the screen can be unlocked safely.
          </p>
          <Button className="w-full" onClick={unlock}>
            Unlock
          </Button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="text-xs text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
          >
            Sign out instead
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-zinc-950/90 p-4 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-label="StockSense is locked — enter your PIN"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        {/* key change replays the shake animation on every wrong attempt */}
        <motion.div
          key={shakeKey}
          animate={shakeKey > 0 ? { x: [0, -12, 12, -8, 8, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center gap-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl sm:p-8"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/15 text-2xl" aria-hidden="true">
              📦
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-zinc-100">StockSense is locked</h2>
              <p className="text-xs text-zinc-400">Enter your {PIN_LENGTH}-digit PIN to unlock</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-full border border-zinc-700/60 bg-zinc-800/50 py-1.5 pl-1.5 pr-4">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-400"
            >
              {initials}
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-xs font-medium text-zinc-200">{user?.name ?? 'Signed in'}</div>
              <div className="text-[10px] text-zinc-500">Session stays active — nothing was signed out</div>
            </div>
          </div>

          {/* PIN dots */}
          <div
            className="flex items-center justify-center gap-3.5 py-1"
            role="status"
            aria-label={`${entry.length} of ${PIN_LENGTH} digits entered`}
          >
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={cn(
                  'size-3.5 rounded-full border transition-all duration-150',
                  i < entry.length
                    ? busy
                      ? 'border-amber-400 bg-amber-400'
                      : 'border-emerald-400 bg-emerald-400'
                    : 'border-zinc-600 bg-transparent'
                )}
              />
            ))}
          </div>

          <p
            aria-live="polite"
            className={cn('h-4 text-xs', attempts > 0 ? 'text-red-400' : 'text-transparent')}
          >
            {attempts > 0 ? `Wrong PIN — try again (${attempts} failed ${attempts === 1 ? 'attempt' : 'attempts'})` : '.'}
          </p>

          {/* Keypad */}
          <div className="grid w-full max-w-[17rem] grid-cols-3 gap-2">
            {DIGITS.map((d) => (
              <KeypadButton key={d} onClick={() => pressDigit(d)}>
                {d}
              </KeypadButton>
            ))}
            <div aria-hidden="true" />
            <KeypadButton onClick={() => pressDigit('0')}>0</KeypadButton>
            <KeypadButton onClick={backspace} aria-label="Delete last digit">
              <Delete className="size-5" aria-hidden="true" />
            </KeypadButton>
          </div>

          {/* Sign-out escape hatch */}
          {attempts >= 3 ? (
            <div className="flex w-full flex-col items-center gap-2 border-t border-zinc-800 pt-4">
              <Button
                variant="outline"
                className="w-full border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                onClick={() => void handleSignOut()}
              >
                <LogOut className="size-4" aria-hidden="true" />
                Sign out instead
              </Button>
              <p className="text-center text-[11px] leading-snug text-zinc-400">
                Forgot the PIN? Signing out resets it — set a new one after signing back in.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="text-xs text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-300 hover:underline"
            >
              Sign out instead
            </button>
          )}
        </motion.div>
      </motion.div>
    </div>
  )
}

function KeypadButton({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-12 items-center justify-center rounded-xl bg-zinc-800/80 text-lg font-semibold text-zinc-100 shadow-sm transition-all duration-100 hover:bg-zinc-700 hover:shadow active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:h-14"
    >
      {children}
    </button>
  )
}

/**
 * First-time flow: set a kiosk PIN before locking (enter + confirm).
 * Rendered by the topbar when the lock button is pressed with no PIN set.
 */
export function SetPinDialog({
  open,
  onOpenChange,
  onPinSet,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the PIN was recorded — the caller locks the screen. */
  onPinSet: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        {/* Form lives inside DialogContent on purpose: Radix unmounts the
            content when the dialog closes, so every open starts fresh. */}
        <SetPinForm onDone={() => onOpenChange(false)} onPinSet={onPinSet} />
      </DialogContent>
    </Dialog>
  )
}

function SetPinForm({ onDone, onPinSet }: { onDone: () => void; onPinSet: () => void }) {
  const setPinHash = useLockStore((s) => s.setPinHash)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')

  const submit = async () => {
    if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin) || !new RegExp(`^\\d{${PIN_LENGTH}}$`).test(confirm)) {
      toast.error(`Enter a ${PIN_LENGTH}-digit PIN in both fields.`)
      return
    }
    if (pin !== confirm) {
      toast.error("PINs don't match — retype the confirmation.")
      setConfirm('')
      return
    }
    const hash = await hashPin(pin)
    setPinHash(hash)
    onDone()
    toast.success('PIN set — the screen is now locked')
    onPinSet()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>Set a kiosk PIN</DialogTitle>
        <DialogDescription>
          This shared tablet locks with a {PIN_LENGTH}-digit PIN instead of signing you out — your session stays
          alive behind the lock screen.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <label htmlFor="new-pin" className="text-xs font-medium text-muted-foreground">
          PIN ({PIN_LENGTH} digits)
        </label>
        <Input
          id="new-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_LENGTH}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
          placeholder="••••"
          className="text-center font-mono text-xl tracking-[0.6em]"
          aria-describedby="new-pin-hint"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm-pin" className="text-xs font-medium text-muted-foreground">
          Confirm PIN
        </label>
        <Input
          id="confirm-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_LENGTH}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
          placeholder="••••"
          className="text-center font-mono text-xl tracking-[0.6em]"
        />
        <p id="new-pin-hint" className="text-[11px] text-muted-foreground">
          Stored as a SHA-256 hash on this device only — never in plain text.
        </p>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Set PIN &amp; lock</Button>
      </DialogFooter>
    </form>
  )
}
