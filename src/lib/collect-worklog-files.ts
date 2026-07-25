export interface WorklogFile {
  id: string
  name: string
  /** Relative path including folders when available (e.g. Project/docs/worklog.md). */
  sourcePath: string
  /** Parent folder path derived from sourcePath, when known. */
  sourceFolder: string | null
  content: string
}

export function isMarkdownFile(file: File): boolean {
  const lower = file.name.toLowerCase()
  return (
    lower.endsWith('.md') ||
    file.type === 'text/markdown' ||
    file.type === 'text/plain'
  )
}

export function normalizeSourcePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\//, '').trim()
}

export function getSourceFolder(
  sourcePath: string,
  fileName: string,
): string | null {
  const normalized = normalizeSourcePath(sourcePath)
  if (!normalized || normalized === fileName) return null

  const parts = normalized.split('/').filter(Boolean)
  if (parts.length < 2) return null

  return parts.slice(0, -1).join('/')
}

export function getProjectFolderLabel(sourceFolder: string | null): string | null {
  if (!sourceFolder) return null
  const parts = sourceFolder.split('/').filter(Boolean)
  return parts[0] ?? sourceFolder
}

export async function fileToWorklogFile(
  file: File,
  pathOverride?: string,
): Promise<WorklogFile> {
  const sourcePath = normalizeSourcePath(
    pathOverride || file.webkitRelativePath || file.name,
  )

  return {
    id: crypto.randomUUID(),
    name: file.name,
    sourcePath,
    sourceFolder: getSourceFolder(sourcePath, file.name),
    content: await file.text(),
  }
}

export function createPastedWorklogFile(
  content: string,
  projectFolder?: string,
): WorklogFile {
  const folder = normalizeSourcePath(projectFolder ?? '')
  const name = 'pasted-worklog.md'
  const sourceFolder = folder || null
  const sourcePath = sourceFolder ? `${sourceFolder}/${name}` : name

  return {
    id: crypto.randomUUID(),
    name,
    sourcePath,
    sourceFolder,
    content,
  }
}

export function withProjectFolder(
  file: WorklogFile,
  projectFolder: string,
): WorklogFile {
  const folder = normalizeSourcePath(projectFolder)
  if (!folder) {
    return {
      ...file,
      sourcePath: file.name,
      sourceFolder: null,
    }
  }

  return {
    ...file,
    sourceFolder: folder,
    sourcePath: `${folder}/${file.name}`,
  }
}

export async function filesToWorklogFiles(
  files: File[],
  projectFolder?: string,
): Promise<WorklogFile[]> {
  const worklogs = await Promise.all(
    files.filter(isMarkdownFile).map((file) => fileToWorklogFile(file)),
  )

  if (!projectFolder?.trim()) return worklogs
  return worklogs.map((file) => withProjectFolder(file, projectFolder))
}

export async function collectMarkdownFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<File[]> {
  const collected: Array<File & { __nlogPath?: string }> = []

  if (dataTransfer.items?.length) {
    await Promise.all(
      [...dataTransfer.items].map(async (item) => {
        const entry = item.webkitGetAsEntry?.()
        if (entry) {
          collected.push(...(await traverseFileSystemEntry(entry)))
        }
      }),
    )
  }

  if (collected.length === 0 && dataTransfer.files.length > 0) {
    return Array.from(dataTransfer.files).filter(isMarkdownFile)
  }

  return collected.filter(isMarkdownFile)
}

/** Prefer this for drag/drop so folder paths from FileSystemEntry are kept. */
export async function collectWorklogFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<WorklogFile[]> {
  const collected: WorklogFile[] = []

  if (dataTransfer.items?.length) {
    await Promise.all(
      [...dataTransfer.items].map(async (item) => {
        const entry = item.webkitGetAsEntry?.()
        if (entry) {
          collected.push(...(await traverseEntryToWorklogs(entry)))
        }
      }),
    )
  }

  if (collected.length > 0) {
    return collected
  }

  if (dataTransfer.files.length > 0) {
    return filesToWorklogFiles(Array.from(dataTransfer.files))
  }

  return []
}

async function traverseEntryToWorklogs(
  entry: FileSystemEntry,
): Promise<WorklogFile[]> {
  if (entry.isFile) {
    return readWorklogFileEntry(entry as FileSystemFileEntry)
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const entries = await readAllDirectoryEntries(reader)
    const nested = await Promise.all(entries.map(traverseEntryToWorklogs))
    return nested.flat()
  }

  return []
}

function readWorklogFileEntry(
  entry: FileSystemFileEntry,
): Promise<WorklogFile[]> {
  return new Promise((resolve) => {
    entry.file(
      async (file) => {
        if (!isMarkdownFile(file)) {
          resolve([])
          return
        }
        resolve([await fileToWorklogFile(file, entry.fullPath)])
      },
      () => resolve([]),
    )
  })
}

async function traverseFileSystemEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return readFileEntry(entry as FileSystemFileEntry)
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const entries = await readAllDirectoryEntries(reader)
    const nested = await Promise.all(entries.map(traverseFileSystemEntry))
    return nested.flat()
  }

  return []
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File[]> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(isMarkdownFile(file) ? [file] : []),
      () => resolve([]),
    )
  })
}

function readAllDirectoryEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: FileSystemEntry[] = []

    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(entries)
            return
          }
          entries.push(...batch)
          readBatch()
        },
        reject,
      )
    }

    readBatch()
  })
}
