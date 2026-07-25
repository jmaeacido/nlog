import type { WorklogEntry } from './invoice-model'

export type WorklogEntryInput = Omit<WorklogEntry, 'id'> & { id?: string }

export interface EnhanceWorklogResult {
  entries: WorklogEntryInput[]
  notes: string[]
}

export interface InvoiceReportResult {
  summary: string
  highlights: string[]
  risks: string[]
  projectBreakdown: Array<{
    project: string
    hours: number
    amountUsd: number
    note?: string
  }>
}

export interface LoggerChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LoggerChatContext {
  step?: number
  worklogFileCount?: number
  lineItemCount?: number
  billableEntryCount?: number
  excludedEntryCount?: number
  unparseableEntryCount?: number
  parseErrorCount?: number
  parseWarningCount?: number
  usedAiParse?: boolean
  invoiceNumber?: string
  billingPeriod?: string
      timelineLabel?: string
      timelineStartDate?: string
      timelineEndDate?: string
  historyCount?: number
  recentHistory?: Array<{
    invoiceNumber: string
    billingPeriod: string
    totalDue: number
    savedAt: string
  }>
  adjustedEntryCount?: number
  manualAdjustmentCount?: number
  netAdjustmentHours?: number
  adjustedEntries?: Array<{
    project: string
    qtyHours: number
    originalQtyHours: number
    deltaHours: number
    reason?: string
    isManualAdjustment: boolean
  }>
  hourlyRateUsd?: number
  hourlyRatePhp?: number
  taxPercent?: number
  discountUsd?: number
  totalHours?: number
  subtotalUsd?: number
  taxAmountUsd?: number
  totalDue?: number
  totalDuePhp?: number
  allLineItemCount?: number
  allTotalHours?: number
  allTotalDue?: number
  usdPhpRate?: number
  usdPhpAsOf?: string
  usdPhpProvider?: string
  projects?: string[]
  recentDescriptions?: string[]
  checkIn?: {
    dateLabel?: string
    weekKey?: string
    projects?: string
    currentlyWorking?: { client?: string; task?: string }
    completedCount?: number
    completedPreview?: Array<{ client: string; task: string }>
    pending?: string
    hasBlocker?: boolean
    eta?: string
  }
  checkInWorklogPreview?: Array<{
    time: string
    project: string
    description: string
    qtyHours: number
  }>
}

export interface LoggerChatResult {
  reply: string
}

export interface ProposedCheckInResult {
  analysis?: string
  projects: string
  currentlyWorking: { client: string; task: string }
  completed: Array<{ client: string; task: string }>
  pending: string
  blocker: { issue: string; pointPerson: string }
  helpFrom: string
  eta: string
  notes: string[]
}
