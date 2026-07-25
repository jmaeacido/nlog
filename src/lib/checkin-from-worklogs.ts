import type { WorklogEntry } from '@/lib/invoice-model'
import {
  emptyCompletedItem,
  getCheckInReportScope,
  getEstDateKey,
  getEstWeekKey,
  groupCompletedByClient,
  isDateKeyInReportScope,
  type CheckInCompletedItem,
  type CheckInDraft,
  type CheckInReportScope,
} from '@/lib/checkin-model'
import { parseWorklogSessionStart } from '@/lib/timeline'

function extractTaskTitle(description: string, project: string): string {
  let rest = description.trim()
  const em = rest.split('—')
  if (em.length > 1) {
    rest = em.slice(1).join('—').trim()
  } else {
    const dash = rest.split(' - ')
    if (
      dash.length > 1 &&
      dash[0].trim().toLowerCase() === project.trim().toLowerCase()
    ) {
      rest = dash.slice(1).join(' - ').trim()
    }
  }

  const dateSplit = rest.match(
    /^(.+?),\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}\b/i,
  )
  if (dateSplit) {
    rest = dateSplit[1].trim()
  } else {
    const period = rest.indexOf('.')
    if (period > 12 && period < 120) {
      rest = rest.slice(0, period).trim()
    }
  }

  return rest || description.trim()
}

export interface WorklogPrefillResult {
  draftPatch: Partial<CheckInDraft>
  weekEntryCount: number
  projectCount: number
  scope: CheckInReportScope
  notes: string[]
}

/**
 * Map worklog entries → check-in fields for the selected report coverage window.
 * Only in-scope rows are used — never silently expands to all worklogs.
 */
export function buildCheckInPrefillFromEntries(
  entries: WorklogEntry[],
  options?: {
    existingCompleted?: CheckInCompletedItem[]
    scope?: CheckInReportScope
    /** When true (default), only keep prior completed clients that also appear in-scope. */
    mergeExistingCompleted?: boolean
  },
): WorklogPrefillResult {
  const scope = options?.scope ?? getCheckInReportScope()
  const mergeExisting = options?.mergeExistingCompleted ?? false
  const modeLabel =
    scope.mode === 'segment' ? 'Since last check-in' : 'Week to date'
  const notes: string[] = [
    `${modeLabel}: ${scope.label}.`,
  ]

  const dated = entries.map((entry) => ({
    entry,
    start: parseWorklogSessionStart(entry.time),
  }))

  const inScope = dated.filter(({ start }) => {
    if (!start) return false
    return isDateKeyInReportScope(getEstDateKey(start), scope)
  })

  const unparseable = dated.filter(({ start }) => !start).length
  if (unparseable > 0) {
    notes.push(
      `${unparseable} entr${unparseable === 1 ? 'y' : 'ies'} had unparseable times and were skipped.`,
    )
  }

  const outOfScope = dated.length - inScope.length - unparseable
  if (outOfScope > 0) {
    notes.push(
      `${outOfScope} entr${outOfScope === 1 ? 'y' : 'ies'} outside ${scope.coverage} were excluded.`,
    )
  }

  if (inScope.length === 0) {
    return {
      draftPatch: {},
      weekEntryCount: 0,
      projectCount: 0,
      scope,
      notes: [
        ...notes,
        `No worklog entries in ${scope.coverage} (${scope.startDate} → ${scope.endDate}).`,
      ],
    }
  }

  const pool = inScope
  const projects = [
    ...new Set(pool.map(({ entry }) => entry.project.trim()).filter(Boolean)),
  ]

  const byClient = new Map<string, { client: string; tasks: string[] }>()
  for (const { entry } of pool) {
    const client = entry.project.trim() || 'General'
    const task = extractTaskTitle(entry.description, client)
    const key = client.toLowerCase()
    const bucket = byClient.get(key)
    if (!bucket) {
      byClient.set(key, { client, tasks: task ? [task] : [] })
      continue
    }
    if (
      task &&
      !bucket.tasks.some((t) => t.toLowerCase() === task.toLowerCase())
    ) {
      bucket.tasks.push(task)
    }
  }

  const fromWorklogs: CheckInCompletedItem[] = [...byClient.values()].map(
    (bucket) => ({
      id: crypto.randomUUID(),
      client: bucket.client,
      task: bucket.tasks.join('\n'),
    }),
  )

  // Prefill is coverage-scoped: default replace. Optional merge only keeps
  // prior completed rows whose client still appears in this window.
  let completed = fromWorklogs
  if (mergeExisting && options?.existingCompleted?.length) {
    const inScopeClients = new Set(
      fromWorklogs.map((item) => item.client.trim().toLowerCase()),
    )
    const priorInScope = options.existingCompleted.filter((item) =>
      inScopeClients.has(item.client.trim().toLowerCase()),
    )
    completed = groupCompletedByClient([...priorInScope, ...fromWorklogs])
  } else {
    completed = groupCompletedByClient(fromWorklogs)
  }

  const latest = [...pool].sort((a, b) => {
    const at = a.start?.getTime() ?? 0
    const bt = b.start?.getTime() ?? 0
    return bt - at
  })[0]

  const currentClient = latest.entry.project.trim() || 'General'
  const currentTask = extractTaskTitle(latest.entry.description, currentClient)

  return {
    draftPatch: {
      projects: projects.join(', '),
      currentlyWorking: {
        client: currentClient,
        task: currentTask,
      },
      completed: completed.length > 0 ? completed : [emptyCompletedItem()],
      // Clear period-specific fields so stale values from another coverage don't linger
      pending: '',
      blocker: { issue: '', pointPerson: '' },
      helpFrom: '',
      eta: '',
      weekKey: scope.weekKey,
    },
    weekEntryCount: pool.length,
    projectCount: projects.length,
    scope,
    notes,
  }
}

/** Compact in-scope entries for Groq — out-of-coverage rows are excluded. */
export function summarizeEntriesForCheckInAi(
  entries: WorklogEntry[],
  options?: { scope?: CheckInReportScope; limit?: number },
): Array<{
  time: string
  project: string
  description: string
  qtyHours: number
  estDate?: string
  inReportScope: boolean
}> {
  const scope = options?.scope ?? getCheckInReportScope()
  const limit = options?.limit ?? 24

  const enriched = entries
    .map((entry) => {
      const start = parseWorklogSessionStart(entry.time)
      const estDate = start ? getEstDateKey(start) : undefined
      const inReportScope = estDate
        ? isDateKeyInReportScope(estDate, scope)
        : false
      return { entry, start, estDate, inReportScope }
    })
    .filter((row) => row.inReportScope)

  const sorted = [...enriched].sort((a, b) => {
    const as = a.start?.getTime() ?? 0
    const bs = b.start?.getTime() ?? 0
    return bs - as
  })

  return sorted.slice(0, limit).map((row) => ({
    time: row.entry.time,
    project: row.entry.project,
    description: row.entry.description.slice(0, 180),
    qtyHours: row.entry.qtyHours,
    estDate: row.estDate,
    inReportScope: true,
  }))
}

export { getEstWeekKey }
