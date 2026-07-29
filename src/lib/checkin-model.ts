export interface CheckInClientItem {
  id: string
  client: string
  task: string
}

export type CheckInCompletedItem = CheckInClientItem
export type CheckInCurrentlyWorking = CheckInClientItem

export interface CheckInBlocker extends CheckInClientItem {
  issue: string
  pointPerson: string
}

export interface CheckInDraft {
  name: string
  dateLabel: string
  projects: string
  currentlyWorking: CheckInClientItem[]
  completed: CheckInCompletedItem[]
  pending: CheckInClientItem[]
  blocker: CheckInBlocker[]
  helpFrom: CheckInClientItem[]
  eta: CheckInClientItem[]
  weekKey: string
}

export const CHECK_IN_CONTRACTOR_NAME = 'John Mark Agustin E. Acido'

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
  _mode: CheckInCoverageMode = 'week_to_date',
): string {
  const { weekday } = estParts(date)
  const reportSuffix =
    weekday === 1
      ? 'Monday Report'
      : weekday === 3
        ? 'Wednesday Report'
        : weekday === 5
          ? 'Friday Report'
          : 'Check-in'

  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: EST,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)

  return `${formatted} (${reportSuffix})`
}

export function emptyCompletedItem(): CheckInCompletedItem {
  return {
    id: crypto.randomUUID(),
    client: '',
    task: '',
  }
}

export function emptyClientItem(): CheckInClientItem {
  return emptyCompletedItem()
}

export function emptyBlockerItem(): CheckInBlocker {
  return {
    id: crypto.randomUUID(),
    client: '',
    task: '',
    issue: '',
    pointPerson: '',
  }
}

/** Split a completed task field into one deliverable per line. */
export function splitCompletedTasks(task: string): string[] {
  return task
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
}

export function normalizeCheckInClientName(client: string): string {
  return client
    .trim()
    .replace(/^alchemydev\s*[-–—:]\s*/i, '')
    .replace(/\s+/g, ' ')
}

function checkInClientKey(client: string): string {
  return normalizeCheckInClientName(client)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function splitEmbeddedClientBlocks(
  fallbackClient: string,
  content: string,
): Array<{ client: string; task: string }> {
  const blocks: Array<{ client: string; lines: string[] }> = []
  let current: { client: string; lines: string[] } | null = null
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    const match = line.match(/^client\s*:\s*(.+)$/i)
    if (match) {
      current = {
        client: normalizeCheckInClientName(match[1]),
        lines: [],
      }
      blocks.push(current)
      continue
    }
    if (current && line) {
      current.lines.push(line.replace(/^(?:task|pending|eta)\s*:\s*/i, ''))
    }
  }
  if (!blocks.length) {
    return [{
      client: normalizeCheckInClientName(fallbackClient),
      task: content.trim(),
    }]
  }
  return blocks.map((block) => ({
    client: block.client,
    task: block.lines.join('\n'),
  }))
}

/**
 * One row per deliverable (not per client).
 * Expands legacy multi-line Task fields and dedupes identical client+task pairs.
 */
export function consolidateClientItems<T extends CheckInClientItem>(
  items: T[],
): T[] {
  const grouped = new Map<string, T>()

  for (const item of items) {
    for (const block of splitEmbeddedClientBlocks(item.client, item.task)) {
      const client = block.client
      if (!client && !block.task.trim()) continue
      const key = checkInClientKey(client)
      const prior = grouped.get(key)
      if (!prior) {
        grouped.set(key, { ...item, client, task: block.task.trim() })
        continue
      }
      const tasks = [...splitCompletedTasks(prior.task), ...splitCompletedTasks(block.task)]
      prior.task = [...new Set(tasks.map((task) => task.trim()).filter(Boolean))].join('\n')
    }
  }

  return [...grouped.values()]
}

