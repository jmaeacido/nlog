import type { WorklogFile } from './collect-worklog-files'
import { apiJson } from './api-client'

export interface ScannedWorklogFilePayload {
  name: string
  sourcePath: string
  sourceFolder: string | null
  absolutePath?: string
  content: string
}

export interface ScanLocalPathResult {
  path: string
  projectLabel: string
  files: ScannedWorklogFilePayload[]
  skipped: string[]
  error?: string
}

export async function scanLocalProjectPaths(
  paths: string[],
): Promise<ScanLocalPathResult[]> {
  const payload = await apiJson<{ results?: ScanLocalPathResult[] }>(
    '/api/scan-local-worklogs',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    },
  )

  return payload.results ?? []
}

export interface OneDriveFetchResult {
  link: string
  label: string
  files: ScannedWorklogFilePayload[]
  skipped: string[]
  error?: string
}

export async function fetchOneDriveProjectLinks(
  links: string[],
  options?: { extensions?: string[] },
): Promise<OneDriveFetchResult[]> {
  const payload = await apiJson<{ results?: OneDriveFetchResult[] }>(
    '/api/fetch-onedrive-worklogs',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links, extensions: options?.extensions }),
    },
  )

  return payload.results ?? []
}

export function scannedFilesToWorklogs(
  files: ScannedWorklogFilePayload[],
): WorklogFile[] {
  return files.map((file) => ({
    id: crypto.randomUUID(),
    name: file.name,
    sourcePath: file.sourcePath,
    sourceFolder: file.sourceFolder,
    content: file.content,
  }))
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

type FileSystemPermissionMode = 'read' | 'readwrite'

interface FileSystemHandlePermissionDescriptor {
  mode?: FileSystemPermissionMode
}

interface NlogFileSystemHandle {
  queryPermission?: (
    descriptor?: FileSystemHandlePermissionDescriptor,
  ) => Promise<PermissionState>
  requestPermission?: (
    descriptor?: FileSystemHandlePermissionDescriptor,
  ) => Promise<PermissionState>
}

interface NlogFileSystemFileHandle extends NlogFileSystemHandle {
  kind: 'file'
  name: string
  getFile: () => Promise<File>
}

interface NlogFileSystemDirectoryHandle extends NlogFileSystemHandle {
  kind: 'directory'
  name: string
  values: () => AsyncIterableIterator<
    NlogFileSystemFileHandle | NlogFileSystemDirectoryHandle
  >
}

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<NlogFileSystemDirectoryHandle>
  }
}

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'vendor',
  '.next',
  'coverage',
])

async function ensureReadPermission(
  handle: NlogFileSystemHandle,
): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true
  const options = { mode: 'read' as const }
  if ((await handle.queryPermission(options)) === 'granted') return true
  return (await handle.requestPermission(options)) === 'granted'
}

async function collectFromDirectoryHandle(
  directory: NlogFileSystemDirectoryHandle,
  projectLabel: string,
  relativeDir = '',
): Promise<WorklogFile[]> {
  const files: WorklogFile[] = []

  for await (const entry of directory.values()) {
    if (entry.kind === 'directory') {
      if (SKIP_DIR_NAMES.has(entry.name) || entry.name.startsWith('.')) continue
      const nextRelative = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name
      files.push(
        ...(await collectFromDirectoryHandle(entry, projectLabel, nextRelative)),
      )
      continue
    }

    if (!entry.name.toLowerCase().endsWith('.md')) continue

    const file = await entry.getFile()
    const sourceFolder = relativeDir
      ? `${projectLabel}/${relativeDir}`
      : projectLabel
    const sourcePath = relativeDir
      ? `${projectLabel}/${relativeDir}/${entry.name}`
      : `${projectLabel}/${entry.name}`

    files.push({
      id: crypto.randomUUID(),
      name: entry.name,
      sourcePath,
      sourceFolder,
      content: await file.text(),
    })
  }

  return files
}

/** Chrome/Edge: pick a folder and read markdown worklogs (works on hosted PWA too). */
export async function pickDirectoryAndLoadWorklogs(): Promise<WorklogFile[]> {
  if (!window.showDirectoryPicker) {
    throw new Error(
      'Folder linking needs Chrome or Edge. Use Add Folder, or run NLog locally to scan C:\\ paths.',
    )
  }

  const directory = await window.showDirectoryPicker()
  const allowed = await ensureReadPermission(directory)
  if (!allowed) {
    throw new Error('Permission to read that folder was denied.')
  }

  return collectFromDirectoryHandle(directory, directory.name)
}
