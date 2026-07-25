import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { RotateCcw } from 'lucide-react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  invoiceFormSchema,
  type InvoiceFormValues,
} from '@/lib/invoice-schema'
import { ACCOUNT_LINK } from '@/lib/invoice-model'
import { calculateTotals } from '@/lib/calculate-totals'
import {
  filterLineItemsByTimeline,
  formatBillingPeriodFromTimeline,
  formatTimelineLabel,
} from '@/lib/timeline'
import { formatHours, formatPhp } from '@/lib/utils'
import { useInvoiceStore } from '@/store/invoice-store'
import { useUsdPhpRate } from '@/hooks/use-usd-php-rate'
import { ExchangeRateBanner, UsdWithPhp } from '@/components/usd-php'
import { convertUsdToPhp } from '@/lib/exchange-rate'

export function InvoiceForm() {
  const {
    form: storedForm,
    updateForm,
    resetWisePaymentLink,
    lineItems,
  } = useInvoiceStore()

  const { rate: usdPhpRate, error: fxError, isLoading: fxLoading, refresh: refreshFx } =
    useUsdPhpRate()

  const {
    register,
    watch,
    formState: { errors },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: storedForm,
    values: storedForm,
  })

  const wisePaymentLink = watch('wisePaymentLink')
  const hourlyRateUsd = watch('hourlyRateUsd')
  const taxPercent = watch('taxPercent')
  const discountUsd = watch('discountUsd')
  const timelineStartDate = watch('timelineStartDate')
  const timelineEndDate = watch('timelineEndDate')
  const timelineStartTime = watch('timelineStartTime')
  const timelineEndTime = watch('timelineEndTime')

  const usesAccountLinkFallback = !wisePaymentLink.trim()

  const handleChange = (
    field: keyof InvoiceFormValues,
    value: string | number,
  ) => {
    const next = { [field]: value } as Partial<InvoiceFormValues>

    if (field === 'timelineStartDate' || field === 'timelineEndDate') {
      const startDate =
        field === 'timelineStartDate' ? String(value) : storedForm.timelineStartDate
      const endDate =
        field === 'timelineEndDate' ? String(value) : storedForm.timelineEndDate

      if (startDate && endDate) {
        next.billingPeriod = formatBillingPeriodFromTimeline({
          startDate,
          endDate,
          startTime: storedForm.timelineStartTime,
          endTime: storedForm.timelineEndTime,
        })
      }
    }

    updateForm(next)
  }

  const timelinePreview =
    timelineStartDate && timelineEndDate
      ? formatTimelineLabel({
          startDate: timelineStartDate,
          endDate: timelineEndDate,
          startTime: timelineStartTime,
          endTime: timelineEndTime,
        })
      : null

  const timelineFilter =
    timelineStartDate && timelineEndDate
      ? filterLineItemsByTimeline(lineItems, {
          startDate: timelineStartDate,
          endDate: timelineEndDate,
          startTime: timelineStartTime,
          endTime: timelineEndTime,
        })
      : null

  const billableItems = timelineFilter?.included ?? []
  const billableTotals =
    billableItems.length > 0
      ? calculateTotals(
          billableItems,
          Number(hourlyRateUsd) || 0,
          Number(taxPercent) || 0,
          Number(discountUsd) || 0,
        )
      : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice Details</CardTitle>
        <CardDescription>
          Set the invoice timeline, billing metadata, and payment link.
        </CardDescription>
      </CardHeader>

      <div className="mb-6 space-y-4 rounded-lg border border-nlog-border bg-slate-50 p-4">
        <div>
          <p className="text-sm font-medium text-nlog-navy">Invoice Timeline</p>
          <p className="text-xs text-nlog-slate">
            Only worklog entries within this date range are included. Time range is
            optional.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="timelineStartDate">Start Date</Label>
            <Input
              id="timelineStartDate"
              type="date"
              {...register('timelineStartDate', {
                onChange: (event) =>
                  handleChange('timelineStartDate', event.target.value),
              })}
            />
            {errors.timelineStartDate && (
              <p className="text-xs text-red-600">
                {errors.timelineStartDate.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="timelineEndDate">End Date</Label>
            <Input
              id="timelineEndDate"
              type="date"
              {...register('timelineEndDate', {
                onChange: (event) =>
                  handleChange('timelineEndDate', event.target.value),
              })}
            />
            {errors.timelineEndDate && (
              <p className="text-xs text-red-600">
                {errors.timelineEndDate.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="timelineStartTime">Start Time (optional)</Label>
            <Input
              id="timelineStartTime"
              type="time"
              {...register('timelineStartTime', {
                onChange: (event) =>
                  handleChange('timelineStartTime', event.target.value),
              })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timelineEndTime">End Time (optional)</Label>
            <Input
              id="timelineEndTime"
              type="time"
              {...register('timelineEndTime', {
                onChange: (event) =>
                  handleChange('timelineEndTime', event.target.value),
              })}
            />
            {errors.timelineEndTime && (
              <p className="text-xs text-red-600">
                {errors.timelineEndTime.message}
              </p>
            )}
          </div>
        </div>

        {timelinePreview && (
          <p className="text-sm text-nlog-navy">
            Timeline: <span className="font-medium">{timelinePreview}</span>
          </p>
        )}

        {timelineFilter && (
          <div className="space-y-1 text-xs text-nlog-slate">
            <p>
              {timelineFilter.included.length} of {lineItems.length} worklog
              entries match this timeline.
            </p>
            {timelineFilter.excluded.length > 0 && (
              <p>{timelineFilter.excluded.length} entries fall outside the range.</p>
            )}
            {timelineFilter.unparseable.length > 0 && (
              <p className="text-amber-700">
                {timelineFilter.unparseable.length} entries could not be parsed and
                were excluded.
              </p>
            )}
            {timelineFilter.included.length === 0 && (
              <p className="text-red-600">
                No entries match this timeline. Adjust the range or worklog.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="invoiceNumber">Invoice #</Label>
          <Input
            id="invoiceNumber"
            {...register('invoiceNumber', {
              onChange: (event) =>
                handleChange('invoiceNumber', event.target.value),
            })}
          />
          {errors.invoiceNumber && (
            <p className="text-xs text-red-600">{errors.invoiceNumber.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="billingPeriod">Billing Period Label</Label>
          <Input
            id="billingPeriod"
            placeholder="July 1-10, 2026"
            {...register('billingPeriod', {
              onChange: (event) =>
                handleChange('billingPeriod', event.target.value),
            })}
          />
          {errors.billingPeriod && (
            <p className="text-xs text-red-600">{errors.billingPeriod.message}</p>
          )}
          <p className="text-xs text-nlog-slate">
            Auto-filled from dates; edit if you need a custom label on the invoice.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hourlyRateUsd">Hourly Rate (USD)</Label>
          <Input
            id="hourlyRateUsd"
            type="number"
            step="0.01"
            min="0"
            {...register('hourlyRateUsd', {
              onChange: (event) =>
                handleChange('hourlyRateUsd', Number(event.target.value)),
            })}
          />
          {errors.hourlyRateUsd && (
            <p className="text-xs text-red-600">{errors.hourlyRateUsd.message}</p>
          )}
          {usdPhpRate && Number(hourlyRateUsd) > 0 && (
            <p className="text-xs text-nlog-slate">
              ≈ {formatPhp(convertUsdToPhp(Number(hourlyRateUsd), usdPhpRate.rate))} / hour
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="taxPercent">Tax (%)</Label>
          <Input
            id="taxPercent"
            type="number"
            step="0.01"
            min="0"
            {...register('taxPercent', {
              onChange: (event) =>
                handleChange('taxPercent', Number(event.target.value)),
            })}
          />
          {errors.taxPercent && (
            <p className="text-xs text-red-600">{errors.taxPercent.message}</p>
          )}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="discountUsd">Discount (USD)</Label>
          <Input
            id="discountUsd"
            type="number"
            step="0.01"
            min="0"
            {...register('discountUsd', {
              onChange: (event) =>
                handleChange('discountUsd', Number(event.target.value)),
            })}
          />
          {errors.discountUsd && (
            <p className="text-xs text-red-600">{errors.discountUsd.message}</p>
          )}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Account Link</Label>
          <p className="break-all rounded-lg border border-nlog-border bg-slate-50 px-3 py-2 text-sm text-nlog-navy">
            {ACCOUNT_LINK}
          </p>
          <p className="text-xs text-nlog-slate">
            Fixed on every invoice.
          </p>
        </div>

        {billableTotals && (
          <div className="space-y-3 rounded-lg border-2 border-nlog-navy/20 bg-nlog-navy/5 p-4 sm:col-span-2">
            <div>
              <p className="text-sm font-semibold text-nlog-navy">Billable Amount</p>
              <p className="text-xs text-nlog-slate">
                Use this total to create your Wise payment link before exporting.
              </p>
              <div className="mt-2">
                <ExchangeRateBanner
                  rate={usdPhpRate}
                  error={fxError}
                  isLoading={fxLoading}
                  onRefresh={() => void refreshFx(true)}
                />
              </div>
            </div>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between sm:block">
                <dt className="text-nlog-slate">Entries</dt>
                <dd className="font-medium">{billableItems.length}</dd>
              </div>
              <div className="flex justify-between sm:block">
                <dt className="text-nlog-slate">Total hours</dt>
                <dd className="font-medium">{formatHours(billableTotals.totalHours)}</dd>
              </div>
              <div className="flex justify-between gap-3 sm:block">
                <dt className="text-nlog-slate">Subtotal</dt>
                <dd className="font-medium">
                  <UsdWithPhp amountUsd={billableTotals.subtotal} rate={usdPhpRate} />
                </dd>
              </div>
              <div className="flex justify-between gap-3 sm:block">
                <dt className="text-nlog-slate">Tax</dt>
                <dd className="font-medium">
                  <UsdWithPhp amountUsd={billableTotals.taxAmount} rate={usdPhpRate} />
                </dd>
              </div>
              {(Number(discountUsd) || 0) > 0 && (
                <div className="flex justify-between gap-3 sm:block">
                  <dt className="text-nlog-slate">Discount</dt>
                  <dd className="font-medium">
                    <UsdWithPhp
                      amountUsd={Number(discountUsd) || 0}
                      rate={usdPhpRate}
                    />
                  </dd>
                </div>
              )}
            </dl>
            <div className="flex items-center justify-between gap-3 border-t border-nlog-navy/20 pt-3">
              <p className="text-sm font-medium text-nlog-navy">Total Due</p>
              <UsdWithPhp
                amountUsd={billableTotals.totalDue}
                rate={usdPhpRate}
                usdClassName="text-2xl font-bold text-nlog-navy"
                phpClassName="text-sm font-medium text-nlog-navy/80"
                showRateHint
              />
            </div>
          </div>
        )}

        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="wisePaymentLink">Wise Payment Link</Label>
            {!usesAccountLinkFallback && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  resetWisePaymentLink()
                }}
              >
                <RotateCcw className="h-3 w-3" />
                Use account link
              </Button>
            )}
          </div>
          <Input
            id="wisePaymentLink"
            type="url"
            placeholder={`Falls back to ${ACCOUNT_LINK}`}
            {...register('wisePaymentLink', {
              onChange: (event) =>
                handleChange('wisePaymentLink', event.target.value),
            })}
          />
          {errors.wisePaymentLink && (
            <p className="text-xs text-red-600">{errors.wisePaymentLink.message}</p>
          )}
          <p className="text-xs text-nlog-slate">
            Create a Wise payment link for the total due above, then paste it here.
            Leave empty to use the account link.
          </p>
        </div>
      </div>
    </Card>
  )
}
