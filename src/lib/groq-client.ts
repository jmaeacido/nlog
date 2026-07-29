import type {
  EnhanceWorklogResult,
  InvoiceReportResult,
  LoggerChatContext,
  LoggerChatMessage,
  LoggerChatResult,
  ProposedCheckInResult,
} from './groq-types'
import type { WorklogEntry } from './invoice-model'
import { withWorklogIdentity } from './invoice-model'

export type {
  EnhanceWorklogResult,
  InvoiceReportResult,
  LoggerChatContext,
  LoggerChatMessage,
  LoggerChatResult,
  ProposedCheckInResult,
}

import { apiJson } from './api-client'

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function requestWorklogEnhance(input: {
  markdown: string
  sourceName?: string
  deterministicErrors?: string[]
}): Promise<EnhanceWorklogResult> {
  return postJson<EnhanceWorklogResult>('/api/enhance-worklog', input)
}

export async function requestInvoiceReport(input: unknown): Promise<InvoiceReportResult> {
  return postJson<InvoiceReportResult>('/api/invoice-report', input)
}

export async function requestLoggerChat(input: {
  messages: LoggerChatMessage[]
  context?: LoggerChatContext
}): Promise<LoggerChatResult> {
  return postJson<LoggerChatResult>('/api/logger-chat', input)
}

export async function requestProposeCheckIn(input: {
  contractorName?: string
  dateLabel?: string
  weekKey?: string
  reportScope?: {
    startDate: string
    endDate: string
    reportDay: string
    label: string
    coverage: string
    mode?: string
  }
  existingDraft?: {
    projects?: string
    currentlyWorking?: { client?: string; task?: string }
    completed?: Array<{ client: string; task: string }>
    pending?: string
    blocker?: { issue?: string; pointPerson?: string }
    helpFrom?: string
    eta?: string
  }
  worklogEntries: Array<{
    time: string
    project: string
    description: string
    qtyHours: number
    estDate?: string
    inReportScope?: boolean
  }>
  sourceDocuments?: Array<{
    name: string
    sourcePath: string
    clientProject?: string
    reportDate?: string
    reportLabel?: string
    content: string
  }>
}): Promise<ProposedCheckInResult> {
  return postJson<ProposedCheckInResult>('/api/propose-checkin', input)
}

export function normalizeAiEntries(
  entries: EnhanceWorklogResult['entries'],
): WorklogEntry[] {
  return entries
    .filter(
      (entry) =>
        entry.description?.trim() &&
        Number.isFinite(entry.qtyHours) &&
        entry.qtyHours > 0 &&
        entry.time?.trim(),
    )
    .map((entry) => {
      const qtyHours = Number(entry.qtyHours.toFixed(2))
      return withWorklogIdentity({
        time: entry.time.trim(),
        description: entry.description.trim(),
        qtyHours,
        project: entry.project?.trim() || 'General',
        originalQtyHours: qtyHours,
      })
    })
}
