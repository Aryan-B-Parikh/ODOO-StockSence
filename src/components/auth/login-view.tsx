'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'framer-motion'
import { CheckCircle2, KeyRound, Loader2, LockKeyhole, LogIn, Mail, Package, ShieldCheck, User, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, OfflineError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useOfflineStore } from '@/stores/offline-store'

const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginValues = z.infer<typeof loginSchema>

const DEMO_ACCOUNTS = [
  {
    label: 'Manager — Mia Torres',
    email: 'manager@stocksense.app',
    password: 'Manager123!',
    icon: ShieldCheck,
    hint: 'all permissions',
  },
  {
    label: 'Warehouse Staff — Dev Patel',
    email: 'staff@stocksense.app',
    password: 'Staff123!',
    icon: Package,
    hint: 'operations',
  },
  {
    label: 'Sam Reyes — anomaly demo',
    email: 'sam@stocksense.app',
    password: 'Staff123!',
    icon: User,
    hint: 'flags & review',
  },
]

type Tone = 'amber' | 'teal' | 'emerald' | 'zinc'

const TONES: Record<Tone, string> = {
  amber: 'bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-300/25',
  teal: 'bg-teal-400/15 text-teal-200 ring-1 ring-inset ring-teal-300/25',
  emerald: 'bg-emerald-400/15 text-emerald-200 ring-1 ring-inset ring-emerald-300/30',
  zinc: 'bg-white/10 text-zinc-100 ring-1 ring-inset ring-white/15',
}

