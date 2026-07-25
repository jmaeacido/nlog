import { SignJWT, jwtVerify } from 'jose'
import { AuthError, type AuthenticatedUser } from './auth-shared.js'
import { sendPasswordResetEmail } from './brevo.js'
import {
  canPersistUsers,
  createUser,
  findUserByEmail,
  findUserByResetTokenHash,
  updateUser,
  type UserStoreEnv,
} from './user-store.js'

const JWT_ISSUER = 'nlog'
const JWT_AUDIENCE = 'nlog-app'
const TOKEN_TTL = '30d'
const RESET_TTL_MS = 60 * 60 * 1000

export interface PasswordAuthEnv extends UserStoreEnv {
  authSecret?: string
  registerCode?: string
  allowedEmails?: string
  /** Bootstrap users: email:password,email2:password2 */
  bootstrapUsers?: string
  brevoApiKey?: string
  fromEmail?: string
  appUrl?: string
}

export interface PasswordSessionUser extends AuthenticatedUser {
  provider: 'password'
}

function getSecretKey(secret: string | undefined): Uint8Array {
  if (!secret?.trim()) {
    throw new AuthError(
      'Password login is not configured. Set NLOG_AUTH_SECRET.',
      503,
    )
  }
  return new TextEncoder().encode(secret.trim())
}

function parseBootstrapUsers(
  raw: string | undefined,
): Array<{ email: string; password: string }> {
  if (!raw?.trim()) return []
  return raw
    .split(/[,;\n]/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const idx = chunk.indexOf(':')
      if (idx <= 0) return null
      return {
        email: chunk.slice(0, idx).trim().toLowerCase(),
        password: chunk.slice(idx + 1),
      }
    })
    .filter((entry): entry is { email: string; password: string } =>
      Boolean(entry?.email && entry.password),
    )
}

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[,;\n]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

