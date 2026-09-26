'use client'

import { RotateCcw, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

/** Full dashboard loading skeleton (KPIs → attention → charts → racks). */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-44 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

function describeError(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return { title: 'Session expired', detail: 'Your session is no longer valid — sign in again to continue.' }
    if (error.status === 404)
      return { title: 'Dashboard API not live yet', detail: 'The backend is still starting up. Retry in a moment.' }
    return { title: 'Dashboard unavailable', detail: error.message }
  }
  return { title: 'Dashboard unavailable', detail: 'Something went wrong while loading the overview.' }
}

/** Friendly, retry-able error state (the API may still be booting). */
export function DashboardError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const logout = useAuthStore((s) => s.logout)
  const { title, detail } = describeError(error)
  const isAuthError = error instanceof ApiError && error.status === 401

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-red-500/10">
          <WifiOff className="size-5 text-red-600" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold">{title}</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{detail}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Button variant="outline" onClick={onRetry}>
            <RotateCcw className="size-4" aria-hidden="true" /> Retry
          </Button>
          {isAuthError && (
            <Button variant="ghost" onClick={() => void logout()}>
              Back to sign-in
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
