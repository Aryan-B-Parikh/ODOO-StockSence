'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, Share2, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function checkStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone === true)
  )
}

function useIsStandalone() {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia('(display-mode: standalone)')
      mql.addEventListener('change', callback)
      return () => mql.removeEventListener('change', callback)
    },
    checkStandalone,
    () => false
  )
}

export function MobileInstallBanner() {
  const isStandalone = useIsStandalone()
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isDismissed, setIsDismissed] = useState(true)

  const isIOS =
    typeof window !== 'undefined' &&
    /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase())

  useEffect(() => {
    if (isStandalone) return
    const dismissed = sessionStorage.getItem('stocksense_install_dismissed') === '1'
    if (dismissed) return

    // If on iOS and not standalone, show iOS add-to-home hint
    if (isIOS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsDismissed(false)
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
      setIsDismissed(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [isStandalone, isIOS])

  const handleInstallClick = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setIsDismissed(true)
    }
    setInstallPrompt(null)
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    sessionStorage.setItem('stocksense_install_dismissed', '1')
  }

  if (isStandalone || isDismissed) {
    return null
  }

  return (
    <div className="relative mx-3 my-2 block rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/80 via-zinc-900/90 to-teal-950/80 p-3 shadow-md backdrop-blur md:hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            <Smartphone className="size-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-white">Install StockSense Mobile App</p>
            <p className="text-[11px] text-zinc-300">
              {isIOS
                ? 'Tap Share ⎋ then "Add to Home Screen"'
                : 'Fast camera barcode scanning & offline mode'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="size-6 text-zinc-400 hover:text-white"
          aria-label="Dismiss banner"
        >
          <X className="size-4" />
        </button>
      </div>

      {!isIOS && installPrompt && (
        <div className="mt-2.5 flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-zinc-700 bg-transparent text-zinc-300 hover:text-white"
            onClick={handleDismiss}
          >
            Later
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1.5 bg-emerald-700 text-xs font-medium text-white hover:bg-emerald-800"
            onClick={handleInstallClick}
          >
            <Download className="size-3.5" />
            Install App
          </Button>
        </div>
      )}

      {isIOS && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300">
          <Share2 className="size-3.5" />
          <span>Tap Safari Share button, then select &quot;Add to Home Screen&quot;</span>
        </div>
      )}
    </div>
  )
}
