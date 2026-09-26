'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { registerQueryClient } from '@/lib/query-client'
import { PwaProvider } from '@/components/providers/pwa-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => {
      const c = new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      })
      // Expose the client to code outside the React tree (offline replay engine).
      registerQueryClient(c)
      return c
    }
  )

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <PwaProvider>
          {children}
        </PwaProvider>
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
