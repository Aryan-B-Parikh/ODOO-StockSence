'use client'

import { useEffect } from 'react'

export function PwaProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Register service worker after window load for optimal page load performance
      const handleLoad = () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('StockSense PWA Service Worker registered:', registration.scope)
          })
          .catch((error) => {
            console.warn('StockSense PWA Service Worker registration failed:', error)
          })
      }

      if (document.readyState === 'complete') {
        handleLoad()
      } else {
        window.addEventListener('load', handleLoad)
        return () => window.removeEventListener('load', handleLoad)
      }
    }
  }, [])

  return <>{children}</>
}
