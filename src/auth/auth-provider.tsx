import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AccountInfo } from '@azure/msal-browser'
import {
  connectMicrosoftAccount,
  disconnectMicrosoftAccount,
  getMicrosoftAccessToken,
  getMicrosoftAccount,
  isMicrosoftAuthConfigured,
} from '@/lib/microsoft-auth'
import {
  clearAuthProvider,
  clearPasswordToken,
  fetchAuthConfig,
  getPasswordToken,
  loginWithPassword,
  registerWithPassword,
  setAuthProvider,
  type AuthConfig,
} from '@/lib/password-auth'
import { apiJson, ApiAuthError } from '@/lib/api-client'

export type AuthStatus =
  | 'loading'
  | 'unconfigured'
  | 'unauthenticated'
  | 'authenticated'
  | 'forbidden'

export type AuthProviderKind = 'microsoft' | 'password'

interface SessionUser {
  id: string
  email: string
  name: string | null
  provider?: AuthProviderKind
}

interface AuthContextValue {
  status: AuthStatus
  account: AccountInfo | null
  user: SessionUser | null
  displayName: string | null
  provider: AuthProviderKind | null
  error: string | null
  authConfig: AuthConfig | null
  signInMicrosoft: () => Promise<void>
  signInPassword: (input: {
    email: string
    password: string
  }) => Promise<void>
  registerPassword: (input: {
    email: string
    password: string
    name?: string
    registerCode?: string
  }) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function verifySession(): Promise<SessionUser> {
  const payload = await apiJson<{
    authenticated: boolean
    user: SessionUser
  }>('/api/session', { method: 'GET' })
  return payload.user
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null)

  const refresh = useCallback(async () => {
    let config: AuthConfig | null = null
    try {
      config = await fetchAuthConfig()
      setAuthConfig(config)
    } catch {
      config = {
        passwordAuth: false,
        registrationAvailable: false,
        registerCodeRequired: false,
        passwordResetAvailable: false,
        microsoftAuth: isMicrosoftAuthConfigured(),
      }
      setAuthConfig(config)
    }

    const msConfigured = isMicrosoftAuthConfigured()
    const passwordConfigured = Boolean(config?.passwordAuth)

    if (!msConfigured && !passwordConfigured) {
      setStatus('unconfigured')
      setAccount(null)
      setUser(null)
      setError(
        'Configure VITE_MSAL_CLIENT_ID and/or NLOG_AUTH_SECRET to enable sign-in.',
      )
      return
    }

    setError(null)
    setStatus('loading')

    // Prefer an existing Microsoft session, then password JWT.
    const cachedMs = msConfigured ? await getMicrosoftAccount() : null
    if (cachedMs) {
      setAccount(cachedMs)
      try {
        const sessionUser = await verifySession()
        setUser(sessionUser)
        setStatus('authenticated')
        return
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not verify your session.'
        setUser(null)
        if (err instanceof ApiAuthError && err.status === 403) {
          setStatus('forbidden')
          setError(message)
          return
        }
      }
    }

    if (getPasswordToken()) {
      setAccount(null)
      try {
        const sessionUser = await verifySession()
        setUser(sessionUser)
        setStatus('authenticated')
        return
      } catch (err) {
        clearPasswordToken()
        const message =
          err instanceof Error ? err.message : 'Could not verify your session.'
        setUser(null)
        if (err instanceof ApiAuthError && err.status === 403) {
          setStatus('forbidden')
          setError(message)
          return
        }
        setStatus('unauthenticated')
        setError(message)
        return
      }
    }

    setAccount(null)
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signInMicrosoft = useCallback(async () => {
    setError(null)
    setStatus('loading')
    try {
      clearPasswordToken()
      const nextAccount = await connectMicrosoftAccount()
      if (!nextAccount) return

      setAuthProvider('microsoft')
      setAccount(nextAccount)
      const sessionUser = await verifySession()
      setUser(sessionUser)
      setStatus('authenticated')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not verify your session.'
      setUser(null)
      setAccount(null)
      if (err instanceof ApiAuthError && err.status === 403) {
        setStatus('forbidden')
        setError(message)
        return
      }
      setStatus('unauthenticated')
      setError(message)
      throw err
    }
  }, [])

  const signInPassword = useCallback(
    async (input: { email: string; password: string }) => {
      setError(null)
      setStatus('loading')
      try {
        const result = await loginWithPassword(input)
        setAccount(null)
        setUser(result.user)
        const sessionUser = await verifySession()
        setUser(sessionUser)
        setStatus('authenticated')
      } catch (err) {
        clearPasswordToken()
        const message =
          err instanceof Error ? err.message : 'Login failed.'
        setUser(null)
        setStatus('unauthenticated')
        setError(message)
        throw err
      }
    },
    [],
  )

  const registerPassword = useCallback(
    async (input: {
      email: string
      password: string
      name?: string
      registerCode?: string
    }) => {
      setError(null)
      setStatus('loading')
      try {
        const result = await registerWithPassword(input)
        setAccount(null)
        setUser(result.user)
        const sessionUser = await verifySession()
        setUser(sessionUser)
        setStatus('authenticated')
      } catch (err) {
        clearPasswordToken()
        const message =
          err instanceof Error ? err.message : 'Registration failed.'
        setUser(null)
        setStatus('unauthenticated')
        setError(message)
        throw err
      }
    },
    [],
  )

  const signOut = useCallback(async () => {
    setStatus('loading')
    clearPasswordToken()
    clearAuthProvider()
    try {
      await disconnectMicrosoftAccount()
    } catch {
      // ignore MS logout failures
    }
    setAccount(null)
    setUser(null)
    setError(null)
    setStatus('unauthenticated')
  }, [])

  const provider: AuthProviderKind | null =
    user?.provider ||
    (account ? 'microsoft' : getPasswordToken() ? 'password' : null)

  const displayName =
    user?.name ||
    account?.name ||
    user?.email ||
    account?.username ||
    null

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      account,
      user,
      displayName,
      provider,
      error,
      authConfig,
      signInMicrosoft,
      signInPassword,
      registerPassword,
      signOut,
      refresh,
    }),
    [
      status,
      account,
      user,
      displayName,
      provider,
      error,
      authConfig,
      signInMicrosoft,
      signInPassword,
      registerPassword,
      signOut,
      refresh,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return value
}

export async function getAuthAccessToken(): Promise<string | null> {
  return getMicrosoftAccessToken()
}