function Pipeline({ label, chips }: { label: string; chips: { text: string; tone: Tone }[] }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{label}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1.5">
        {chips.map((chip, i) => (
          <span key={chip.text} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true" className="text-xs text-white/30">→</span>}
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', TONES[chip.tone])}>
              {chip.text}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function LoginView() {
  const login = useAuthStore((s) => s.login)
  const simulatedOffline = useOfflineStore((s) => s.simulatedOffline)
  const setSimulatedOffline = useOfflineStore((s) => s.setSimulatedOffline)
  const initOffline = useOfflineStore((s) => s.initOffline)

  // Hydrate the offline store on the login screen too (normally done in the
  // authed app shell): a reload while airplane mode is ON lands here, and the
  // escape-hatch banner below needs the persisted flag. Post-mount, so the
  // SSR pass never mismatches.
  useEffect(() => {
    initOffline()
  }, [initOffline])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  // ── Password reset with OTP state ──
  const [forgotOpen, setForgotOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetOtp, setResetOtp] = useState('')
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [debugOtp, setDebugOtp] = useState<string | null>(null)

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail || !resetEmail.includes('@')) {
      toast.error('Please enter a valid email address')
      return
    }
    setOtpLoading(true)
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch OTP')
      setOtpSent(true)
      if (data.debugOtp) setDebugOtp(data.debugOtp)
      toast.success('Verification code dispatched', {
        description: 'Check your email inbox for the 6-digit OTP code.',
      })
    } catch (err: unknown) {
      toast.error('Dispatch failed', {
        description: err instanceof Error ? err.message : 'Unable to dispatch code',
      })
    } finally {
      setOtpLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetOtp || resetOtp.length < 6) {
      toast.error('Please enter the 6-digit verification code')
      return
    }
    if (!resetNewPassword || resetNewPassword.length < 8) {
      toast.error('New password must be at least 8 characters long')
      return
    }
    setResetLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail,
          otp: resetOtp,
          newPassword: resetNewPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Password reset failed')
      toast.success('Password updated successfully', {
        description: 'You can now sign in with your new password.',
      })
      setValue('email', resetEmail)
      setValue('password', resetNewPassword)
      setForgotOpen(false)
      setOtpSent(false)
      setResetOtp('')
      setResetNewPassword('')
      setDebugOtp(null)
    } catch (err: unknown) {
      toast.error('Reset failed', {
        description: err instanceof Error ? err.message : 'Invalid or expired code',
      })
    } finally {
      setResetLoading(false)
    }
  }

  const onSubmit = async (values: LoginValues) => {
    try {
      const user = await login(values.email, values.password)
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`, {
        description: 'Signed in to Riverside Distribution Center.',
      })
    } catch (err) {
      const message =
        err instanceof OfflineError
          ? 'You are offline — sign-in needs a connection. Turn off airplane mode or reconnect, then try again.'
          : err instanceof ApiError
            ? err.status === 401
              ? 'Invalid email or password.'
              : err.status === 404
                ? 'API not ready yet — the backend is still starting up. Try again in a moment.'
                : err.message
            : 'Something went wrong — please try again.'
      toast.error('Sign-in failed', { description: message })
    }
  }

  const fillDemo = async (email: string, password: string) => {
    setValue('email', email, { shouldValidate: true })
    setValue('password', password, { shouldValidate: true })
    await onSubmit({ email, password })
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/40 p-4">
      {/* decorative emerald wash */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 size-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 size-[28rem] rounded-full bg-teal-500/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative grid w-full max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-xl md:grid-cols-[1.05fr_1fr]"
      >
        {/* ── Brand panel ─────────────────────────────────────────── */}
        <div className="relative hidden flex-col justify-between gap-8 overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-stone-900 p-8 text-emerald-50 md:flex">
          {/* engineering-grid backdrop + emerald washes */}
          <div
            aria-hidden="true"
            className="bg-grid pointer-events-none absolute inset-0 text-emerald-100 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_85%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-emerald-400/10 blur-2xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -left-20 size-72 rounded-full bg-teal-400/10 blur-3xl"
          />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="relative flex size-10 items-center justify-center rounded-xl bg-white/10 text-xl ring-1 ring-inset ring-white/15">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-xl bg-emerald-300/20 blur-md"
                />
                <span className="relative">📦</span>
              </span>
              <div className="leading-tight">
                <div className="text-lg font-semibold tracking-tight">StockSense</div>
                <div className="text-[11px] text-emerald-200/70">Warehouse Inventory Intelligence</div>
              </div>
            </div>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-emerald-100/85">
              Warehouse inventory intelligence — every unit tracked, reserved, and reconciled.
            </p>
          </div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } } }}
            className="space-y-4"
          >
            <motion.div
              variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.35 }}
            >
              <Pipeline
                label="Inbound"
                chips={[
                  { text: 'Expected', tone: 'amber' },
                  { text: 'Received', tone: 'teal' },
                  { text: 'Available', tone: 'emerald' },
                ]}
              />
            </motion.div>
            <motion.div
              variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.35 }}
            >
              <Pipeline
                label="Outbound"
                chips={[
                  { text: 'Available', tone: 'emerald' },
                  { text: 'Reserved', tone: 'zinc' },
                  { text: 'Picked', tone: 'teal' },
                  { text: 'Packed', tone: 'amber' },
                  { text: 'Delivered', tone: 'emerald' },
                ]}
              />
            </motion.div>
            <motion.div
              variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.35 }}
              className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-emerald-200/60"
            >
              <span>Immutable movement ledger</span>
              <span aria-hidden="true">·</span>
              <span>Split quantities per location</span>
              <span aria-hidden="true">·</span>
              <span>Permissioned actions</span>
            </motion.div>
            <motion.div
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="flex items-center gap-2 rounded-lg border border-emerald-300/15 bg-emerald-300/5 px-3 py-2 text-[11px] text-emerald-100/70"
            >
              <span className="relative flex size-1.5" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-300" />
              </span>
              Live demo environment — Riverside Distribution Center, WH1
            </motion.div>
          </motion.div>
        </div>

        {/* ── Sign-in form ────────────────────────────────────────── */}
        <div className="flex flex-col justify-center gap-6 p-6 md:p-8">
          <div className="flex items-center gap-3 md:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-lg">📦</span>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight">StockSense</div>
              <div className="text-[11px] text-muted-foreground">Warehouse Inventory Intelligence</div>
            </div>
          </div>

          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Access the Riverside Distribution Center workspace.
            </p>
          </div>

          {/* Airplane-mode escape hatch: while the offline simulation blocks the
              API, signing in is impossible — surface WHY and offer the toggle
              right here (the normal banner/topbar toggle lives behind auth). */}
          {simulatedOffline && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-3"
            >
              <WifiOff className="size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
              <div className="min-w-0 flex-1 text-xs leading-relaxed text-amber-700">
                <span className="font-semibold">Airplane-mode simulation is on</span> — API calls are
                blocked, so sign-in can't reach the server.
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
                onClick={() => setSimulatedOffline(false)}
              >
                Turn off airplane mode
              </Button>
            </motion.div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@stocksense.app"
                  className="pl-9"
                  aria-invalid={!!errors.email}
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => {
                    const curr = watch('email')
                    if (curr) setResetEmail(curr)
                    setForgotOpen(true)
                  }}
                  className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-9"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
              </div>
              {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Signing in…
                </>
              ) : (
                <>
                  <LogIn className="size-4" aria-hidden="true" /> Sign in
                </>
              )}
            </Button>
          </form>

          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Demo accounts — 1-tap instant sign in
            </p>
            <div className="grid gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => fillDemo(account.email, account.password)}
                  className="group flex items-center gap-2.5 rounded-lg border bg-background/60 px-3 py-2 text-left text-sm transition-all hover:border-primary/40 hover:bg-accent hover:shadow-sm active:scale-[0.98] disabled:opacity-50"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                    <account.icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-medium">{account.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {account.email} · {account.hint}
                    </span>
                  </span>
                  <span
                    className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
                  >
                    Sign In
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            Demo environment — data reconciles against the immutable ledger.
          </p>
        </div>
      </motion.div>

      {/* ── Password Reset with Email OTP Modal ── */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <KeyRound className="size-4.5" />
              </span>
              <div>
                <DialogTitle className="text-base font-semibold">Password Recovery</DialogTitle>
                <DialogDescription className="text-xs">
                  {otpSent
                    ? 'Enter the 6-digit verification code dispatched to your email.'
                    : 'Dispatch a 6-digit OTP verification code to your registered email.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="reset-email" className="text-xs">Registered Email Address</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="manager@stocksense.app"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setForgotOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={otpLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {otpLoading ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Dispatching…
                    </>
                  ) : (
                    'Send Verification Code'
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4 pt-2">
              <div className="rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2 border border-emerald-500/20">
                <CheckCircle2 className="size-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  Verification code dispatched to <strong>{resetEmail}</strong>.
                  {debugOtp && (
                    <div className="mt-1 font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                      Debug OTP: <span className="font-bold underline cursor-pointer" onClick={() => setResetOtp(debugOtp)}>{debugOtp}</span> (click to autofill)
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="otp-code" className="text-xs">6-Digit Verification Code (OTP)</Label>
                <Input
                  id="otp-code"
                  type="text"
                  maxLength={6}
                  placeholder="348912"
                  value={resetOtp}
                  onChange={(e) => setResetOtp(e.target.value)}
                  className="font-mono text-center tracking-widest text-lg"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs">New Password (min 8 chars)</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Resend code
                </button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setForgotOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={resetLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {resetLoading ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" /> Updating…
                      </>
                    ) : (
                      'Reset & Sign In'
                    )}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
