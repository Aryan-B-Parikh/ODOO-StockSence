'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'framer-motion'
import { Loader2, LockKeyhole, LogIn, Mail, Package, ShieldCheck, User } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

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
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values: LoginValues) => {
    try {
      const user = await login(values.email, values.password)
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`, {
        description: 'Signed in to Riverside Distribution Center.',
      })
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 401
            ? 'Invalid email or password.'
            : err.status === 404
              ? 'API not ready yet — the backend is still starting up. Try again in a moment.'
              : err.message
          : 'Something went wrong — please try again.'
      toast.error('Sign-in failed', { description: message })
    }
  }

  const fillDemo = (email: string, password: string) => {
    setValue('email', email, { shouldValidate: true })
    setValue('password', password, { shouldValidate: true })
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
              <Label htmlFor="password">Password</Label>
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
              Demo accounts — one click to fill
            </p>
            <div className="grid gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => fillDemo(account.email, account.password)}
                  className="group flex items-center gap-2.5 rounded-lg border bg-background/60 px-3 py-2 text-left text-sm transition-all hover:border-primary/40 hover:bg-accent hover:shadow-sm"
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
                    aria-hidden="true"
                    className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    Fill
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
    </main>
  )
}
