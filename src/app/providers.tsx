'use client'

import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { io } from 'socket.io-client'
import { useMarketStore, type TickPayload } from '@/stores/market-store'
import { Toaster } from '@/components/ui/sonner'

/**
 * App providers: TanStack Query, theme (dark default), sonner toasts and the
 * live-market WebSocket connection (gateway: /?XTransformPort=3003).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  )

  useEffect(() => {
    // NEVER use a port in the URL — the gateway forwards via XTransformPort.
    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      timeout: 10_000,
    })

    const store = useMarketStore
    socket.on('connect', () => store.getState().setConnected(true))
    socket.on('disconnect', () => store.getState().setConnected(false))
    socket.on('connect_error', () => store.getState().setConnected(false))
    socket.on('snapshot', (d: TickPayload) => {
      if (d?.ticks?.length) store.getState().applyTick(d)
    })
    socket.on('tick', (d: TickPayload) => {
      if (d?.ticks?.length) store.getState().applyTick(d)
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
        {children}
        <Toaster richColors position="top-right" closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
