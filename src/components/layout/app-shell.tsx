import { type ReactNode, useState } from 'react'
import { ClipboardList, FilePlus2, History, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type AppView = 'generate' | 'history' | 'checkin'

export function AppShell({
  children,
  activeView = 'generate',
  onNavigate,
  historyCount = 0,
}: {
  children: ReactNode
  activeView?: AppView
  onNavigate?: (view: AppView) => void
  historyCount?: number
}) {
  const { displayName, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
      toast.success('Signed out.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign-out failed.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 border-b border-nlog-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/logo.png" alt="NLog" className="h-8 w-auto" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-nlog-navy">NLog</p>
              <p className="truncate text-xs text-nlog-slate">
                {displayName
                  ? displayName
                  : 'Alchemy Dev Invoice Generator'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onNavigate && (
              <nav className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => onNavigate('generate')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                    activeView === 'generate'
                      ? 'bg-white text-nlog-navy shadow-sm'
                      : 'text-nlog-slate hover:text-nlog-navy',
                  )}
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Generate</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('checkin')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                    activeView === 'checkin'
                      ? 'bg-white text-nlog-navy shadow-sm'
                      : 'text-nlog-slate hover:text-nlog-navy',
                  )}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Check-in</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('history')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                    activeView === 'history'
                      ? 'bg-white text-nlog-navy shadow-sm'
                      : 'text-nlog-slate hover:text-nlog-navy',
                  )}
                >
                  <History className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">History</span>
                  {historyCount > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                        activeView === 'history'
                          ? 'bg-nlog-navy text-white'
                          : 'bg-slate-200 text-nlog-navy',
                      )}
                    >
                      {historyCount > 99 ? '99+' : historyCount}
                    </span>
                  )}
                </button>
              </nav>
            )}

            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {signingOut ? '…' : 'Sign out'}
              </span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}

export function StepIndicator({
  current,
  steps,
}: {
  current: number
  steps: string[]
}) {
  return (
    <ol className="mb-6 flex items-center justify-between gap-2">
      {steps.map((label, index) => {
        const stepNumber = index + 1
        const isActive = stepNumber === current
        const isComplete = stepNumber < current

        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-1">
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold',
                isActive && 'bg-nlog-navy text-white',
                isComplete && 'bg-nlog-accent text-white',
                !isActive && !isComplete && 'bg-slate-200 text-slate-600',
              )}
            >
              {stepNumber}
            </span>
            <span
              className={cn(
                'hidden text-center text-xs sm:block',
                isActive ? 'font-medium text-nlog-navy' : 'text-nlog-slate',
              )}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
