import { getMicrosoftAccessToken } from './microsoft-auth'
import {
  getAuthProvider,
  getPasswordToken,
} from './password-auth'

export class ApiAuthError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiAuthError'
    this.status = status
  }
}

export async function getApiAccessToken(): Promise<string | null> {
  const provider = getAuthProvider()
  if (provider === 'password') {
    return getPasswordToken()
  }
  if (provider === 'microsoft') {
    return getMicrosoftAccessToken()
  }
  return getPasswordToken() || (await getMicrosoftAccessToken())
}

export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getApiAccessToken()
  if (!token) {
    throw new ApiAuthError('Sign in required.', 401)
  }

  const headers = new Headers(init.headers)
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (!headers.has('X-Microsoft-Token') && getAuthProvider() === 'password') {
    const msToken = await getMicrosoftAccessToken().catch(() => null)
    if (msToken) {
      headers.set('X-Microsoft-Token', msToken)
    }
  }

  return fetch(input, {
    ...init,
    headers,
  })
}

export async function apiJson<T>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await apiFetch(input, init)
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
  } & T

  if (!response.ok) {
    throw new ApiAuthError(
      payload.error || `Request failed (${response.status})`,
      response.status,
    )
  }

  return payload
}