function assertAllowedEmail(email: string, allowedEmails?: string) {
  const allowlist = parseAllowlist(allowedEmails)
  if (allowlist.length > 0 && !allowlist.includes(email)) {
    throw new AuthError('This email is not allowed to use NLog.', 403)
  }
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 120_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  )
  const hash = new Uint8Array(bits)
  const saltB64 = btoa(String.fromCharCode(...salt))
  const hashB64 = btoa(String.fromCharCode(...hash))
  return `pbkdf2$120000$${saltB64}$${hashB64}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, iterRaw, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'pbkdf2' || !iterRaw || !saltB64 || !hashB64) return false

  const iterations = Number(iterRaw)
  if (!Number.isFinite(iterations) || iterations < 10_000) return false

  const encoder = new TextEncoder()
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0))
  const expected = Uint8Array.from(atob(hashB64), (c) => c.charCodeAt(0))

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    expected.length * 8,
  )
  const actual = new Uint8Array(bits)
  if (actual.length !== expected.length) return false

  let diff = 0
  for (let i = 0; i < actual.length; i += 1) {
    diff |= actual[i]! ^ expected[i]!
  }
  return diff === 0
}

export async function signPasswordToken(
  user: PasswordSessionUser,
  authSecret: string | undefined,
): Promise<string> {
  const key = getSecretKey(authSecret)
  return new SignJWT({
    email: user.email,
    name: user.name,
    provider: 'password',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(key)
}

export async function verifyPasswordToken(
  token: string,
  authSecret: string | undefined,
): Promise<PasswordSessionUser | null> {
  if (!authSecret?.trim()) return null
  try {
    const { payload } = await jwtVerify(token, getSecretKey(authSecret), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    })
    if (payload.provider !== 'password') return null
    const email =
      typeof payload.email === 'string' ? payload.email.toLowerCase() : ''
    if (!email || !payload.sub) return null
    return {
      id: payload.sub,
      email,
      name: typeof payload.name === 'string' ? payload.name : null,
      provider: 'password',
    }
  } catch {
    return null
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function validateCredentials(email: string, password: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError('Enter a valid email address.', 400)
  }
  if (password.length < 8) {
    throw new AuthError('Password must be at least 8 characters.', 400)
  }
}

export async function registerPasswordUser(
  env: PasswordAuthEnv,
  input: {
    email: string
    password: string
    name?: string
    registerCode?: string
  },
): Promise<{ user: PasswordSessionUser; token: string }> {
  if (!env.authSecret?.trim()) {
    throw new AuthError(
      'Password login is not configured. Set NLOG_AUTH_SECRET.',
      503,
    )
  }
  if (!canPersistUsers(env)) {
    throw new AuthError(
      'Registration needs a user store. Locally this uses data/users.json; in production set Upstash Redis env vars.',
      503,
    )
  }

  const email = normalizeEmail(input.email)
  validateCredentials(email, input.password)
  assertAllowedEmail(email, env.allowedEmails)

  if (env.registerCode?.trim()) {
    if (input.registerCode?.trim() !== env.registerCode.trim()) {
      throw new AuthError('Invalid registration code.', 403)
    }
  }

  const existing = await findUserByEmail(env, email)
  if (existing) {
    throw new AuthError('An account with this email already exists.', 409)
  }

  const passwordHash = await hashPassword(input.password)
  const created = await createUser(env, {
    email,
    name: input.name?.trim() || null,
    passwordHash,
  })

  const user: PasswordSessionUser = {
    id: created.id,
    email: created.email,
    name: created.name,
    provider: 'password',
  }
  const token = await signPasswordToken(user, env.authSecret)
  return { user, token }
}

export async function loginPasswordUser(
  env: PasswordAuthEnv,
  input: { email: string; password: string },
): Promise<{ user: PasswordSessionUser; token: string }> {
  if (!env.authSecret?.trim()) {
    throw new AuthError(
      'Password login is not configured. Set NLOG_AUTH_SECRET.',
      503,
    )
  }

  const email = normalizeEmail(input.email)
  validateCredentials(email, input.password)
  assertAllowedEmail(email, env.allowedEmails)

  const stored = await findUserByEmail(env, email)
  if (stored) {
    const ok = await verifyPassword(input.password, stored.passwordHash)
    if (!ok) throw new AuthError('Invalid email or password.', 401)
    const user: PasswordSessionUser = {
      id: stored.id,
      email: stored.email,
      name: stored.name,
      provider: 'password',
    }
    return {
      user,
      token: await signPasswordToken(user, env.authSecret),
    }
  }

  const bootstrap = parseBootstrapUsers(env.bootstrapUsers).find(
    (entry) => entry.email === email,
  )
  if (bootstrap && bootstrap.password === input.password) {
    const user: PasswordSessionUser = {
      id: `bootstrap:${email}`,
      email,
      name: null,
      provider: 'password',
    }
    return {
      user,
      token: await signPasswordToken(user, env.authSecret),
    }
  }

  throw new AuthError('Invalid email or password.', 401)
}

export function passwordAuthConfigured(env: PasswordAuthEnv): boolean {
  return Boolean(env.authSecret?.trim())
}

export function registrationAvailable(env: PasswordAuthEnv): boolean {
  return passwordAuthConfigured(env) && canPersistUsers(env)
}

export function passwordResetAvailable(env: PasswordAuthEnv): boolean {
  return (
    passwordAuthConfigured(env) &&
    canPersistUsers(env) &&
    Boolean(env.brevoApiKey?.trim()) &&
    Boolean(env.fromEmail?.trim())
  )
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function resolveAppUrl(env: PasswordAuthEnv): string {
  const configured = env.appUrl?.trim().replace(/\/$/, '')
  if (configured) return configured
  return 'http://localhost:5173'
}

/**
 * Always returns the same generic message to avoid account enumeration.
 * Sends email only when the account exists and Brevo is configured.
 */
export async function requestPasswordReset(
  env: PasswordAuthEnv,
  input: { email: string },
): Promise<{ message: string }> {
  const generic = {
    message:
      'If an account exists for that email, a reset link has been sent.',
  }

  if (!passwordResetAvailable(env)) {
    throw new AuthError(
      'Password reset is not configured. Set BREVO_API_KEY and NLOG_FROM_EMAIL (or MAIL_FROM_ADDRESS).',
      503,
    )
  }

  const email = normalizeEmail(input.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError('Enter a valid email address.', 400)
  }

  // Do not reveal allowlist / existence details.
  try {
    assertAllowedEmail(email, env.allowedEmails)
  } catch {
    return generic
  }

  const user = await findUserByEmail(env, email)
  if (!user) {
    return generic
  }

  const token = randomToken()
  const tokenHash = await sha256Hex(token)
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString()

  await updateUser(env, user.id, {
    resetTokenHash: tokenHash,
    resetTokenExpiresAt: expiresAt,
  })

  const resetUrl = `${resolveAppUrl(env)}/?reset=${encodeURIComponent(token)}`

  try {
    await sendPasswordResetEmail({
      apiKey: env.brevoApiKey!,
      from: env.fromEmail!,
      to: email,
      resetUrl,
    })
  } catch (error) {
    // Clear token if email failed so a stuck hash isn't left behind.
    await updateUser(env, user.id, {
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    })
    throw new AuthError(
      error instanceof Error ? error.message : 'Could not send reset email.',
      502,
    )
  }

  return generic
}

export async function resetPasswordWithToken(
  env: PasswordAuthEnv,
  input: { token: string; password: string },
): Promise<{ user: PasswordSessionUser; token: string }> {
  if (!env.authSecret?.trim()) {
    throw new AuthError(
      'Password login is not configured. Set NLOG_AUTH_SECRET.',
      503,
    )
  }
  if (!canPersistUsers(env)) {
    throw new AuthError(
      'Password reset needs a user store. Locally this uses data/users.json; in production set Upstash Redis env vars.',
      503,
    )
  }

  const rawToken = input.token.trim()
  if (!rawToken || rawToken.length < 32) {
    throw new AuthError('Invalid or expired reset link.', 400)
  }
  if (input.password.length < 8) {
    throw new AuthError('Password must be at least 8 characters.', 400)
  }

  const tokenHash = await sha256Hex(rawToken)
  const user = await findUserByResetTokenHash(env, tokenHash)
  if (!user) {
    throw new AuthError('Invalid or expired reset link.', 400)
  }

  assertAllowedEmail(user.email, env.allowedEmails)

  const passwordHash = await hashPassword(input.password)
  const updated = await updateUser(env, user.id, {
    passwordHash,
    resetTokenHash: null,
    resetTokenExpiresAt: null,
  })

  const sessionUser: PasswordSessionUser = {
    id: updated.id,
    email: updated.email,
    name: updated.name,
    provider: 'password',
  }

  return {
    user: sessionUser,
    token: await signPasswordToken(sessionUser, env.authSecret),
  }
}
