import type { WorklogFile } from '@/lib/collect-worklog-files'
import { parseMultipleWorklogs } from '@/lib/parse-worklog'
import type { WorklogEntry } from '@/lib/invoice-model'
import {
  fetchOneDriveProjectLinks,
  scannedFilesToWorklogs,
} from '@/lib/project-paths'
import { useProjectPathsStore } from '@/store/project-paths-store'

export interface LoadedCheckInWorklogs {
  files: WorklogFile[]
  entries: WorklogEntry[]
  source: 'checkin-folder' | 'none'
  notes: string[]
}

/**
 * Check-In reads text files from the OneDrive links currently saved in
 * Project paths & OneDrive. Generate's loaded Markdown files are invoice inputs.
 */
export async function loadWorklogsForCheckIn(): Promise<LoadedCheckInWorklogs> {
  const notes: string[] = []
  const worklogs: WorklogFile[] = []
  const links = useProjectPathsStore
    .getState()
    .paths.filter((entry) => entry.kind === 'onedrive')
    .map((entry) => entry.path)

  if (links.length === 0) {
    return {
      files: [],
      entries: [],
      source: 'none',
      notes: [
        'No OneDrive links are saved. Add a folder link under Project paths & OneDrive first.',
      ],
    }
  }

  try {
    const results = await fetchOneDriveProjectLinks(
      links,
      { extensions: ['.txt'] },
    )
    worklogs.push(
      ...scannedFilesToWorklogs(results.flatMap((result) => result.files)),
    )
    for (const result of results) {
      if (result.error) notes.push(`${result.label}: ${result.error}`)
    }
  } catch (error) {
    notes.push(
      error instanceof Error ? error.message : 'Check-In OneDrive fetch failed.',
    )
  }

  if (worklogs.length === 0) {
    return {
      files: [],
      entries: [],
      source: 'none',
      notes:
        notes.length > 0
          ? notes
          : ['The Check-In source folder returned no .txt files.'],
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
    source: 'checkin-folder',
    notes: [
      `Loaded ${worklogs.length} text file${worklogs.length === 1 ? '' : 's'} from ${links.length} saved OneDrive link${links.length === 1 ? '' : 's'}.`,
      ...notes,
      ...parsed.errors.slice(0, 3).map((error) => error.message),
    ],
  }
}
