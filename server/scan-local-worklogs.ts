import fs from 'node:fs/promises'
import path from 'node:path'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'vendor',
  '.next',
  'coverage',
  '.turbo',
  '.cache',
])

const MAX_FILES_PER_PATH = 40
const MAX_FILE_BYTES = 1_500_000

export interface ScannedWorklogFile {
  name: string
  sourcePath: string
  sourceFolder: string | null
  absolutePath: string
  content: string
}

export interface ScanLocalWorklogsResult {
  path: string
  projectLabel: string
  files: ScannedWorklogFile[]
  skipped: string[]
  error?: string
}

function isLikelyLocalHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false
  const host = hostHeader.split(':')[0]?.toLowerCase()
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.test') ||
    host.endsWith('.local')
  )
}

export function assertLocalScanAllowed(hostHeader: string | undefined) {
  if (!isLikelyLocalHost(hostHeader)) {
    throw new Error(
      'Local path scanning only works when NLog is running on your machine (npm run dev / Laragon). The hosted site cannot read C:\\ paths.',
    )
  }
}

async function collectMarkdownFiles(rootDir: string): Promise<string[]> {
  const found: string[] = []

  async function walk(current: string) {
    if (found.length >= MAX_FILES_PER_PATH) return

    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (found.length >= MAX_FILES_PER_PATH) break
      if (entry.name === '.' || entry.name === '..') continue

      const full = path.join(current, entry.name)

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        await walk(full)
        continue
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        found.push(full)
      }
    }
  }

  await walk(rootDir)
  return found
}

function toPosixRelative(rootDir: string, absoluteFile: string): string {
  const relative = path.relative(rootDir, absoluteFile)
  return relative.split(path.sep).join('/')
}

export async function scanLocalWorklogPaths(
  paths: string[],
): Promise<ScanLocalWorklogsResult[]> {
  const uniquePaths = [
    ...new Set(
      paths
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ]

  const results: ScanLocalWorklogsResult[] = []

  for (const rawPath of uniquePaths) {
    const resolved = path.resolve(rawPath)
    const projectLabel = path.basename(resolved) || resolved
    const skipped: string[] = []

    try {
      const stat = await fs.stat(resolved)
      if (!stat.isDirectory()) {
        results.push({
          path: rawPath,
          projectLabel,
          files: [],
          skipped,
          error: 'Path is not a directory.',
        })
        continue
      }

      const markdownFiles = await collectMarkdownFiles(resolved)
      const files: ScannedWorklogFile[] = []

      for (const absolutePath of markdownFiles) {
        try {
          const fileStat = await fs.stat(absolutePath)
          if (fileStat.size > MAX_FILE_BYTES) {
            skipped.push(`${absolutePath} (too large)`)
            continue
          }

          const content = await fs.readFile(absolutePath, 'utf8')
          const relative = toPosixRelative(resolved, absolutePath)
          const name = path.basename(absolutePath)
          const relativeDir = path.posix.dirname(relative)
          const sourceFolder =
            !relativeDir || relativeDir === '.'
              ? projectLabel
              : `${projectLabel}/${relativeDir}`

          files.push({
            name,
            sourcePath: `${projectLabel}/${relative}`,
            sourceFolder,
            absolutePath,
            content,
          })
        } catch {
          skipped.push(absolutePath)
        }
      }

      results.push({
        path: rawPath,
        projectLabel,
        files,
        skipped,
      })
    } catch (error) {
      results.push({
        path: rawPath,
        projectLabel,
        files: [],
        skipped,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to read this path.',
      })
    }
  }

  return results
}
