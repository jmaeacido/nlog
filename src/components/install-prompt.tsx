import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useInvoiceStore } from '@/store/invoice-store'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const hasExported = useInvoiceStore((state) => state.hasExported)
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
        ('standalone' in navigator &&
          (navigator as Navigator & { standalone?: boolean }).standalone === true),
    )

    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!hasExported || !deferredPrompt || dismissed || isStandalone) {
    return null
  }

  const handleInstall = async () => {
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 rounded-xl border border-nlog-border bg-white p-4 shadow-lg md:inset-x-auto md:right-6 md:left-auto md:w-96">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-nlog-navy">Install NLog</p>
          <p className="mt-1 text-sm text-nlog-slate">
            Add NLog to your home screen for quick invoice generation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded p-1 text-nlog-slate hover:bg-slate-100"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <Button className="mt-3 w-full" onClick={() => void handleInstall()}>
        <Download className="h-4 w-4" />
        Install App
      </Button>
    </div>
  )
}
