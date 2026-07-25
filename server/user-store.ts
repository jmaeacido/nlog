export interface StoredUser {
  id: string
  email: string
  name: string | null
  passwordHash: string
  createdAt: string
  resetTokenHash?: string | null
  resetTokenExpiresAt?: string | null
}

export interface UserStoreEnv {
  /** Absolute or cwd-relative path for local JSON store (Node/Vite only) */
  usersFilePath?: string
  upstashUrl?: string
  upstashToken?: string
}

export interface FileUserStoreAdapter {
  read: (filePath: string) => Promise<StoredUser[]>
  write: (filePath: string, users: StoredUser[]) => Promise<void>
}

declare global {
  // Injected by Vite plugin for local file persistence (not available on Edge).
  // eslint-disable-next-line no-var
  var __nlogFileUserStoreAdapter: FileUserStoreAdapter | undefined
}

const REDIS_KEY = 'nlog:password-users'

export function registerFileUserStoreAdapter(
  adapter: FileUserStoreAdapter,
): void {
  globalThis.__nlogFileUserStoreAdapter = adapter
}

function getFileAdapter(): FileUserStoreAdapter | null {
  return globalThis.__nlogFileUserStoreAdapter ?? null
}

async function readUpstash(
  url: string,
  token: string,
): Promise<StoredUser[] | null> {
  const response = await fetch(`${url}/get/${encodeURIComponent(REDIS_KEY)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  const payload = (await response.json()) as { result?: string | null }
  if (!payload.result) return []
  try {
    const parsed = JSON.parse(payload.result) as StoredUser[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeUpstash(
  url: string,
  token: string,
  users: StoredUser[],
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['SET', REDIS_KEY, JSON.stringify(users)]),
  })
  if (!response.ok) {
    throw new Error('Could not save user account (Upstash write failed).')
  }
}

export function canPersistUsers(env: UserStoreEnv): boolean {
  return Boolean(
    (env.upstashUrl && env.upstashToken) ||
      (env.usersFilePath && getFileAdapter()),
  )
}

export async function listUsers(env: UserStoreEnv): Promise<StoredUser[]> {
  if (env.upstashUrl && env.upstashToken) {
    const users = await readUpstash(env.upstashUrl, env.upstashToken)
    if (users) return users
  }

  if (env.usersFilePath) {
    const adapter = getFileAdapter()
    if (adapter) return adapter.read(env.usersFilePath)
  }

  return []
}

export async function saveUsers(
  env: UserStoreEnv,
  users: StoredUser[],
): Promise<void> {
  if (env.upstashUrl && env.upstashToken) {
    await writeUpstash(env.upstashUrl, env.upstashToken, users)
    return
  }

  if (env.usersFilePath) {
    const adapter = getFileAdapter()
    if (adapter) {
      await adapter.write(env.usersFilePath, users)
      return
    }
  }

  throw new Error(
    'User registration is not configured. Set UPSTASH_REDIS_REST_URL/TOKEN (Vercel) or run locally with the Vite file store.',
  )
}

export async function findUserByEmail(
  env: UserStoreEnv,
  email: string,
): Promise<StoredUser | null> {
  const normalized = email.trim().toLowerCase()
  const users = await listUsers(env)
  return users.find((user) => user.email === normalized) ?? null
}

export async function createUser(
  env: UserStoreEnv,
  input: Omit<StoredUser, 'id' | 'createdAt'> & { id?: string },
): Promise<StoredUser> {
  const users = await listUsers(env)
  const email = input.email.trim().toLowerCase()
  if (users.some((user) => user.email === email)) {
    throw new Error('An account with this email already exists.')
  }

  const user: StoredUser = {
    id: input.id || crypto.randomUUID(),
    email,
    name: input.name?.trim() || null,
    passwordHash: input.passwordHash,
    createdAt: new Date().toISOString(),
  }
  users.push(user)
  await saveUsers(env, users)
  return user
}

export async function updateUser(
  env: UserStoreEnv,
  userId: string,
  patch: Partial<
    Pick<
      StoredUser,
      | 'passwordHash'
      | 'name'
      | 'resetTokenHash'
      | 'resetTokenExpiresAt'
    >
  >,
): Promise<StoredUser> {
  const users = await listUsers(env)
  const index = users.findIndex((user) => user.id === userId)
  if (index < 0) {
    throw new Error('User not found.')
  }
  const current = users[index]!
  const next: StoredUser = {
    ...current,
    ...patch,
  }
  users[index] = next
  await saveUsers(env, users)
  return next
}

export async function findUserByResetTokenHash(
  env: UserStoreEnv,
  tokenHash: string,
): Promise<StoredUser | null> {
  const users = await listUsers(env)
  const now = Date.now()
  return (
    users.find((user) => {
      if (!user.resetTokenHash || user.resetTokenHash !== tokenHash) return false
      if (!user.resetTokenExpiresAt) return false
      return Date.parse(user.resetTokenExpiresAt) > now
    }) ?? null
  )
}
