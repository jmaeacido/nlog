import { verifyPasswordToken } from './password-auth.js'
import {
  AuthError,
  type AppAuthUser,
  type AuthenticatedUser,
} from './auth-shared.js'

export {
  AuthError,
  type AppAuthUser,
  type AuthenticatedUser,
} from './auth-shared.js'

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[,;\n]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get('authorization')
  if (!auth) return null
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim())
  return match?.[1]?.trim() || null
}

export async function requireMicrosoftUserFromToken(
  token: string | null | undefined,
  allowedEmailsEnv?: string,
): Promise<AuthenticatedUser> {
  const user = await requireAppUserFromToken(token, {
    allowedEmails: allowedEmailsEnv,
  })
  return {
    id: user.id,
    email: user.email,
    name: user.name,
  }
}

async function requireMicrosoftProfile(
  token: string,
  allowedEmailsEnv?: string,
): Promise<AppAuthUser> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new AuthError('Invalid or expired Microsoft session. Sign in again.', 401)
  }

  const profile = (await response.json()) as {
    id?: string
    displayName?: string
    mail?: string
    userPrincipalName?: string
  }

  const email = (profile.mail || profile.userPrincipalName || '')
    .trim()
    .toLowerCase()

  if (!email) {
    throw new AuthError('Microsoft account email could not be verified.', 401)
  }

  const allowlist = parseAllowlist(allowedEmailsEnv)
  if (allowlist.length > 0 && !allowlist.includes(email)) {
    throw new AuthError(
      'This Microsoft account is not allowed to use NLog.',
      403,
    )
  }

  return {
    id: profile.id || email,
    email,
    name: profile.displayName?.trim() || null,
    provider: 'microsoft',
  }
}

export async function requireAppUserFromToken(
  token: string | null | undefined,
  env: { authSecret?: string; allowedEmails?: string },
): Promise<AppAuthUser> {
  if (!token?.trim()) {
    throw new AuthError('Sign in required.', 401)
  }

  const passwordUser = await verifyPasswordToken(token, env.authSecret)
  if (passwordUser) {
    const allowlist = parseAllowlist(env.allowedEmails)
    if (allowlist.length > 0 && !allowlist.includes(passwordUser.email)) {
      throw new AuthError('This email is not allowed to use NLog.', 403)
    }
    return passwordUser
  }

  return requireMicrosoftProfile(token, env.allowedEmails)
}

export async function requireMicrosoftUser(
  request: Request,
  allowedEmailsEnv?: string,
): Promise<AuthenticatedUser> {
  return requireMicrosoftUserFromToken(getBearerToken(request), allowedEmailsEnv)
}

export async function requireAuthUser(
  request: Request,
  env: {
    authSecret?: string
    allowedEmails?: string
  },
): Promise<AppAuthUser> {
  return requireAppUserFromToken(getBearerToken(request), env)
}

export function authErrorResponse(error: unknown): Response | null {
  if (!(error instanceof AuthError)) return null
  return new Response(JSON.stringify({ error: error.message }), {
    status: error.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
