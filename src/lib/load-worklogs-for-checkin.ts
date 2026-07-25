import type { WorklogFile } from '@/lib/collect-worklog-files'
import { parseMultipleWorklogs } from '@/lib/parse-worklog'
import type { WorklogEntry } from '@/lib/invoice-model'
import {
  fetchOneDriveProjectLinks,
  scanLocalProjectPaths,
  scannedFilesToWorklogs,
} from '@/lib/project-paths'
import { useInvoiceStore } from '@/store/invoice-store'
import { useProjectPathsStore } from '@/store/project-paths-store'

export interface LoadedCheckInWorklogs {
  files: WorklogFile[]
  entries: WorklogEntry[]
  source: 'invoice' | 'project-paths' | 'none'
  notes: string[]
}

/**
 * Prefer worklogs already loaded in Generate; otherwise fetch from saved
 * project paths / OneDrive links.
 */
export async function loadWorklogsForCheckIn(): Promise<LoadedCheckInWorklogs> {
  const notes: string[] = []
  const invoiceFiles = useInvoiceStore.getState().worklogFiles

  if (invoiceFiles.length > 0) {
    const parsed = await parseMultipleWorklogs(
      invoiceFiles.map((file) => ({
        name: file.name,
        content: file.content,
      })),
    )
    return {
      files: invoiceFiles,
      entries: parsed.entries,
      source: 'invoice',
      notes: [
        `Using ${invoiceFiles.length} worklog file${invoiceFiles.length === 1 ? '' : 's'} already loaded in Generate.`,
        ...parsed.errors.slice(0, 3).map((error) => error.message),
      ],
    }
  }

  const paths = useProjectPathsStore.getState().paths
  if (paths.length === 0) {
    return {
      files: [],
      entries: [],
      source: 'none',
      notes: [
        'No worklogs in Generate and no saved project paths. Add sources on Generate, or load worklogs first.',
      ],
    }
  }

  const local = paths.filter((entry) => entry.kind === 'local')
  const onedrive = paths.filter((entry) => entry.kind === 'onedrive')
  const worklogs: WorklogFile[] = []

  if (local.length > 0) {
    try {
      const results = await scanLocalProjectPaths(local.map((entry) => entry.path))
      worklogs.push(
        ...scannedFilesToWorklogs(results.flatMap((result) => result.files)),
      )
      for (const result of results) {
        if (result.error) notes.push(`${result.projectLabel}: ${result.error}`)
      }
    } catch (error) {
      notes.push(
        error instanceof Error
          ? error.message
          : 'Local path scan failed (often unavailable on hosted preview).',
      )
    }
  }

  if (onedrive.length > 0) {
    try {
      const results = await fetchOneDriveProjectLinks(
        onedrive.map((entry) => entry.path),
      )
      worklogs.push(
        ...scannedFilesToWorklogs(results.flatMap((result) => result.files)),
      )
      for (const result of results) {
        if (result.error) notes.push(`${result.label}: ${result.error}`)
      }
    } catch (error) {
      notes.push(
        error instanceof Error ? error.message : 'OneDrive fetch failed.',
      )
    }
  }

  if (worklogs.length === 0) {
    return {
      files: [],
      entries: [],
      source: 'none',
      notes:
        notes.length > 0
          ? notes
          : ['Saved sources returned no markdown worklogs.'],
    }
  }

  const parsed = await parseMultipleWorklogs(
    worklogs.map((file) => ({
      name: file.name,
      content: file.content,
    })),
  )

  return {
    files: worklogs,
    entries: parsed.entries,
    source: 'project-paths',
    notes: [
      `Loaded ${worklogs.length} markdown file${worklogs.length === 1 ? '' : 's'} from saved sources.`,
      ...notes,
      ...parsed.errors.slice(0, 3).map((error) => error.message),
    ],
  }
}
