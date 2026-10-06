'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Check,
  Copy,
  Crown,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Package,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  User,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/shell/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

interface TeamUser {
  id: number
  name: string
  email: string
  role: 'ADMINISTRATOR' | 'INVENTORY_MANAGER' | 'WAREHOUSE_STAFF'
  active: boolean
  createdAt: string
  permissions: string[]
}

const ROLE_CONFIG: Record<
  string,
  { label: string; badge: string; icon: typeof User; desc: string }
> = {
  ADMINISTRATOR: {
    label: 'Owner / Administrator',
    badge: 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300',
    icon: Crown,
    desc: 'Master executive access over inventory, financial ledger, and team provisioning.',
  },
  INVENTORY_MANAGER: {
    label: 'Inventory Manager',
    badge: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
    icon: ShieldCheck,
    desc: 'Supervision & operations + high-severity adjustment approvals and reorder decisions.',
  },
  WAREHOUSE_STAFF: {
    label: 'Warehouse Staff',
    badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    icon: Package,
    desc: 'Floor operations: receipts putaway, picking, packing, internal transfers, and cycle counts.',
  },
}

export function UsersView() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const [createOpen, setCreateOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<TeamUser | null>(null)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ users: TeamUser[] }>('/api/users'),
    staleTime: 15_000,
  })

  const users = data?.users ?? []
  const managers = users.filter((u) => u.role === 'INVENTORY_MANAGER')
  const staff = users.filter((u) => u.role === 'WAREHOUSE_STAFF')
  const activeCount = users.filter((u) => u.active).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff & Manager Accounts"
        subtitle="Owner management portal: provision team accounts, assign roles, and manage access credentials"
        icon={<Users className="size-5" />}
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-2 bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 cursor-pointer"
          >
            <UserPlus className="size-4" />
            Create User
          </Button>
        }
      />

      {/* KPI stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-3.5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Accounts</div>
          <div className="mt-1 text-2xl font-bold tracking-tight">{isPending ? '—' : users.length}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{activeCount} active in system</div>
        </div>
        <div className="rounded-xl border bg-card p-3.5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Managers</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
            {isPending ? '—' : managers.length}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Supervision & approvals</div>
        </div>
        <div className="rounded-xl border bg-card p-3.5 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Warehouse Staff</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            {isPending ? '—' : staff.length}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Floor operations</div>
        </div>
        <div className="rounded-xl border bg-card p-3.5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Direct Sign-up</div>
            <div className="mt-1 text-base font-bold tracking-tight text-amber-600 dark:text-amber-400">Disabled</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">Owner provisioned only</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="mt-2.5 h-7 w-full gap-1.5 border-primary/30 text-xs font-semibold text-primary hover:bg-primary/10 cursor-pointer"
          >
            <UserPlus className="size-3.5" />
            + Create Account
          </Button>
        </div>
      </div>

      {/* Users table card */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Active Team Roster</CardTitle>
            <CardDescription className="text-xs">
              Every staff member operates under strictly scoped permissions. Passwords can be reset directly by the owner.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCreateOpen(true)}
              size="sm"
              className="gap-1.5 bg-primary text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 cursor-pointer"
            >
              <UserPlus className="size-3.5" />
              Create User
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              className="size-8 p-0 cursor-pointer"
              aria-label="Refresh team list"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isPending && (
            <div className="space-y-3 py-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          )}

          {isError && (
            <div className="py-8 text-center">
              <ShieldAlert className="mx-auto size-8 text-destructive" />
              <p className="mt-2 text-sm font-semibold">Failed to load team accounts</p>
              <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : 'Unknown error'}</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()} className="mt-3">
                Try again
              </Button>
            </div>
          )}

          {!isPending && !isError && users.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="mx-auto size-10 stroke-1 opacity-50" />
              <p className="mt-2 text-sm font-medium">No team accounts found</p>
            </div>
          )}

          {!isPending && !isError && users.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User / Team Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((member) => {
                    const config = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.WAREHOUSE_STAFF
                    const RoleIcon = config.icon
                    const isSelf = currentUser?.id === member.id

                    const initials = member.name
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()

                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{member.name}</span>
                                {isSelf && (
                                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-purple-500/40 text-purple-600">
                                    You
                                  </Badge>
                                )}
                              </div>
                              <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('gap-1.5 py-0.5 text-xs', config.badge)}>
                            <RoleIcon className="size-3.5" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {member.role === 'ADMINISTRATOR'
                              ? 'Full master access (all 9 actions)'
                              : member.role === 'INVENTORY_MANAGER'
                                ? 'Supervision, approvals & reorders (9 actions)'
                                : 'Floor operations (6 actions)'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {member.active ? (
                            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-700 dark:text-emerald-400">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-muted-foreground/30 bg-muted/40 text-[11px] text-muted-foreground">
                              Deactivated
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs"
                              onClick={() => {
                                setSelectedUser(member)
                                setResetOpen(true)
                              }}
                            >
                              <KeyRound className="size-3.5" />
                              Reset Password
                            </Button>

                            {!isSelf && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  'h-8 text-xs',
                                  member.active
                                    ? 'text-amber-700 dark:text-amber-400 hover:bg-amber-500/10'
                                    : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10'
                                )}
                                onClick={async () => {
                                  try {
                                    await api.patch(`/api/users/${member.id}`, {
                                      active: !member.active,
                                    })
                                    toast.success(
                                      member.active ? `Deactivated ${member.name}` : `Activated ${member.name}`
                                    )
                                    await queryClient.invalidateQueries({ queryKey: ['users'] })
                                  } catch (err: unknown) {
                                    toast.error('Failed to update status', {
                                      description: err instanceof Error ? err.message : 'Error',
                                    })
                                  }
                                }}
                              >
                                {member.active ? (
                                  <>
                                    <UserMinus className="size-3.5 mr-1" />
                                    Deactivate
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="size-3.5 mr-1" />
                                    Activate
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Create New Team Account */}
      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => void queryClient.invalidateQueries({ queryKey: ['users'] })}
      />

      {/* Dialog: Reset Member Password */}
      {selectedUser && (
        <ResetPasswordDialog
          open={resetOpen}
          onOpenChange={setResetOpen}
          user={selectedUser}
          onSuccess={() => void queryClient.invalidateQueries({ queryKey: ['users'] })}
        />
      )}
    </div>
  )
}

function CreateUserDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'WAREHOUSE_STAFF' | 'INVENTORY_MANAGER'>('WAREHOUSE_STAFF')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [createdInfo, setCreatedInfo] = useState<{ email: string; pass: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
    let gen = ''
    for (let i = 0; i < 10; i++) {
      gen += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setPassword(gen)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || name.trim().length < 2) {
      toast.error('Please enter a valid full name (at least 2 characters)')
      return
    }
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address')
      return
    }
    if (!password || password.length < 8) {
      toast.error('Password must be at least 8 characters long')
      return
    }

    setLoading(true)
    try {
      const res = await api.post<{ user: TeamUser; message: string }>('/api/users', {
        name,
        email,
        role,
        password,
      })

      toast.success(res.message)
      setCreatedInfo({ email, pass: password, name })
      onSuccess()
    } catch (err: unknown) {
      toast.error('Could not create account', {
        description: err instanceof Error ? err.message : 'Please check credentials and try again',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName('')
    setEmail('')
    setPassword('')
    setRole('WAREHOUSE_STAFF')
    setCreatedInfo(null)
    setCopied(false)
    onOpenChange(false)
  }

  const handleCopyCredentials = async () => {
    if (!createdInfo) return
    const text = `StockSense Credentials for ${createdInfo.name}:\nEmail: ${createdInfo.email}\nPassword: ${createdInfo.pass}\nURL: http://localhost:3000`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Credentials copied to clipboard!')
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserPlus className="size-4.5" />
            </span>
            <div>
              <DialogTitle className="text-base font-semibold">Provision Staff / Manager Account</DialogTitle>
              <DialogDescription className="text-xs">
                As the Owner, create an authorized account with pre-assigned permissions.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {createdInfo ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
              <div className="flex items-center gap-2 font-semibold text-sm text-emerald-700 dark:text-emerald-400">
                <Check className="size-4" />
                Account Created Successfully!
              </div>
              <p className="mt-1 text-xs">Share these credentials with the team member to allow them to sign in:</p>
              <div className="mt-3 space-y-1.5 rounded-lg bg-background/80 p-2.5 font-mono text-xs text-foreground border">
                <div>
                  <span className="text-muted-foreground">User:</span> <strong>{createdInfo.name}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span> <strong>{createdInfo.email}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Password:</span> <strong>{createdInfo.pass}</strong>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button type="button" variant="outline" size="sm" onClick={handleCopyCredentials} className="gap-1.5">
                {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                {copied ? 'Copied!' : 'Copy Credentials'}
              </Button>
              <Button type="button" size="sm" onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-name" className="text-xs">
                Full Name
              </Label>
              <Input
                id="new-name"
                placeholder="e.g. Alex Morgan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-email" className="text-xs">
                Work Email Address
              </Label>
              <Input
                id="new-email"
                type="email"
                placeholder="alex@stocksense.app"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Role Assignment</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('WAREHOUSE_STAFF')}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all cursor-pointer',
                    role === 'WAREHOUSE_STAFF'
                      ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                      : 'border-border/60 hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-emerald-700 dark:text-emerald-400">
                    <Package className="size-3.5" />
                    Staff
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Floor operations: receipts, deliveries, transfers, counts.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('INVENTORY_MANAGER')}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all cursor-pointer',
                    role === 'INVENTORY_MANAGER'
                      ? 'border-blue-500 bg-blue-500/10 shadow-sm'
                      : 'border-border/60 hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-blue-700 dark:text-blue-400">
                    <ShieldCheck className="size-3.5" />
                    Manager
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Supervision, high adjustment approvals & reordering.
                  </p>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="new-password" className="text-xs">
                  Initial Password (min 8 chars)
                </Label>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                >
                  Generate Password
                </button>
              </div>
              <Input
                id="new-password"
                type="text"
                placeholder="Enter or generate password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={loading} className="gap-1.5">
                {loading && <Loader2 className="size-3.5 animate-spin" />}
                {loading ? 'Provisioning…' : 'Create & Provision Account'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: TeamUser
  onSuccess: () => void
}) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleGenerate = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
    let gen = ''
    for (let i = 0; i < 10; i++) {
      gen += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setPassword(gen)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || password.length < 8) {
      toast.error('Password must be at least 8 characters long')
      return
    }

    setLoading(true)
    try {
      await api.patch(`/api/users/${user.id}`, { password })
      toast.success(`Password updated for ${user.name}`, {
        description: 'Existing sessions have been invalidated.',
      })
      setPassword('')
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      toast.error('Password reset failed', {
        description: err instanceof Error ? err.message : 'Error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <KeyRound className="size-4.5" />
            </span>
            <div>
              <DialogTitle className="text-base font-semibold">Reset Member Password</DialogTitle>
              <DialogDescription className="text-xs">
                Set a new password for <strong>{user.name}</strong> ({user.email}).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="reset-pass" className="text-xs">
                New Password (min 8 chars)
              </Label>
              <button
                type="button"
                onClick={handleGenerate}
                className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
              >
                Generate Password
              </button>
            </div>
            <Input
              id="reset-pass"
              type="text"
              placeholder="Enter new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading && <Loader2 className="size-3.5 animate-spin mr-1" />}
              {loading ? 'Updating…' : 'Set New Password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
