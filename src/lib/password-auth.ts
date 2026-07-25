const TOKEN_KEY = 'nlog-password-token'
const PROVIDER_KEY = 'nlog-auth-provider'

export type StoredAuthProvider = 'microsoft' | 'password'

export function getPasswordToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setPasswordToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(PROVIDER_KEY, 'password')
}

export function clearPasswordToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  if (localStorage.getItem(PROVIDER_KEY) === 'password') {
    localStorage.removeItem(PROVIDER_KEY)
  }
}

export function setAuthProvider(provider: StoredAuthProvider): void {
  localStorage.setItem(PROVIDER_KEY, provider)
}

export function getAuthProvider(): StoredAuthProvider | null {
  if (typeof window === 'undefined') return null
  const value = localStorage.getItem(PROVIDER_KEY)
  return value === 'microsoft' || value === 'password' ? value : null
}

export function clearAuthProvider(): void {
  localStorage.removeItem(PROVIDER_KEY)
}

export interface PasswordAuthUser {
  id: string
  email: string
  name: string | null
  provider: 'password'
}

export interface AuthConfig {
  passwordAuth: boolean
  registrationAvailable: boolean
  registerCodeRequired: boolean
  passwordResetAvailable: boolean
  microsoftAuth: boolean
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  const response = await fetch('/api/auth-config')
  const payload = (await response.json().catch(() => ({}))) as AuthConfig & {
    error?: string
  }
  if (!response.ok) {
    throw new Error(payload.error || 'Could not load auth config')
  }
  return {
    passwordAuth: Boolean(payload.passwordAuth),
    registrationAvailable: Boolean(payload.registrationAvailable),
    registerCodeRequired: Boolean(payload.registerCodeRequired),
    passwordResetAvailable: Boolean(payload.passwordResetAvailable),
    microsoftAuth: Boolean(payload.microsoftAuth),
  }
}

export async function loginWithPassword(input: {
  email: string
  password: string
}): Promise<{ token: string; user: PasswordAuthUser }> {
  const response = await fetch('/api/auth-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
    token?: string
    user?: PasswordAuthUser
  }
  if (!response.ok || !payload.token || !payload.user) {
    throw new Error(payload.error || 'Login failed')
  }
  setPasswordToken(payload.token)
  return { token: payload.token, user: payload.user }
}

export async function registerWithPassword(input: {
  email: string
  password: string
  name?: string
  registerCode?: string
}): Promise<{ token: string; user: PasswordAuthUser }> {
  const response = await fetch('/api/auth-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
    token?: string
    user?: PasswordAuthUser
  }
  if (!response.ok || !payload.token || !payload.user) {
    throw new Error(payload.error || 'Registration failed')
  }
  setPasswordToken(payload.token)
  return { token: payload.token, user: payload.user }
}

export async function requestPasswordReset(input: {
  email: string
}): Promise<{ message: string }> {
  const response = await fetch('/api/auth-forgot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
    message?: string
  }
  if (!response.ok) {
    throw new Error(payload.error || 'Password reset request failed')
  }
  return {
    message:
      payload.message ||
      'If an account exists for that email, a reset link has been sent.',
  }
}

export async function resetPassword(input: {
  token: string
  password: string
}): Promise<{ token: string; user: PasswordAuthUser }> {
  const response = await fetch('/api/auth-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
    token?: string
    user?: PasswordAuthUser
  }
  if (!response.ok || !payload.token || !payload.user) {
    throw new Error(payload.error || 'Password reset failed')
  }
  setPasswordToken(payload.token)
  return { token: payload.token, user: payload.user }
}
