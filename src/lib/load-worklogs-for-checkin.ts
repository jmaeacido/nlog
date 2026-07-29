import type { WorklogFile } from '@/lib/collect-worklog-files'
import { parseMultipleWorklogs } from '@/lib/parse-worklog'
import type { WorklogEntry } from '@/lib/invoice-model'
import {
  getCheckInReportScope,
  type CheckInReportScope,
} from '@/lib/checkin-model'
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

export interface CheckInFileMetadata {
  clientProject: string
  date: string
  reportLabel: string
}

/**
 * Expected shape:
 * "Wednesday Report Draft (Hydro Boost - 7-29-2026).txt"
 * The date may use M-D-YYYY, M_D_YYYY, or YYYY-MM-DD separators.
 */
export function parseCheckInFileMetadata(
  fileName: string,
): CheckInFileMetadata | null {
  const stem = fileName.replace(/\.txt$/i, '').trim()
  const match = stem.match(
    /^(.*?)\(\s*(.*?)\s*[-–—]\s*(\d{1,4})[-_/](\d{1,2})[-_/](\d{1,4})\s*\)\s*$/i,
  )
  if (!match) return null

  const [, reportLabelRaw, clientProjectRaw, first, second, third] = match
  let year: number
  let month: number
  let day: number

  if (first.length === 4) {
    year = Number(first)
    month = Number(second)
    day = Number(third)
  } else {
    month = Number(first)
    day = Number(second)
    year = Number(third)
  }

  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    year < 2000 ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day
  ) {
    return null
  }

  return {
    clientProject: clientProjectRaw.trim(),
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    reportLabel: reportLabelRaw.trim(),
  }
}

/**
 * Check-In reads text files from the OneDrive links currently saved in
 * Project paths & OneDrive. Generate's loaded Markdown files are invoice inputs.
 */
export async function loadWorklogsForCheckIn(options?: {
  scope?: CheckInReportScope
}): Promise<LoadedCheckInWorklogs> {
  const notes: string[] = []
  const worklogs: WorklogFile[] = []
  const scope = options?.scope ?? getCheckInReportScope()
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
    const fetched = scannedFilesToWorklogs(
      results.flatMap((result) => result.files),
    )
    const malformed: string[] = []
    const outsideScope: string[] = []

    for (const file of fetched) {
      const metadata = parseCheckInFileMetadata(file.name)
      if (!metadata) {
        malformed.push(file.name)
        continue
      }
      if (metadata.date < scope.startDate || metadata.date > scope.endDate) {
        outsideScope.push(file.name)
        continue
      }
      worklogs.push(file)
    }

    worklogs.sort((left, right) => {
      const leftMeta = parseCheckInFileMetadata(left.name)
      const rightMeta = parseCheckInFileMetadata(right.name)
      return (
        (leftMeta?.date ?? '').localeCompare(rightMeta?.date ?? '') ||
        (leftMeta?.clientProject ?? '').localeCompare(
          rightMeta?.clientProject ?? '',
        )
      )
    })

    if (malformed.length > 0) {
      notes.push(
        `Skipped ${malformed.length} .txt file${malformed.length === 1 ? '' : 's'} without a recognizable "(Project - date)" filename.`,
      )
    }
    if (outsideScope.length > 0) {
      notes.push(
        `Excluded ${outsideScope.length} file${outsideScope.length === 1 ? '' : 's'} outside ${scope.coverage}.`,
      )
    }
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
          : [
              `No correctly named .txt files matched ${scope.startDate} through ${scope.endDate}.`,
            ],
    }
  }

  const tableFiles = worklogs.filter((file) =>
    /\|\s*time\s*\|[\s\S]*\|\s*(?:description|description)\s*\|[\s\S]*\|\s*qty\s*\|/i.test(
      file.content,
    ),
  )
  const parsed = await parseMultipleWorklogs(
    tableFiles.map((file) => ({
      name: file.name,
      content: file.content,
    })),
  )

  return {
    files: worklogs,
    entries: parsed.entries,
    source: 'checkin-folder',
    notes: [
      `Loaded ${worklogs.length} dated text file${worklogs.length === 1 ? '' : 's'} for ${scope.coverage} from ${links.length} saved OneDrive link${links.length === 1 ? '' : 's'}.`,
      ...notes,
      ...parsed.errors.slice(0, 3).map((error) => error.message),
    ],
  }
}
