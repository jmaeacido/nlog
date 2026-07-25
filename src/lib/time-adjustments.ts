import type { WorklogEntry } from './invoice-model'
import { createWorklogEntryId, withWorklogIdentity } from './invoice-model'

export function roundHours(value: number): number {
  return Math.round(value * 100) / 100
}

export function getOriginalHours(entry: WorklogEntry): number {
  return entry.originalQtyHours ?? entry.qtyHours
}

export function isHoursAdjusted(entry: WorklogEntry): boolean {
  if (entry.isManualAdjustment) return true
  if (entry.originalQtyHours == null) return false
  return roundHours(entry.originalQtyHours) !== roundHours(entry.qtyHours)
}

export function getHoursDelta(entry: WorklogEntry): number {
  return roundHours(entry.qtyHours - getOriginalHours(entry))
}

export function setEntryHours(
  entry: WorklogEntry,
  nextHours: number,
  reason?: string,
): WorklogEntry {
  const qtyHours = roundHours(Math.max(0.01, nextHours))
  const originalQtyHours = entry.originalQtyHours ?? entry.qtyHours

  return {
    ...entry,
    originalQtyHours,
    qtyHours,
    adjustmentReason: reason?.trim() || entry.adjustmentReason,
  }
}

export function adjustEntryHoursByDelta(
  entry: WorklogEntry,
  deltaHours: number,
  reason?: string,
): WorklogEntry {
  return setEntryHours(entry, entry.qtyHours + deltaHours, reason)
}

export function resetEntryHours(entry: WorklogEntry): WorklogEntry {
  if (entry.originalQtyHours == null) {
    return {
      ...entry,
      adjustmentReason: undefined,
    }
  }

  return {
    ...entry,
    qtyHours: roundHours(entry.originalQtyHours),
    adjustmentReason: undefined,
  }
}

export function createManualAdjustmentEntry(input: {
  hours: number
  reason: string
  project?: string
  timelineStartDate?: string
  timelineEndDate?: string
}): WorklogEntry {
  const hours = roundHours(Math.max(0.01, input.hours))
  const project = input.project?.trim() || 'General'
  const reason = input.reason.trim() || 'Manual time adjustment'
  const dateLabel = formatAdjustmentDateLabel(
    input.timelineStartDate,
    input.timelineEndDate,
  )

  const sign = hours >= 0 ? '+' : ''
  // hours is always positive after Math.max; direction encoded in description if needed
  const description = `${project} — Time adjustment (${sign}${hours.toFixed(2)} Hours), ${dateLabel}. ${reason}`

  return withWorklogIdentity({
    id: createWorklogEntryId(),
    time: `${dateLabel}, 12:00 PM – 12:00 PM`,
    description,
    qtyHours: hours,
    project,
    originalQtyHours: hours,
    adjustmentReason: reason,
    isManualAdjustment: true,
  })
}

function formatAdjustmentDateLabel(
  startDate?: string,
  endDate?: string,
): string {
  const source = endDate || startDate
  if (!source) {
    return new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const date = new Date(`${source}T12:00:00`)
  if (Number.isNaN(date.getTime())) {
    return source
  }

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function summarizeAdjustments(entries: WorklogEntry[]): {
  adjustedCount: number
  manualCount: number
  netDeltaHours: number
} {
  let adjustedCount = 0
  let manualCount = 0
  let netDeltaHours = 0

  for (const entry of entries) {
    if (entry.isManualAdjustment) {
      manualCount += 1
      netDeltaHours = roundHours(netDeltaHours + entry.qtyHours)
      continue
    }
    if (isHoursAdjusted(entry)) {
      adjustedCount += 1
      netDeltaHours = roundHours(netDeltaHours + getHoursDelta(entry))
    }
  }

  return { adjustedCount, manualCount, netDeltaHours }
}
