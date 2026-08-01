import { useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import type { ComputedInvoice, WorklogEntry } from '@/lib/invoice-model'
import { formatTimelineLabel } from '@/lib/timeline'
import { formatHours, formatUsd } from '@/lib/utils'
import { requestInvoiceReport } from '@/lib/groq-client'
import { useInvoiceStore } from '@/store/invoice-store'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function InvoiceAiReport({
  invoice,
  excludedEntries,
  unparseableEntries,
}: {
  invoice: ComputedInvoice
  excludedEntries: WorklogEntry[]
  unparseableEntries: WorklogEntry[]
}) {
  const {
    invoiceReport,
    isGeneratingReport,
    reportError,
    aiNotes,
    setInvoiceReport,
    setIsGeneratingReport,
    setReportError,
  } = useInvoiceStore()

  const generateReport = async () => {
    setIsGeneratingReport(true)
    setReportError(null)

    try {
      const report = await requestInvoiceReport({
        invoiceNumber: invoice.invoiceNumber,
        billingPeriod: invoice.billingPeriod,
        timelineLabel: formatTimelineLabel({
          startDate: invoice.timelineStartDate,
          endDate: invoice.timelineEndDate,
          startTime: invoice.timelineStartTime,
          endTime: invoice.timelineEndTime,
        }),
        hourlyRateUsd: invoice.hourlyRateUsd,
        taxPercent: invoice.taxPercent,
        discountUsd: invoice.discountUsd,
        totals: invoice.totals,
        projects: [
          ...new Set(invoice.lineItemsWithAmounts.map((item) => item.project)),
        ],
        lineItems: invoice.lineItemsWithAmounts.map((item) => ({
          project: item.project,
          description: item.description,
          qtyHours: item.qtyHours,
          amountUsd: item.amountUsd,
          time: item.time,
        })),
        excludedCount: excludedEntries.length,
        unparseableCount: unparseableEntries.length,
        parseNotes: aiNotes,
      })
      setInvoiceReport(report)
    } catch (error) {
      setReportError(
        error instanceof Error ? error.message : 'Failed to generate AI report',
      )
    } finally {
      setIsGeneratingReport(false)
    }
  }

  useEffect(() => {
    if (invoiceReport || isGeneratingReport || reportError) return
    void generateReport()
  }, [
    invoice.invoiceNumber,
    invoice.totals.totalDue,
    invoice.lineItemsWithAmounts.length,
    invoiceReport,
    isGeneratingReport,
    reportError,
  ])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-nlog-accent" />
              AI Invoice Report
            </CardTitle>
            <CardDescription>
              Groq checks the billable story, project mix, and data-quality risks
              before you export.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isGeneratingReport}
            onClick={() => void generateReport()}
          >
            {isGeneratingReport ? 'Generating…' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>

      {isGeneratingReport && !invoiceReport && (
        <p className="text-sm text-nlog-slate">Generating report with Groq…</p>
      )}

      {reportError && (
        <div className="space-y-3">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {reportError}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void generateReport()}
          >
            Try again
          </Button>
        </div>
      )}

      {invoiceReport && (
        <div className="space-y-4 text-sm">
          <p className="leading-relaxed text-slate-700">{invoiceReport.summary}</p>

          {invoiceReport.highlights.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-nlog-slate">
                Highlights
              </p>
              <ul className="list-disc space-y-1 pl-5 text-slate-700">
                {invoiceReport.highlights.map((item, index) => (
                  <li key={`highlight-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {invoiceReport.risks.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-700">
                Risks / checks
              </p>
              <ul className="list-disc space-y-1 pl-5 text-amber-900">
                {invoiceReport.risks.map((item, index) => (
                  <li key={`risk-${index}`}>{item}</li>
                ))}
              </ul>
              <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-slate-700">
                <summary className="cursor-pointer select-none text-xs font-semibold text-amber-800 hover:underline">
                  View details
                </summary>
                <div className="mt-3 space-y-4 text-xs">
                  {excludedEntries.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-semibold text-nlog-navy">
                        Outside invoice timeline ({excludedEntries.length})
                      </p>
                      <p>
                        These rows have valid timestamps, but their start time is outside {formatTimelineLabel({
                          startDate: invoice.timelineStartDate,
                          endDate: invoice.timelineEndDate,
                          startTime: invoice.timelineStartTime,
                          endTime: invoice.timelineEndTime,
                        })}. They were not included in billed hours or totals.
                      </p>
                      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                        {excludedEntries.map((entry, index) => (
                          <div key={entry.id || `excluded-${index}`} className="rounded-md border border-amber-200 bg-white px-2.5 py-2">
                            <div className="flex justify-between gap-3 font-medium text-nlog-navy">
                              <span>{entry.project || 'Unassigned project'}</span>
                              <span className="whitespace-nowrap">{formatHours(entry.qtyHours)}</span>
                            </div>
                            <p className="mt-1">{entry.time}</p>
                            <p className="mt-1 text-nlog-slate">{entry.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {unparseableEntries.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-semibold text-nlog-navy">
                        Unparseable timestamps ({unparseableEntries.length})
                      </p>
                      <p>
                        These rows did not match the expected date and time-range format, so NLog could not safely determine whether they belong in the invoice.
                      </p>
                      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                        {unparseableEntries.map((entry, index) => (
                          <div key={entry.id || `unparseable-${index}`} className="rounded-md border border-amber-200 bg-white px-2.5 py-2">
                            <p className="font-medium text-nlog-navy">{entry.project || 'Unassigned project'}</p>
                            <p className="mt-1">Time value: {entry.time || '(blank)'}</p>
                            <p className="mt-1 text-nlog-slate">{entry.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiNotes.length > 0 && (
                    <div>
                      <p className="font-semibold text-nlog-navy">Parser checks</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {aiNotes.map((note, index) => <li key={`parse-note-${index}`}>{note}</li>)}
                      </ul>
                    </div>
                  )}

                  {excludedEntries.length === 0 && unparseableEntries.length === 0 && aiNotes.length === 0 && (
                    <p>The risk was identified from the included invoice rows by the AI review. Review the line items above for unusual hours, descriptions, or billing context.</p>
                  )}
                </div>
              </details>
            </div>
          )}

          {invoiceReport.projectBreakdown.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-nlog-slate">
                Project breakdown
              </p>
              <div className="space-y-2">
                {invoiceReport.projectBreakdown.map((row, index) => (
                  <div
                    key={`${row.project}-${index}`}
                    className="rounded-lg border border-nlog-border px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-nlog-navy">{row.project}</p>
                      <p className="whitespace-nowrap text-nlog-slate">
                        {formatHours(row.hours)} · {formatUsd(row.amountUsd)}
                      </p>
                    </div>
                    {row.note && (
                      <p className="mt-1 text-xs text-nlog-slate">{row.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
