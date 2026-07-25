import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  History,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppShell, type AppView } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LineItemsTable } from '@/components/line-items-table'
import { ExchangeRateBanner, UsdWithPhp } from '@/components/usd-php'
import { useUsdPhpRate } from '@/hooks/use-usd-php-rate'
import type { InvoiceHistoryEntry } from '@/lib/invoice-history'
import { formatTimelineLabel } from '@/lib/timeline'
import { formatHours, formatUsd } from '@/lib/utils'
import { useInvoiceHistoryStore } from '@/store/invoice-history-store'

function formatSavedAt(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function HistoryPage({
  onNavigate,
}: {
  onNavigate: (view: AppView) => void
}) {
  const entries = useInvoiceHistoryStore((state) => state.entries)
  const removeEntry = useInvoiceHistoryStore((state) => state.removeEntry)
  const clearHistory = useInvoiceHistoryStore((state) => state.clearHistory)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState<'pdf' | 'xlsx' | null>(null)
  const { rate, error, isLoading, refresh } = useUsdPhpRate()

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  )

  const handleReexport = async (
    entry: InvoiceHistoryEntry,
    type: 'pdf' | 'xlsx',
  ) => {
    setIsExporting(type)
    try {
      if (type === 'xlsx') {
        const { exportInvoiceXlsx } = await import('@/lib/export-xlsx')
        await exportInvoiceXlsx(entry.invoice)
        toast.success('XLSX invoice downloaded.')
      } else {
        const { exportInvoicePdf } = await import('@/lib/export-pdf')
        await exportInvoicePdf(entry.invoice)
        toast.success('PDF invoice downloaded.')
      }
      useInvoiceHistoryStore.getState().recordExport(entry.invoice, type)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setIsExporting(null)
    }
  }

  const shellProps = {
    activeView: 'history' as const,
    onNavigate,
    historyCount: entries.length,
  }

  if (selected) {
    const invoice = selected.invoice
    const timelineLabel = formatTimelineLabel({
      startDate: invoice.timelineStartDate,
      endDate: invoice.timelineEndDate,
      startTime: invoice.timelineStartTime,
      endTime: invoice.timelineEndTime,
    })

    return (
      <AppShell {...shellProps}>
        <div className="mb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelectedId(null)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to history
          </Button>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Invoice #{invoice.invoiceNumber}</CardTitle>
              <CardDescription>
                Saved {formatSavedAt(selected.updatedAt)} ·{' '}
                {selected.exportedFormats
                  .map((format) => format.toUpperCase())
                  .join(' · ')}
              </CardDescription>
            </CardHeader>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-nlog-slate">Period</dt>
                <dd className="font-medium">{invoice.billingPeriod}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-nlog-slate">Timeline</dt>
                <dd className="font-medium">{timelineLabel}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-nlog-slate">Projects</dt>
                <dd className="font-medium">
                  {selected.projects.join(' / ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-nlog-slate">Hours</dt>
                <dd className="font-medium">
                  {formatHours(invoice.totals.totalHours)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <ExchangeRateBanner
                  rate={rate}
                  error={error}
                  isLoading={isLoading}
                  onRefresh={() => void refresh(true)}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-nlog-border bg-slate-50 px-3 py-3 sm:col-span-2">
                <p className="text-sm font-medium text-nlog-navy">Total Due</p>
                <UsdWithPhp
                  amountUsd={invoice.totals.totalDue}
                  rate={rate}
                  usdClassName="text-xl font-bold text-nlog-navy"
                  phpClassName="text-sm font-medium text-nlog-navy/80"
                />
              </div>
            </dl>
          </Card>

          <LineItemsTable
            items={invoice.lineItems}
            hourlyRateUsd={invoice.hourlyRateUsd}
          />

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              className="flex-1"
              disabled={isExporting !== null}
              onClick={() => void handleReexport(selected, 'xlsx')}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {isExporting === 'xlsx' ? 'Generating XLSX…' : 'Download XLSX'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={isExporting !== null}
              onClick={() => void handleReexport(selected, 'pdf')}
            >
              <FileText className="h-4 w-4" />
              {isExporting === 'pdf' ? 'Generating PDF…' : 'Download PDF'}
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="text-red-700 hover:bg-red-50 hover:text-red-800"
            onClick={() => {
              removeEntry(selected.id)
              setSelectedId(null)
              toast.success('Invoice removed from history.')
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete from history
          </Button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell {...shellProps}>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-nlog-navy">
          <History className="h-5 w-5" />
          Invoice History
        </h1>
        <p className="mt-1 text-sm text-nlog-slate">
          Saved automatically when you download a PDF or XLSX.
        </p>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No invoices yet</CardTitle>
            <CardDescription>
              Export an invoice from Review and it will appear here for later
              downloads.
            </CardDescription>
          </CardHeader>
          <Button type="button" onClick={() => onNavigate('generate')}>
            Create invoice
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-700 hover:bg-red-50 hover:text-red-800"
              onClick={() => {
                if (
                  window.confirm(
                    'Clear all invoice history from this device?',
                  )
                ) {
                  clearHistory()
                  toast.success('Invoice history cleared.')
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Clear all
            </Button>
          </div>

          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(entry.id)}
                  className="w-full rounded-xl border border-nlog-border bg-white p-4 text-left shadow-sm transition hover:border-nlog-navy/30 hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-nlog-navy">
                        Invoice #{entry.invoice.invoiceNumber}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-slate-700">
                        {entry.invoice.billingPeriod}
                      </p>
                      <p className="mt-1 text-xs text-nlog-slate">
                        {entry.projects.join(' · ') || 'No projects'} ·{' '}
                        {entry.invoice.lineItemsWithAmounts.length} items ·{' '}
                        {formatHours(entry.invoice.totals.totalHours)}
                      </p>
                      <p className="mt-1 text-xs text-nlog-slate">
                        Saved {formatSavedAt(entry.updatedAt)} ·{' '}
                        {entry.exportedFormats
                          .map((format) => format.toUpperCase())
                          .join(' · ')}
                      </p>
                    </div>
                    <p className="shrink-0 text-base font-semibold text-nlog-navy">
                      {formatUsd(entry.invoice.totals.totalDue)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  )
}
