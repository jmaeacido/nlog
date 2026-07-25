import { invoiceFormSchema } from '@/lib/invoice-schema'
import { computeInvoice } from '@/lib/calculate-totals'
import { filterLineItemsByTimeline } from '@/lib/timeline'
import { useInvoiceStore } from '@/store/invoice-store'
import { AppShell, StepIndicator, type AppView } from '@/components/layout/app-shell'
import { WorklogInput } from '@/components/worklog-input'
import { InvoiceForm } from '@/components/invoice-form'
import {
  LineItemsTable,
  ParseMessages,
  TimeAdjustmentPanel,
} from '@/components/line-items-table'
import { InvoicePreview } from '@/components/invoice-preview'
import { InvoiceAiReport } from '@/components/invoice-ai-report'
import { ExportActions } from '@/components/export-actions'
import { Button } from '@/components/ui/button'
import { useInvoiceHistoryStore } from '@/store/invoice-history-store'
import { useCheckInStore } from '@/store/checkin-store'
import { completedLinesForWeek, splitCompletedTasks } from '@/lib/checkin-model'
import { useMemo } from 'react'

const STEPS = ['Worklog', 'Details', 'Review']

export function GeneratePage({
  onNavigate,
}: {
  onNavigate: (view: AppView) => void
}) {
  const {
    step,
    setStep,
    lineItems,
    parseErrors,
    parseWarnings,
    aiNotes,
    usedAiParse,
    form,
  } = useInvoiceStore()
  const historyCount = useInvoiceHistoryStore((state) => state.entries.length)
  const checkInEntries = useCheckInStore((state) => state.entries)
  const weekCompleted = useMemo(
    () => completedLinesForWeek(checkInEntries),
    [checkInEntries],
  )

  const canProceedFromWorklog =
    lineItems.length > 0 && parseErrors.length === 0

  const formValidation = invoiceFormSchema.safeParse(form)
  const canProceedFromDetails = formValidation.success

  const timelineFilter =
    form.timelineStartDate && form.timelineEndDate
      ? filterLineItemsByTimeline(lineItems, {
          startDate: form.timelineStartDate,
          endDate: form.timelineEndDate,
          startTime: form.timelineStartTime,
          endTime: form.timelineEndTime,
        })
      : null

  const filteredLineItems = timelineFilter?.included ?? lineItems

  const hasMatchingEntries = filteredLineItems.length > 0

  const draft = {
    ...form,
    lineItems: filteredLineItems,
  }

  const computedInvoice =
    filteredLineItems.length > 0 && formValidation.success
      ? computeInvoice(draft)
      : null

  return (
    <AppShell
      activeView="generate"
      onNavigate={onNavigate}
      historyCount={historyCount}
    >
      <StepIndicator current={step} steps={STEPS} />

      {step === 1 && (
        <div className="space-y-4">
          <WorklogInput />
          {usedAiParse && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-nlog-navy">
              Groq repaired one or more worklogs so line items stay invoice-ready.
            </p>
          )}
          <ParseMessages errors={parseErrors} warnings={parseWarnings} />
          {aiNotes.length > 0 && (
            <div className="space-y-2">
              {aiNotes.map((note, index) => (
                <p
                  key={`ai-note-${index}`}
                  className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-nlog-slate"
                >
                  {note}
                </p>
              ))}
            </div>
          )}
          {lineItems.length > 0 && (
            <LineItemsTable
              items={lineItems}
              hourlyRateUsd={form.hourlyRateUsd}
              editable
            />
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!canProceedFromWorklog}
              onClick={() => setStep(2)}
            >
              Continue to Details
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <InvoiceForm />
          <TimeAdjustmentPanel billableItems={filteredLineItems} />
          {filteredLineItems.length > 0 && (
            <LineItemsTable
              items={filteredLineItems}
              hourlyRateUsd={form.hourlyRateUsd}
              editable
            />
          )}
          <div className="flex justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              type="button"
              disabled={!canProceedFromDetails || !hasMatchingEntries}
              onClick={() => setStep(3)}
            >
              Review Invoice
            </Button>
          </div>
        </div>
      )}

      {step === 3 && computedInvoice && (
        <div className="space-y-4">
          {timelineFilter && timelineFilter.excluded.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {timelineFilter.excluded.length} worklog entries outside the invoice
              timeline were excluded from this invoice.
            </p>
          )}
          {timelineFilter && timelineFilter.unparseable.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {timelineFilter.unparseable.length} entr
              {timelineFilter.unparseable.length === 1 ? 'y has' : 'ies have'} a
              time format that could not be parsed and were excluded.
            </p>
          )}
          {weekCompleted.length > 0 ? (
            <div className="rounded-xl border border-nlog-border bg-white px-4 py-3">
              <p className="text-sm font-medium text-nlog-navy">
                Check-in Completed this week
              </p>
              <p className="mt-1 text-xs text-nlog-slate">
                Per Alchemy Dev standards, this list must match what you bill.
                Confirm invoice line items cover these deliverables.
              </p>
              <ul className="mt-2 space-y-3 text-sm text-nlog-navy">
                {weekCompleted.map((item, index) => (
                  <li key={item.id}>
                    <p className="font-medium">
                      Client {index + 1} - {item.client}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-nlog-slate">
                      Task:
                    </p>
                    <ul className="mt-0.5 space-y-0.5 text-nlog-navy">
                      {splitCompletedTasks(item.task).map((task) => (
                        <li key={task}>{task}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-2 text-xs font-medium text-nlog-accent hover:underline"
                onClick={() => onNavigate('checkin')}
              >
                Open Check-in
              </button>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-nlog-slate">
              No check-in Completed items for this week yet. When you file
              Mon/Wed/Fri reports, they appear here so billed work stays aligned.
            </p>
          )}
          <LineItemsTable
            items={filteredLineItems}
            hourlyRateUsd={form.hourlyRateUsd}
            editable
          />
          <InvoiceAiReport
            invoice={computedInvoice}
            excludedCount={timelineFilter?.excluded.length ?? 0}
            unparseableCount={timelineFilter?.unparseable.length ?? 0}
          />
          <InvoicePreview invoice={computedInvoice} />
          <div className="sticky bottom-0 -mx-4 border-t border-nlog-border bg-nlog-bg/95 px-4 py-4 backdrop-blur">
            <ExportActions draft={draft} />
            <div className="mt-3 flex justify-start">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                Back to Details
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
