import type { StoredUser } from './user-store.js'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function readUsersFile(filePath: string): Promise<StoredUser[]> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as StoredUser[]
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function writeUsersFile(
  filePath: string,
  users: StoredUser[],
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(users, null, 2)}\n`, 'utf8')
}