export function consolidateBlockers(items: CheckInBlocker[]): CheckInBlocker[] {
  const grouped = new Map<string, CheckInBlocker>()
  for (const item of items) {
    const combined = [item.issue, item.pointPerson].filter(Boolean).join('\n')
    const embedded = splitEmbeddedClientBlocks(item.client, combined)
    if (/^client\s*:/im.test(combined)) {
      for (const block of embedded) {
        const issue: string[] = []
        const people: string[] = []
        let target: 'issue' | 'people' = 'issue'
        for (const rawLine of block.task.split('\n')) {
          if (/^point person(?: to answer this)?\s*:/i.test(rawLine)) {
            target = 'people'
            people.push(rawLine.replace(/^point person(?: to answer this)?\s*:\s*/i, ''))
          } else if (/^what'?s blocking\s*:/i.test(rawLine)) {
            target = 'issue'
            issue.push(rawLine.replace(/^what'?s blocking\s*:\s*/i, ''))
          } else {
            ;(target === 'people' ? people : issue).push(rawLine)
          }
        }
        const key = checkInClientKey(block.client)
        const prior = grouped.get(key)
        if (!prior) {
          grouped.set(key, {
            ...emptyBlockerItem(),
            client: block.client,
            issue: issue.filter(Boolean).join('\n'),
            pointPerson: people.filter(Boolean).join('\n'),
          })
        } else {
          prior.issue = [...new Set([...splitCompletedTasks(prior.issue), ...issue])].filter(Boolean).join('\n')
          prior.pointPerson = [...new Set([...splitCompletedTasks(prior.pointPerson), ...people])].filter(Boolean).join('\n')
        }
      }
      continue
    }
    const client = normalizeCheckInClientName(item.client)
    if (!client && !item.issue.trim() && !item.pointPerson.trim()) continue
    const key = checkInClientKey(client)
    const prior = grouped.get(key)
    if (!prior) {
      grouped.set(key, { ...item, client, task: '' })
      continue
    }
    prior.issue = [...new Set([...splitCompletedTasks(prior.issue), ...splitCompletedTasks(item.issue)])].join('\n')
    prior.pointPerson = [...new Set([...splitCompletedTasks(prior.pointPerson), ...splitCompletedTasks(item.pointPerson)])].join('\n')
  }
  return [...grouped.values()]
}

function formatClientItems(items: CheckInClientItem[]): string[] {
  const consolidated = consolidateClientItems(items)
  if (!consolidated.length) return ['None']
  const lines: string[] = []
  for (const item of consolidated) {
    lines.push(`Client: ${item.client}`)
    for (const task of splitCompletedTasks(item.task)) lines.push(`Task: ${task}`)
    lines.push('')
  }
  if (lines.at(-1) === '') lines.pop()
  return lines
}

function formatBlockers(items: CheckInBlocker[]): string[] {
  const consolidated = consolidateBlockers(items)
  if (!consolidated.length) return ['None']
  const lines: string[] = []
  for (const item of consolidated) {
    lines.push(`Client: ${item.client}`)
    lines.push(`What's blocking: ${item.issue}`)
    lines.push(`Point Person to answer this: ${item.pointPerson}`)
    lines.push('')
  }
  if (lines.at(-1) === '') lines.pop()
  return lines
}

export function normalizeCompletedDeliverables(
  items: CheckInCompletedItem[],
): CheckInCompletedItem[] {
  const result = consolidateClientItems(items)
  return result.length > 0 ? result : [emptyCompletedItem()]
}

/**
 * @deprecated Use normalizeCompletedDeliverables — Completed is one row per deliverable.
 * Kept as an alias so older call sites keep working during the format switch.
 */
export function groupCompletedByClient(
  items: CheckInCompletedItem[],
): CheckInCompletedItem[] {
  return normalizeCompletedDeliverables(items)
}

export function formatCompletedBlockForSlack(
  items: CheckInCompletedItem[],
): string[] {
  const deliverables = consolidateClientItems(items).filter(
    (item) => item.client.trim() || item.task.trim(),
  )

  if (deliverables.length === 0) {
    return ['', 'None']
  }

  const lines: string[] = ['']
  for (const item of deliverables) {
    lines.push(`Client: ${item.client.trim() || '[name]'}`)
    for (const task of splitCompletedTasks(item.task)) lines.push(`Task: ${task}`)
    lines.push('')
  }
  // Trailing blank is handled by the parent join; drop the last empty line
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function createEmptyDraft(name = CHECK_IN_CONTRACTOR_NAME): CheckInDraft {
  return {
    name,
    dateLabel: formatCheckInDateLabel(),
    projects: '',
    currentlyWorking: [emptyClientItem()],
    completed: [emptyCompletedItem()],
    pending: [emptyClientItem()],
    blocker: [emptyBlockerItem()],
    helpFrom: [emptyClientItem()],
    eta: [emptyClientItem()],
    weekKey: getEstWeekKey(),
  }
}

export function createReportFromDraft(draft: CheckInDraft): CheckInReport {
  const now = new Date().toISOString()
  const completed = consolidateClientItems(draft.completed).filter(
    (item) => item.client.trim() || item.task.trim(),
  )
  return {
    ...draft,
    id: crypto.randomUUID(),
    savedAt: now,
    updatedAt: now,
    weekKey: draft.weekKey || getEstWeekKey(),
    currentlyWorking: consolidateClientItems(draft.currentlyWorking),
    completed,
    pending: consolidateClientItems(draft.pending),
    blocker: consolidateBlockers(draft.blocker),
    helpFrom: consolidateClientItems(draft.helpFrom),
    eta: consolidateClientItems(draft.eta),
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
    currentlyWorking:
      report.currentlyWorking.length > 0
        ? report.currentlyWorking.map((item) => ({ ...item }))
        : [emptyClientItem()],
    completed:
      report.completed.length > 0
        ? report.completed.map((item) => ({ ...item }))
        : [emptyCompletedItem()],
    pending: report.pending.length ? report.pending.map((item) => ({ ...item })) : [emptyClientItem()],
    blocker: report.blocker.length ? report.blocker.map((item) => ({ ...item })) : [emptyBlockerItem()],
    helpFrom: report.helpFrom.length ? report.helpFrom.map((item) => ({ ...item })) : [emptyClientItem()],
    eta: report.eta.length ? report.eta.map((item) => ({ ...item })) : [emptyClientItem()],
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
    currentlyWorking: [emptyClientItem()],
    completed: sameWeek
      ? previous.completed.map((item) => ({ ...item }))
      : [emptyCompletedItem()],
    pending: sameWeek ? previous.pending.map((item) => ({ ...item })) : [emptyClientItem()],
    blocker: [emptyBlockerItem()],
    helpFrom: [emptyClientItem()],
    eta: [emptyClientItem()],
    weekKey,
  }
}

export function formatCheckInForSlack(draft: CheckInDraft | CheckInReport): string {
  const completedLines = formatCompletedBlockForSlack(draft.completed)
  const currentLines = formatClientItems(draft.currentlyWorking)
  const pendingLines = formatClientItems(draft.pending)
  const helpLines = formatClientItems(draft.helpFrom)
  const etaLines = formatClientItems(draft.eta)
  const blockerLines = formatBlockers(draft.blocker)

  return [
    `Name: ${draft.name.trim()}`,
    `Date: ${draft.dateLabel.trim()}`,
    `Project(s): ${draft.projects.trim()}`,
    '',
    'Currently working on:',
    '',
    ...currentLines,
    '',
    'Completed this week so far (group by deliverable, not sub-steps):',
    ...completedLines,
    '',
    'Pending / up next:',
    '',
    ...pendingLines,
    '',
    'Blocker (if any):',
    '',
    ...blockerLines,
    '',
    'Who I need help or confirmation from (non-blocking, general):',
    '',
    ...helpLines,
    '',
    'ETA on current item:',
    '',
    ...etaLines,
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

  return normalizeCompletedDeliverables(newest.completed).filter(
    (item) => item.client.trim() || item.task.trim(),
  )
}
