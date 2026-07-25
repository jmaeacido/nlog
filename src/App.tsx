import { useState } from 'react'
import { AuthProvider, useAuth } from '@/auth/auth-provider'
import { CheckInPage } from '@/pages/CheckInPage'
import { GeneratePage } from '@/pages/GeneratePage'
import { HistoryPage } from '@/pages/HistoryPage'
import { LoginPage } from '@/pages/LoginPage'
import { InstallPrompt } from '@/components/install-prompt'
import { LoggerChat } from '@/components/logger-chat'
import type { AppView } from '@/components/layout/app-shell'

function AuthenticatedApp() {
  const [view, setView] = useState<AppView>('generate')

  return (
    <>
      {view === 'generate' && <GeneratePage onNavigate={setView} />}
      {view === 'checkin' && <CheckInPage onNavigate={setView} />}
      {view === 'history' && <HistoryPage onNavigate={setView} />}
      <InstallPrompt />
      <LoggerChat />
    </>
  )
}

function AppGate() {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-nlog-bg px-4">
        <div className="text-center">
          <img src="/logo.png" alt="NLog" className="mx-auto h-10 w-auto" />
          <p className="mt-4 text-sm text-nlog-slate animate-logger-pulse">
            Checking session…
          </p>
        </div>
      </div>
    )
  }

  if (status !== 'authenticated') {
    return <LoginPage />
  }

  return <AuthenticatedApp />
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  )
}
