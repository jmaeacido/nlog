export interface CheckInCompletedItem {
  id: string
  client: string
  task: string
}

export interface CheckInCurrentlyWorking {
  client: string
  task: string
}

export interface CheckInBlocker {
  issue: string
  pointPerson: string
}

export interface CheckInDraft {
  name: string
  dateLabel: string
  projects: string
  currentlyWorking: CheckInCurrentlyWorking
  completed: CheckInCompletedItem[]
  pending: string
  blocker: CheckInBlocker
  helpFrom: string
  eta: string
  weekKey: string
}

export interface CheckInReport extends CheckInDraft {
  id: string
  savedAt: string
  updatedAt: string
}

export type CheckInCadenceStatus =
  | { kind: 'due_today'; label: string }
  | { kind: 'overdue'; label: string; sinceLabel: string }
  | { kind: 'upcoming'; label: string; nextLabel: string }

const EST = 'America/New_York'
const CHECKIN_WEEKDAYS = new Set([1, 3, 5]) // Mon, Wed, Fri

function estParts(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  const weekday = get('weekday')
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: weekdayMap[weekday] ?? 0,
    hour: Number(get('hour') === '24' ? '0' : get('hour')),
    minute: Number(get('minute')),
  }
}

/** Calendar date key in America/New_York: YYYY-MM-DD */
export function getEstDateKey(date: Date = new Date()): string {
  const { year, month, day } = estParts(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function addEstDays(year: number, month: number, day: number, delta: number) {
  const utc = new Date(Date.UTC(year, month - 1, day + delta))
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
    weekday: utc.getUTCDay(),
  }
}

function toDateKey(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function formatEstShort(year: number, month: number, day: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

/**
 * Alchemy check-in week starts Saturday (EST).
 * Returns the Saturday that opens the week containing `date`.
 */
export function getSaturdayWeekStart(date: Date = new Date()): {
  year: number
  month: number
  day: number
  weekday: number
} {
  const { year, month, day, weekday } = estParts(date)
  // Sat=0, Sun=1, … Fri=6 within the Sat-start week
  const daysSinceSaturday = (weekday + 1) % 7
  return addEstDays(year, month, day, -daysSinceSaturday)
}

/**
 * Week key for Sat-start check-in weeks: YYYY-MMDD of that Saturday.
 * Example: week of Sat Jul 19, 2026 → "2026-0719"
 */
export function getEstWeekKey(date: Date = new Date()): string {
  const sat = getSaturdayWeekStart(date)
  return `${sat.year}-${String(sat.month).padStart(2, '0')}${String(sat.day).padStart(2, '0')}`
}

export type CheckInReportDay = 'Mon' | 'Wed' | 'Fri' | 'Other'

/**
 * week_to_date — Mon: Sat–Mon, Wed: Sat–Wed, Fri: Sat–Fri
 * segment — Mon: Sat–Mon, Wed: Tue–Wed, Fri: Thu–Fri
 */
export type CheckInCoverageMode = 'week_to_date' | 'segment'

export interface CheckInReportScope {
  weekKey: string
  mode: CheckInCoverageMode
  /** Inclusive YYYY-MM-DD */
  startDate: string
  /** Inclusive YYYY-MM-DD (report day / today) */
  endDate: string
  reportDay: CheckInReportDay
  /** Human label, e.g. "Sat Jul 19 – Wed Jul 22 (Sat–Wed)" */
  label: string
  /** Days covered, e.g. "Sat–Mon" or "Tue–Wed" */
  coverage: string
}

/**
 * MWF report windows (America/New_York).
 *
 * week_to_date (cumulative from Saturday):
 * - Mon → Sat–Mon · Wed → Sat–Wed · Fri → Sat–Fri
 *
 * segment (period since last check-in):
 * - Mon → Sat–Mon · Wed → Tue–Wed · Fri → Thu–Fri
 */
export function getCheckInReportScope(
  date: Date = new Date(),
  mode: CheckInCoverageMode = 'week_to_date',
): CheckInReportScope {
  const sat = getSaturdayWeekStart(date)
  const today = estParts(date)
  const weekKey = getEstWeekKey(date)
  const endDate = toDateKey(today)

  let reportDay: CheckInReportDay = 'Other'
  if (today.weekday === 1) reportDay = 'Mon'
  else if (today.weekday === 3) reportDay = 'Wed'
  else if (today.weekday === 5) reportDay = 'Fri'

  let startParts = sat
  let coverage = 'Sat–today'

  if (mode === 'segment') {
    // Mon: Sat–Mon; Wed: Tue–Wed; Fri: Thu–Fri
    // Mid-cycle drafts use the start of the upcoming/current segment through today.
    if (today.weekday === 1 || today.weekday === 6 || today.weekday === 0) {
      // Sat, Sun, Mon → Mon segment (Sat–…)
      startParts = sat
      coverage =
        today.weekday === 1
          ? 'Sat–Mon'
          : today.weekday === 6
            ? 'Sat'
            : 'Sat–Sun'
    } else if (today.weekday === 2 || today.weekday === 3) {
      // Tue, Wed → Wed segment (Tue–…)
      startParts = addEstDays(sat.year, sat.month, sat.day, 3) // Saturday + 3 = Tuesday
      coverage = today.weekday === 3 ? 'Tue–Wed' : 'Tue'
    } else {
      // Thu, Fri → Fri segment (Thu–…)
      startParts = addEstDays(sat.year, sat.month, sat.day, 5) // Saturday + 5 = Thursday
      coverage = today.weekday === 5 ? 'Thu–Fri' : 'Thu'
    }
  } else {
    // week_to_date: always from Saturday through today
    startParts = sat
    if (today.weekday === 1) coverage = 'Sat–Mon'
    else if (today.weekday === 3) coverage = 'Sat–Wed'
    else if (today.weekday === 5) coverage = 'Sat–Fri'
    else if (today.weekday === 6) coverage = 'Sat'
    else if (today.weekday === 0) coverage = 'Sat–Sun'
    else if (today.weekday === 2) coverage = 'Sat–Tue'
    else if (today.weekday === 4) coverage = 'Sat–Thu'
  }

  const startDate = toDateKey(startParts)
  const label = `${formatEstShort(startParts.year, startParts.month, startParts.day)} – ${formatEstShort(today.year, today.month, today.day)} (${coverage})`

  return {
    weekKey,
    mode,
    startDate,
    endDate,
    reportDay,
    label,
    coverage,
  }
}

export function isDateKeyInReportScope(
  dateKey: string,
  scope: Pick<CheckInReportScope, 'startDate' | 'endDate'>,
): boolean {
  return dateKey >= scope.startDate && dateKey <= scope.endDate
}

export function formatCheckInDateLabel(
  date: Date = new Date(),
  mode: CheckInCoverageMode = 'week_to_date',
): string {
  const { weekday } = estParts(date)
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayName = dayNames[weekday]
  const checkInDay =
    weekday === 1 ? 'Mon' : weekday === 3 ? 'Wed' : weekday === 5 ? 'Fri' : dayName

  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: EST,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)

  const scope = getCheckInReportScope(date, mode)
  return `${checkInDay} check-in · ${formatted} · ${scope.coverage}`
}

export function emptyCompletedItem(): CheckInCompletedItem {
  return {
    id: crypto.randomUUID(),
    client: '',
    task: '',
  }
}

/** Split a completed task field into one deliverable per line. */
export function splitCompletedTasks(task: string): string[] {
  return task
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
}

/**
 * One row per client; tasks stacked as newline-separated deliverables.
 * Merges duplicate clients (case-insensitive).
 */
export function groupCompletedByClient(
  items: CheckInCompletedItem[],
): CheckInCompletedItem[] {
  const order: string[] = []
  const map = new Map<string, CheckInCompletedItem>()

  for (const item of items) {
    const client = item.client.trim()
    const tasks = splitCompletedTasks(item.task)
    if (!client && tasks.length === 0) continue

    const key = client.toLowerCase() || `__anon_${item.id}`
    const existing = map.get(key)
    if (!existing) {
      order.push(key)
      map.set(key, {
        id: item.id,
        client: client || item.client,
        task: tasks.join('\n'),
      })
      continue
    }

    const merged = new Set([
      ...splitCompletedTasks(existing.task),
      ...tasks,
    ])
    existing.task = [...merged].join('\n')
    if (!existing.client.trim() && client) existing.client = client
  }

  const grouped = order.map((key) => map.get(key)!)
  return grouped.length > 0 ? grouped : [emptyCompletedItem()]
}

export function formatCompletedBlockForSlack(
  items: CheckInCompletedItem[],
): string[] {
  const grouped = groupCompletedByClient(items).filter(
    (item) => item.client.trim() || item.task.trim(),
  )

  if (grouped.length === 0) {
    return [
      'Client 1 - [name]',
      'Task:',
      '[deliverable as a whole]',
    ]
  }

  const lines: string[] = []
  grouped.forEach((item, index) => {
    if (index > 0) lines.push('')
    lines.push(`Client ${index + 1} - ${item.client.trim() || '[name]'}`)
    lines.push('Task:')
    const tasks = splitCompletedTasks(item.task)
    if (tasks.length === 0) {
      lines.push('[deliverable as a whole]')
    } else {
      lines.push(...tasks)
    }
  })
  return lines
}

export function createEmptyDraft(name = ''): CheckInDraft {
  return {
    name,
    dateLabel: formatCheckInDateLabel(),
    projects: '',
    currentlyWorking: { client: '', task: '' },
    completed: [emptyCompletedItem()],
    pending: '',
    blocker: { issue: '', pointPerson: '' },
    helpFrom: '',
    eta: '',
    weekKey: getEstWeekKey(),
  }
}

export function createReportFromDraft(draft: CheckInDraft): CheckInReport {
  const now = new Date().toISOString()
  const completed = groupCompletedByClient(draft.completed).filter(
    (item) => item.client.trim() || item.task.trim(),
  )
  return {
    ...draft,
    id: crypto.randomUUID(),
    savedAt: now,
    updatedAt: now,
    weekKey: draft.weekKey || getEstWeekKey(),
    completed,
  }
}

export function draftFromReport(
  report: CheckInReport,
  options?: { refreshDateLabel?: boolean; name?: string },
): CheckInDraft {
  const { refreshDateLabel = false, name } = options ?? {}
  return {
    name: name ?? report.name,
    dateLabel: refreshDateLabel
      ? formatCheckInDateLabel()
      : report.dateLabel,
    projects: report.projects,
    currentlyWorking: { ...report.currentlyWorking },
    completed:
      report.completed.length > 0
        ? report.completed.map((item) => ({ ...item }))
        : [emptyCompletedItem()],
    pending: report.pending,
    blocker: { ...report.blocker },
    helpFrom: report.helpFrom,
    eta: report.eta,
    weekKey: report.weekKey,
  }
}

/** Carry Completed forward for the same week; refresh date / clear active fields. */
export function startNextDraftFrom(
  previous: CheckInDraft | CheckInReport,
  name?: string,
): CheckInDraft {
  const weekKey = getEstWeekKey()
  const sameWeek = previous.weekKey === weekKey

  return {
    name: name ?? previous.name,
    dateLabel: formatCheckInDateLabel(),
    projects: sameWeek ? previous.projects : '',
    currentlyWorking: { client: '', task: '' },
    completed: sameWeek
      ? previous.completed.map((item) => ({ ...item }))
      : [emptyCompletedItem()],
    pending: sameWeek ? previous.pending : '',
    blocker: { issue: '', pointPerson: '' },
    helpFrom: '',
    eta: '',
    weekKey,
  }
}

export function formatCheckInForSlack(draft: CheckInDraft | CheckInReport): string {
  const completedLines = formatCompletedBlockForSlack(draft.completed)

  const blockerIssue = draft.blocker.issue.trim()
  const blockerPerson = draft.blocker.pointPerson.trim()
  const blockerBlock =
    blockerIssue || blockerPerson
      ? [
          'Blocker (if any):',
          `- What's blocking: ${blockerIssue || '[specific issue, not "waiting on approval"]'}`,
          `- Point Person to answer this: ${blockerPerson || '[name]'}`,
        ].join('\n')
      : ['Blocker (if any):', '- None'].join('\n')

  return [
    `Name: ${draft.name.trim()}`,
    `Date: ${draft.dateLabel.trim()}`,
    `Project(s): ${draft.projects.trim()}`,
    '',
    'Currently working on:',
    `Client: ${draft.currentlyWorking.client.trim()}`,
    'Task:',
    draft.currentlyWorking.task.trim() || '',
    '',
    'Completed this week so far (group by client; list deliverables under Task):',
    ...completedLines,
    '',
    `Pending / up next:`,
    draft.pending.trim() || '',
    '',
    blockerBlock,
    '',
    'Who I need help or confirmation from (non-blocking, general):',
    draft.helpFrom.trim() || '',
    '',
    'ETA on current item:',
    draft.eta.trim() || '',
  ].join('\n')
}

export function getCheckInCadenceStatus(
  date: Date = new Date(),
  mode: CheckInCoverageMode = 'week_to_date',
): CheckInCadenceStatus {
  const { year, month, day, weekday, hour, minute } = estParts(date)
  const minutes = hour * 60 + minute
  const beforeNine = minutes < 9 * 60
  const scope = getCheckInReportScope(date, mode)

  if (CHECKIN_WEEKDAYS.has(weekday)) {
    if (beforeNine) {
      return {
        kind: 'due_today',
        label: `Check-in due today before 9am EST · covers ${scope.coverage}`,
      }
    }
    return {
      kind: 'overdue',
      label: `Today’s check-in window has passed (due before 9am EST) · covers ${scope.coverage}`,
      sinceLabel: formatEstShort(year, month, day),
    }
  }

  // Find next check-in day
  let forward = 1
  let next = addEstDays(year, month, day, forward)
  while (!CHECKIN_WEEKDAYS.has(next.weekday) && forward < 7) {
    forward += 1
    next = addEstDays(year, month, day, forward)
  }

  return {
    kind: 'upcoming',
    label: `Next check-in: Mon / Wed / Fri before 9am EST · this draft covers ${scope.coverage}`,
    nextLabel: formatEstShort(next.year, next.month, next.day),
  }
}

export function completedLinesForWeek(
  reports: CheckInReport[],
  weekKey: string = getEstWeekKey(),
): CheckInCompletedItem[] {
  const forWeek = reports.filter((report) => report.weekKey === weekKey)
  if (forWeek.length === 0) return []

  // Prefer the newest report’s completed list (append-only within week)
  const newest = [...forWeek].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )[0]

  return groupCompletedByClient(newest.completed).filter(
    (item) => item.client.trim() || item.task.trim(),
  )
}
