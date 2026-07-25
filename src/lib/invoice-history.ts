import type { ComputedInvoice } from './invoice-model'

export type InvoiceExportFormat = 'pdf' | 'xlsx'

export interface InvoiceHistoryEntry {
  id: string
  savedAt: string
  updatedAt: string
  exportedFormats: InvoiceExportFormat[]
  invoice: ComputedInvoice
  projects: string[]
}

export function buildHistoryFingerprint(invoice: ComputedInvoice): string {
  return [
    invoice.invoiceNumber.trim(),
    invoice.timelineStartDate,
    invoice.timelineEndDate,
    invoice.timelineStartTime,
    invoice.timelineEndTime,
    invoice.totals.totalDue.toFixed(2),
    invoice.totals.totalHours.toFixed(2),
    String(invoice.lineItemsWithAmounts.length),
  ].join('|')
}

export function createHistoryEntry(
  invoice: ComputedInvoice,
  format: InvoiceExportFormat,
  existing?: InvoiceHistoryEntry,
): InvoiceHistoryEntry {
  const now = new Date().toISOString()
  const projects = [
    ...new Set(invoice.lineItemsWithAmounts.map((item) => item.project)),
  ]

  if (existing) {
    const formats = existing.exportedFormats.includes(format)
      ? existing.exportedFormats
      : [...existing.exportedFormats, format]

    return {
      ...existing,
      updatedAt: now,
      exportedFormats: formats,
      invoice,
      projects,
    }
  }

  return {
    id: crypto.randomUUID(),
    savedAt: now,
    updatedAt: now,
    exportedFormats: [format],
    invoice,
    projects,
  }
}
