import type { ComputedInvoice } from '@/lib/invoice-model'
import { INVOICE_PARTIES } from '@/lib/invoice-model'
import { formatTimelineLabel } from '@/lib/timeline'
import { formatHours } from '@/lib/utils'
import { useUsdPhpRate } from '@/hooks/use-usd-php-rate'
import { ExchangeRateBanner, UsdWithPhp } from '@/components/usd-php'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'

export function InvoicePreview({ invoice }: { invoice: ComputedInvoice }) {
  const { vendor, billTo } = INVOICE_PARTIES
  const { rate, error, isLoading, refresh } = useUsdPhpRate()
  const projects = [
    ...new Set(invoice.lineItemsWithAmounts.map((item) => item.project)),
  ].join(' / ')

  const timelineLabel = formatTimelineLabel({
    startDate: invoice.timelineStartDate,
    endDate: invoice.timelineEndDate,
    startTime: invoice.timelineStartTime,
    endTime: invoice.timelineEndTime,
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Invoice Summary</CardTitle>
        </CardHeader>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs uppercase text-nlog-slate">From</p>
            <p className="font-medium">{vendor.name}</p>
            <p className="text-nlog-slate">{vendor.address}</p>
            <p className="text-nlog-slate">{vendor.email}</p>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase text-nlog-slate">Bill To</p>
            <p className="font-medium">{billTo.name}</p>
            <p className="text-nlog-slate">{billTo.company}</p>
            <p className="text-nlog-slate">{billTo.address}</p>
            <p className="text-nlog-slate">{billTo.email}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 border-t border-nlog-border pt-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-nlog-slate">Invoice #</p>
            <p className="font-medium">{invoice.invoiceNumber}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-nlog-slate">Period</p>
            <p className="font-medium">{invoice.billingPeriod}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs uppercase text-nlog-slate">Timeline</p>
            <p className="font-medium">{timelineLabel}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs uppercase text-nlog-slate">Projects</p>
            <p className="font-medium">{projects}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
        </CardHeader>
        <div className="mb-3">
          <ExchangeRateBanner
            rate={rate}
            error={error}
            isLoading={isLoading}
            onRefresh={() => void refresh(true)}
          />
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-nlog-slate">Line items</dt>
            <dd>{invoice.lineItemsWithAmounts.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-nlog-slate">Total hours</dt>
            <dd>{formatHours(invoice.totals.totalHours)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-nlog-slate">Subtotal</dt>
            <dd>
              <UsdWithPhp amountUsd={invoice.totals.subtotal} rate={rate} />
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-nlog-slate">Tax ({invoice.taxPercent}%)</dt>
            <dd>
              <UsdWithPhp amountUsd={invoice.totals.taxAmount} rate={rate} />
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-nlog-slate">Discount</dt>
            <dd>
              <UsdWithPhp amountUsd={invoice.discountUsd} rate={rate} />
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-nlog-border pt-2 text-base font-semibold text-nlog-navy">
            <dt>Total Due</dt>
            <dd>
              <UsdWithPhp
                amountUsd={invoice.totals.totalDue}
                rate={rate}
                usdClassName="text-base font-semibold text-nlog-navy"
                phpClassName="text-sm font-medium text-nlog-navy/80"
              />
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-nlog-slate">
          Exported PDF/XLSX stay in USD. PHP amounts use an estimated or
          manually configured PayPal conversion rate for reference.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Details</CardTitle>
        </CardHeader>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase text-nlog-slate">Wise Payment Link</dt>
            <dd className="break-all text-nlog-accent">
              {invoice.resolvedWisePaymentLink}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-nlog-slate">Account Link</dt>
            <dd className="break-all text-nlog-navy">{invoice.accountLink}</dd>
          </div>
        </dl>
      </Card>
    </div>
  )
}
