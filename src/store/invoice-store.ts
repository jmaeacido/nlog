import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WorklogEntry } from '@/lib/invoice-model'
import type { WorklogFile } from '@/lib/collect-worklog-files'
import { withProjectFolder } from '@/lib/collect-worklog-files'
import type { ParseError, SourceParseSummary } from '@/lib/parse-worklog'
import { parseMultipleWorklogsWithAi } from '@/lib/parse-worklog-ai'
import type { InvoiceFormValues } from '@/lib/invoice-schema'
import { defaultFormValues } from '@/lib/invoice-schema'
import type { InvoiceReportResult } from '@/lib/groq-types'
import {
  adjustEntryHoursByDelta,
  createManualAdjustmentEntry,
  resetEntryHours,
  setEntryHours,
} from '@/lib/time-adjustments'
import { sortLineItemsChronologically } from '@/lib/timeline'

export type WizardStep = 1 | 2 | 3

interface InvoiceState {
  step: WizardStep
  worklogFiles: WorklogFile[]
  lineItems: WorklogEntry[]
  sourceSummaries: SourceParseSummary[]
  parseErrors: ParseError[]
  parseWarnings: ParseError[]
  aiNotes: string[]
  aiEnhancedSources: string[]
  usedAiParse: boolean
  isParsing: boolean
  invoiceReport: InvoiceReportResult | null
  isGeneratingReport: boolean
  reportError: string | null
  form: InvoiceFormValues
  hasExported: boolean
  setStep: (step: WizardStep) => void
  addWorklogFiles: (files: WorklogFile[]) => Promise<void>
  removeWorklogFile: (id: string) => Promise<void>
  clearWorklogFiles: () => Promise<void>
  updateWorklogSourceFolder: (id: string, projectFolder: string) => Promise<void>
  setLineItems: (items: WorklogEntry[]) => void
  setParseErrors: (errors: ParseError[]) => void
  setParseWarnings: (warnings: ParseError[]) => void
  updateForm: (values: Partial<InvoiceFormValues>) => void
  resetWisePaymentLink: () => void
  markExported: () => void
  setInvoiceReport: (report: InvoiceReportResult | null) => void
  setIsGeneratingReport: (value: boolean) => void
  setReportError: (error: string | null) => void
  clearInvoiceReport: () => void
  setLineItemHours: (id: string, hours: number, reason?: string) => void
  nudgeLineItemHours: (id: string, deltaHours: number, reason?: string) => void
  resetLineItemHours: (id: string) => void
  removeLineItem: (id: string) => void
  addManualTimeAdjustment: (input: {
    hours: number
    reason: string
    project?: string
  }) => void
  applyBulkHoursDelta: (input: {
    deltaHours: number
    reason?: string
    onlyIds?: string[]
  }) => void
}

async function parseWorklogFiles(files: WorklogFile[]) {
  if (files.length === 0) {
    return {
      entries: [],
      errors: [],
      warnings: [],
      sources: [],
      ai: {
        usedAi: false,
        notes: [],
        enhancedSources: [],
      },
    }
  }

  return parseMultipleWorklogsWithAi(
    files.map((file) => ({
      name: file.sourcePath,
      content: file.content,
    })),
  )
}

function mapLineItem(
  items: WorklogEntry[],
  id: string,
  mapper: (entry: WorklogEntry) => WorklogEntry,
): WorklogEntry[] {
  return items.map((entry) => (entry.id === id ? mapper(entry) : entry))
}

function applyParseResult(
  set: (partial: Partial<InvoiceState>) => void,
  result: Awaited<ReturnType<typeof parseWorklogFiles>>,
) {
  set({
    lineItems: result.entries,
    sourceSummaries: result.sources,
    parseErrors: result.errors,
    parseWarnings: result.warnings,
    aiNotes: result.ai.notes,
    aiEnhancedSources: result.ai.enhancedSources,
    usedAiParse: result.ai.usedAi,
    invoiceReport: null,
    reportError: null,
  })
}

