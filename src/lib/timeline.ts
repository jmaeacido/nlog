import type { WorklogEntry } from './invoice-model'

export interface InvoiceTimeline {
  startDate: string
  endDate: string
  startTime: string
  endTime: string
}

export interface TimelineFilterResult {
  included: WorklogEntry[]
  excluded: WorklogEntry[]
  unparseable: WorklogEntry[]
}

export function parseWorklogSessionStart(time: string): Date | null {
  const normalized = time.replace(/\s*[–—-]\s*.+$/, '').trim()
  const match = normalized.match(
    /^(.+?\d{4}),\s*(\d{1,2}:\d{2}\s*[AP]M)$/i,
  )

  if (!match) return null

  const parsed = new Date(`${match[1]} ${match[2]}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Sort line items by worklog session start time (earliest first). */
export function sortLineItemsChronologically(items: WorklogEntry[]): WorklogEntry[] {
  return [...items]
    .map((item, index) => ({
      item,
      index,
      start: parseWorklogSessionStart(item.time),
    }))
    .sort((a, b) => {
      if (a.start && b.start) {
        const diff = a.start.getTime() - b.start.getTime()
        return diff !== 0 ? diff : a.index - b.index
      }
      if (a.start) return -1
      if (b.start) return 1
      return a.index - b.index
    })
    .map(({ item }) => item)
}

export function toTimelineStart(timeline: InvoiceTimeline): Date {
  if (timeline.startTime) {
    return new Date(`${timeline.startDate}T${timeline.startTime}:00`)
  }
  return new Date(`${timeline.startDate}T00:00:00`)
}

export function toTimelineEnd(timeline: InvoiceTimeline): Date {
  if (timeline.endTime) {
    return new Date(`${timeline.endDate}T${timeline.endTime}:59`)
  }
  const end = new Date(`${timeline.endDate}T23:59:59`)
  end.setMilliseconds(999)
  return end
}

export function filterLineItemsByTimeline(
  items: WorklogEntry[],
  timeline: InvoiceTimeline,
): TimelineFilterResult {
  const start = toTimelineStart(timeline)
  const end = toTimelineEnd(timeline)

  const included: WorklogEntry[] = []
  const excluded: WorklogEntry[] = []
  const unparseable: WorklogEntry[] = []

  for (const item of items) {
    const sessionStart = parseWorklogSessionStart(item.time)

    if (!sessionStart) {
      unparseable.push(item)
      continue
    }

    if (sessionStart >= start && sessionStart <= end) {
      included.push(item)
    } else {
      excluded.push(item)
    }
  }

  return {
    included: sortLineItemsChronologically(included),
    excluded,
    unparseable,
  }
}

export function formatBillingPeriodFromTimeline(timeline: InvoiceTimeline): string {
  const start = new Date(`${timeline.startDate}T12:00:00`)
  const end = new Date(`${timeline.endDate}T12:00:00`)

  const startMonth = start.toLocaleDateString('en-US', { month: 'long' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'long' })
  const startDay = start.getDate()
  const endDay = end.getDate()
  const year = end.getFullYear()

  if (startMonth === endMonth && start.getFullYear() === end.getFullYear()) {
    if (startDay === endDay) {
      return `${startMonth} ${startDay}, ${year}`
    }
    return `${startMonth} ${startDay}-${endDay}, ${year}`
  }

  const startLabel = `${startMonth} ${startDay}`
  const endLabel = `${endMonth} ${endDay}, ${year}`
  return `${startLabel}-${endLabel}`
}

export function formatTimelineLabel(timeline: InvoiceTimeline): string {
  const period = formatBillingPeriodFromTimeline(timeline)

  if (timeline.startTime && timeline.endTime) {
    return `${period} (${formatTime12h(timeline.startTime)} – ${formatTime12h(timeline.endTime)})`
  }

  return period
}

function formatTime12h(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`
}
