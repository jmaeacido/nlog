import { useEffect, useState } from 'react'
import { KeyRound, Mail, Shield, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  requestPasswordReset,
  resetPassword,
} from '@/lib/password-auth'
import { cn } from '@/lib/utils'

type AuthTab = 'email' | 'microsoft'
type EmailMode = 'login' | 'register' | 'forgot' | 'reset'

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 21 21"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

function readResetTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const token = params.get('reset')?.trim()
  return token || null
}

function clearResetTokenFromUrl() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('reset')) return
  url.searchParams.delete('reset')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

export function LoginPage() {
  const {
    status,
    error,
    authConfig,
    displayName,
    signInMicrosoft,
    signInPassword,
    registerPassword,
    refresh,
    signOut,
  } = useAuth()

  const [tab, setTab] = useState<AuthTab>('email')
  const [mode, setMode] = useState<EmailMode>('login')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [registerCode, setRegisterCode] = useState('')
  const [resetToken, setResetToken] = useState<string | null>(null)

  const passwordEnabled = Boolean(authConfig?.passwordAuth)
  const registerEnabled = Boolean(authConfig?.registrationAvailable)
  const resetEnabled = Boolean(authConfig?.passwordResetAvailable)
  const microsoftEnabled = Boolean(authConfig?.microsoftAuth)
  const codeRequired = Boolean(authConfig?.registerCodeRequired)

  useEffect(() => {
    const token = readResetTokenFromUrl()
    if (!token) return
    setTab('email')
    setMode('reset')
    setResetToken(token)
  }, [])

  const handleMicrosoft = async () => {
    setBusy(true)
    try {
      await signInMicrosoft()
      toast.success('Signed in.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign-in failed.')
      setBusy(false)
    }
  }

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      if (mode === 'forgot') {
        const result = await requestPasswordReset({ email })
        toast.success(result.message)
        setMode('login')
        setBusy(false)
        return
      }

      if (mode === 'reset') {
        if (!resetToken) {
          throw new Error('Missing reset token. Open the link from your email.')
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.')
        }
        await resetPassword({ token: resetToken, password })
        clearResetTokenFromUrl()
        setResetToken(null)
        await refresh()
        toast.success('Password updated. You are signed in.')
        return
      }

      if (mode === 'register') {
        await registerPassword({
          email,
          password,
          name: name.trim() || undefined,
          registerCode: registerCode.trim() || undefined,
        })
        toast.success('Account created.')
      } else {
        await signInPassword({ email, password })
        toast.success('Signed in.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Authentication failed.')
      setBusy(false)
    }
  }

  const handleSignOut = async () => {
    setBusy(true)
    try {
      await signOut()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-nlog-bg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(45,90,138,0.18),_transparent_55%),linear-gradient(180deg,_#eef4fb_0%,_#f8fafc_42%,_#f1f5f9_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-16 h-72 w-72 rounded-full bg-nlog-accent/10 blur-3xl"
      />

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <div className="mb-8 text-center">
          <img
            src="/logo.png"
            alt="NLog"
            className="mx-auto h-14 w-auto drop-shadow-sm"
          />
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-nlog-navy">
            NLog
          </h1>
          <p className="mt-2 text-sm text-nlog-slate">
            Private Alchemy Dev invoice workspace
          </p>
        </div>

        <section className="rounded-2xl border border-nlog-border bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-nlog-navy">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-nlog-navy">
                {mode === 'forgot'
                  ? 'Reset your password'
                  : mode === 'reset'
                    ? 'Choose a new password'
                    : 'Sign in required'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-nlog-slate">
                {mode === 'forgot'
                  ? 'Enter your email and we will send a reset link if an account exists.'
                  : mode === 'reset'
                    ? 'Set a new password for your NLog email account.'
                    : 'Use an email account or Microsoft. OneDrive fetch still needs Microsoft.'}
              </p>
            </div>
          </div>

          {status === 'unconfigured' && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {error ||
                'Set NLOG_AUTH_SECRET and/or VITE_MSAL_CLIENT_ID before signing in.'}
            </p>
          )}

          {status === 'forbidden' && (
            <div className="mb-4 space-y-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-900">
              <p>{error || 'This account is not allowed to use NLog.'}</p>
              {displayName && (
                <p>
                  Signed in as <span className="font-medium">{displayName}</span>
                </p>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void handleSignOut()}
              >
                Use a different account
              </Button>
            </div>
          )}

          {error && status === 'unauthenticated' && (
            <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-900">
              {error}
            </p>
          )}

          {status !== 'forbidden' && status !== 'unconfigured' && (
            <>
              {mode !== 'forgot' && mode !== 'reset' && (
                <div className="mb-4 flex rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    className={cn(
                      'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition',
                      tab === 'email'
                        ? 'bg-white text-nlog-navy shadow-sm'
                        : 'text-nlog-slate hover:text-nlog-navy',
                    )}
                    onClick={() => setTab('email')}
                    disabled={!passwordEnabled}
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition',
                      tab === 'microsoft'
                        ? 'bg-white text-nlog-navy shadow-sm'
                        : 'text-nlog-slate hover:text-nlog-navy',
                    )}
                    onClick={() => setTab('microsoft')}
                    disabled={!microsoftEnabled}
                  >
                    <MicrosoftIcon className="h-3.5 w-3.5" />
                    Microsoft
                  </button>
                </div>
              )}

              {tab === 'email' && passwordEnabled && (
                <form
                  className="space-y-3"
                  onSubmit={(e) => void handleEmailSubmit(e)}
                >
                  {mode === 'register' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="authName">Name</Label>
                      <Input
                        id="authName"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        autoComplete="name"
                      />
                    </div>
                  )}

                  {(mode === 'login' ||
                    mode === 'register' ||
                    mode === 'forgot') && (
                    <div className="space-y-1.5">
                      <Label htmlFor="authEmail">Email</Label>
                      <Input
                        id="authEmail"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </div>
                  )}

                  {(mode === 'login' ||
                    mode === 'register' ||
                    mode === 'reset') && (
                    <div className="space-y-1.5">
                      <Label htmlFor="authPassword">
                        {mode === 'reset' ? 'New password' : 'Password'}
                      </Label>
                      <Input
                        id="authPassword"
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        autoComplete={
                          mode === 'login' ? 'current-password' : 'new-password'
                        }
                      />
                    </div>
                  )}

                  {mode === 'reset' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="authConfirmPassword">
                        Confirm password
                      </Label>
                      <Input
                        id="authConfirmPassword"
                        type="password"
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat new password"
                        autoComplete="new-password"
                      />
                    </div>
                  )}

                  {mode === 'register' && codeRequired && (
                    <div className="space-y-1.5">
                      <Label htmlFor="authCode">Registration code</Label>
                      <Input
                        id="authCode"
                        value={registerCode}
                        onChange={(e) => setRegisterCode(e.target.value)}
                        placeholder="Invite code"
                        autoComplete="one-time-code"
                      />
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={busy || status === 'loading'}
                  >
                    {mode === 'register' ? (
                      <UserPlus className="h-4 w-4" />
                    ) : mode === 'forgot' || mode === 'reset' ? (
                      <KeyRound className="h-4 w-4" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    {busy || status === 'loading'
                      ? 'Working…'
                      : mode === 'register'
                        ? 'Create account'
                        : mode === 'forgot'
                          ? 'Send reset link'
                          : mode === 'reset'
                            ? 'Update password'
                            : 'Sign in with email'}
                  </Button>

                  {mode === 'login' && (
                    <div className="space-y-2 text-center">
                      {resetEnabled && (
                        <button
                          type="button"
                          className="block w-full text-xs text-nlog-slate hover:text-nlog-navy"
                          onClick={() => setMode('forgot')}
                        >
                          Forgot password?
                        </button>
                      )}
                      {registerEnabled ? (
                        <button
                          type="button"
                          className="w-full text-xs text-nlog-slate hover:text-nlog-navy"
                          onClick={() => setMode('register')}
                        >
                          Need an account? Register
                        </button>
                      ) : (
                        <p className="text-[11px] text-nlog-slate">
                          Registration is closed on this deployment. Ask an
                          admin for access, or use Microsoft.
                        </p>
                      )}
                    </div>
                  )}

                  {(mode === 'register' ||
                    mode === 'forgot' ||
                    mode === 'reset') && (
                    <button
                      type="button"
                      className="w-full text-center text-xs text-nlog-slate hover:text-nlog-navy"
                      onClick={() => {
                        setMode('login')
                        setConfirmPassword('')
                        if (mode === 'reset') {
                          clearResetTokenFromUrl()
                          setResetToken(null)
                        }
                      }}
                    >
                      Back to sign in
                    </button>
                  )}
                </form>
              )}

              {tab === 'email' && !passwordEnabled && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Email login is not configured. Set{' '}
                  <span className="font-mono">NLOG_AUTH_SECRET</span>.
                </p>
              )}

              {tab === 'microsoft' &&
                microsoftEnabled &&
                mode !== 'forgot' &&
                mode !== 'reset' && (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy || status === 'loading'}
                    onClick={() => void handleMicrosoft()}
                  >
                    <MicrosoftIcon className="h-4 w-4" />
                    {busy || status === 'loading'
                      ? 'Working…'
                      : 'Sign in with Microsoft'}
                  </Button>
                )}

              {tab === 'microsoft' && !microsoftEnabled && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Microsoft sign-in is not configured. Set{' '}
                  <span className="font-mono">VITE_MSAL_CLIENT_ID</span>.
                </p>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