export const useInvoiceStore = create<InvoiceState>()(
  persist(
    (set, get) => ({
      step: 1,
      worklogFiles: [],
      lineItems: [],
      sourceSummaries: [],
      parseErrors: [],
      parseWarnings: [],
      aiNotes: [],
      aiEnhancedSources: [],
      usedAiParse: false,
      isParsing: false,
      invoiceReport: null,
      isGeneratingReport: false,
      reportError: null,
      form: defaultFormValues,
      hasExported: false,
      setStep: (step) => set({ step }),
      addWorklogFiles: async (incoming) => {
        const worklogFiles = [...get().worklogFiles, ...incoming]
        set({ worklogFiles, isParsing: true })
        try {
          const result = await parseWorklogFiles(worklogFiles)
          applyParseResult(set, result)
        } finally {
          set({ isParsing: false })
        }
      },
      removeWorklogFile: async (id) => {
        const worklogFiles = get().worklogFiles.filter((file) => file.id !== id)
        set({ worklogFiles, isParsing: true })
        try {
          const result = await parseWorklogFiles(worklogFiles)
          applyParseResult(set, result)
        } finally {
          set({ isParsing: false })
        }
      },
      clearWorklogFiles: async () => {
        set({ worklogFiles: [], isParsing: true })
        try {
          set({
            lineItems: [],
            sourceSummaries: [],
            parseErrors: [],
            parseWarnings: [],
            aiNotes: [],
            aiEnhancedSources: [],
            usedAiParse: false,
            invoiceReport: null,
            reportError: null,
          })
        } finally {
          set({ isParsing: false })
        }
      },
      updateWorklogSourceFolder: async (id, projectFolder) => {
        const worklogFiles = get().worklogFiles.map((file) =>
          file.id === id ? withProjectFolder(file, projectFolder) : file,
        )
        set({ worklogFiles, isParsing: true })
        try {
          const result = await parseWorklogFiles(worklogFiles)
          applyParseResult(set, result)
        } finally {
          set({ isParsing: false })
        }
      },
      setLineItems: (lineItems) => set({ lineItems }),
      setParseErrors: (parseErrors) => set({ parseErrors }),
      setParseWarnings: (parseWarnings) => set({ parseWarnings }),
      updateForm: (values) =>
        set((state) => ({
          form: { ...state.form, ...values },
          invoiceReport: null,
          reportError: null,
        })),
      resetWisePaymentLink: () =>
        set((state) => ({
          form: { ...state.form, wisePaymentLink: '' },
          invoiceReport: null,
          reportError: null,
        })),
      markExported: () => set({ hasExported: true }),
      setInvoiceReport: (invoiceReport) => set({ invoiceReport, reportError: null }),
      setIsGeneratingReport: (isGeneratingReport) => set({ isGeneratingReport }),
      setReportError: (reportError) => set({ reportError }),
      clearInvoiceReport: () => set({ invoiceReport: null, reportError: null }),
      setLineItemHours: (id, hours, reason) => {
        set((state) => ({
          lineItems: mapLineItem(state.lineItems, id, (entry) =>
            setEntryHours(entry, hours, reason),
          ),
          invoiceReport: null,
          reportError: null,
        }))
      },
      nudgeLineItemHours: (id, deltaHours, reason) => {
        set((state) => ({
          lineItems: mapLineItem(state.lineItems, id, (entry) =>
            adjustEntryHoursByDelta(entry, deltaHours, reason),
          ),
          invoiceReport: null,
          reportError: null,
        }))
      },
      resetLineItemHours: (id) => {
        set((state) => ({
          lineItems: mapLineItem(state.lineItems, id, resetEntryHours),
          invoiceReport: null,
          reportError: null,
        }))
      },
      removeLineItem: (id) => {
        set((state) => ({
          lineItems: state.lineItems.filter((entry) => entry.id !== id),
          invoiceReport: null,
          reportError: null,
        }))
      },
      addManualTimeAdjustment: ({ hours, reason, project }) => {
        const form = get().form
        const entry = createManualAdjustmentEntry({
          hours,
          reason,
          project,
          timelineStartDate: form.timelineStartDate,
          timelineEndDate: form.timelineEndDate,
        })
        set((state) => ({
          lineItems: sortLineItemsChronologically([...state.lineItems, entry]),
          invoiceReport: null,
          reportError: null,
        }))
      },
      applyBulkHoursDelta: ({ deltaHours, reason, onlyIds }) => {
        if (!Number.isFinite(deltaHours) || deltaHours === 0) return
        const idSet = onlyIds ? new Set(onlyIds) : null
        set((state) => ({
          lineItems: state.lineItems.map((entry) => {
            if (idSet && !idSet.has(entry.id)) return entry
            return adjustEntryHoursByDelta(entry, deltaHours, reason)
          }),
          invoiceReport: null,
          reportError: null,
        }))
      },
    }),
    {
      name: 'nlog-invoice-store',
      version: 1,
      migrate: (persisted) => {
        const state = persisted as InvoiceState
        const form = state.form as InvoiceFormValues & { accountLink?: string }

        if (form?.accountLink !== undefined && form.wisePaymentLink === undefined) {
          const wasFixedLink =
            !form.accountLink.trim() ||
            form.accountLink === 'https://wise.com/pay/me/johnmarkagustinestrososa'

          return {
            ...state,
            form: {
              ...defaultFormValues,
              ...form,
              wisePaymentLink: wasFixedLink ? '' : form.accountLink,
              accountLink: undefined,
            },
          }
        }

        return state
      },
      partialize: (state) => ({
        form: state.form,
        hasExported: state.hasExported,
      }),
    },
  ),
)
