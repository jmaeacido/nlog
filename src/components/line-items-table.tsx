import { useMemo, useState } from 'react'
import { Minus, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { WorklogEntry } from '@/lib/invoice-model'
import {
  getHoursDelta,
  getOriginalHours,
  isHoursAdjusted,
  summarizeAdjustments,
} from '@/lib/time-adjustments'
import { formatHours, formatUsd } from '@/lib/utils'
import { useInvoiceStore } from '@/store/invoice-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

const NUDGE = 0.25

function HoursEditor({
  entry,
  hourlyRateUsd,
  compact = false,
}: {
  entry: WorklogEntry
  hourlyRateUsd: number
  compact?: boolean
}) {
  const nudgeLineItemHours = useInvoiceStore((state) => state.nudgeLineItemHours)
  const setLineItemHours = useInvoiceStore((state) => state.setLineItemHours)
  const resetLineItemHours = useInvoiceStore((state) => state.resetLineItemHours)
  const removeLineItem = useInvoiceStore((state) => state.removeLineItem)
  const adjusted = isHoursAdjusted(entry)
  const delta = getHoursDelta(entry)

  return (
    <div className={cn('space-y-2', compact && 'space-y-1.5')}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Decrease hours by 0.25"
            onClick={() =>
              nudgeLineItemHours(entry.id, -NUDGE, 'Manual hour nudge')
            }
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={entry.qtyHours}
            aria-label={`Hours for ${entry.project}`}
            className="h-9 w-24 text-right"
            onChange={(event) => {
              const next = Number(event.target.value)
              if (!Number.isFinite(next)) return
              setLineItemHours(entry.id, next, 'Manual hour edit')
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Increase hours by 0.25"
            onClick={() =>
              nudgeLineItemHours(entry.id, NUDGE, 'Manual hour nudge')
            }
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <span className="min-w-20 text-right text-xs text-nlog-slate">
          {formatUsd(entry.qtyHours * hourlyRateUsd)}
        </span>
        {entry.isManualAdjustment ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-red-700"
            aria-label="Remove adjustment entry"
            onClick={() => removeLineItem(entry.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : adjusted ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Reset hours to original"
            onClick={() => resetLineItemHours(entry.id)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
      {(adjusted || entry.isManualAdjustment) && (
        <p className="text-right text-xs text-amber-800">
          {entry.isManualAdjustment
            ? 'Manual adjustment entry'
            : `Adjusted from ${formatHours(getOriginalHours(entry))} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)}h)`}
          {entry.adjustmentReason ? ` · ${entry.adjustmentReason}` : ''}
        </p>
      )}
    </div>
  )
}

export function LineItemsTable({
  items,
  hourlyRateUsd,
  editable = false,
}: {
  items: WorklogEntry[]
  hourlyRateUsd: number
  editable?: boolean
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
          <CardDescription>No worklog entries parsed yet.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const summary = summarizeAdjustments(items)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Line Items ({items.length})</CardTitle>
        <CardDescription>
          {editable
            ? 'Edit hours directly, or use +/− for 0.25h nudges. Time is not exported to the invoice.'
            : 'Parsed from markdown. Time column is not exported to the invoice.'}
          {(summary.adjustedCount > 0 || summary.manualCount > 0) && (
            <>
              {' '}
              Net adjustment:{' '}
              <span className="font-medium text-nlog-navy">
                {summary.netDeltaHours >= 0 ? '+' : ''}
                {summary.netDeltaHours.toFixed(2)}h
              </span>
            </>
          )}
        </CardDescription>
      </CardHeader>

      <div className="space-y-3 md:hidden">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-nlog-border p-3 text-sm"
          >
            <p className="mb-1 font-medium text-nlog-navy">{item.project}</p>
            <p className="mb-2 text-slate-700">{item.description}</p>
            {editable ? (
              <HoursEditor entry={item} hourlyRateUsd={hourlyRateUsd} compact />
            ) : (
              <div className="flex justify-between text-xs text-nlog-slate">
                <span>{formatHours(item.qtyHours)}</span>
                <span>{formatUsd(item.qtyHours * hourlyRateUsd)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-nlog-border text-xs uppercase text-nlog-slate">
              <th className="px-2 py-2 font-medium">Project</th>
              <th className="px-2 py-2 font-medium">Description</th>
              <th className="px-2 py-2 text-right font-medium">
                {editable ? 'Hours / Amount' : 'Qty'}
              </th>
              {!editable && (
                <th className="px-2 py-2 text-right font-medium">Amount</th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-nlog-border/70 align-top"
              >
                <td className="px-2 py-2 whitespace-nowrap text-nlog-navy">
                  {item.project}
                </td>
                <td className="max-w-md px-2 py-2 text-slate-700">
                  {item.description}
                </td>
                <td className="px-2 py-2 text-right" colSpan={editable ? 2 : 1}>
                  {editable ? (
                    <HoursEditor entry={item} hourlyRateUsd={hourlyRateUsd} />
                  ) : (
                    formatHours(item.qtyHours)
                  )}
                </td>
                {!editable && (
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {formatUsd(item.qtyHours * hourlyRateUsd)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function TimeAdjustmentPanel({
  billableItems,
}: {
  billableItems: WorklogEntry[]
}) {
  const addManualTimeAdjustment = useInvoiceStore(
    (state) => state.addManualTimeAdjustment,
  )
  const applyBulkHoursDelta = useInvoiceStore(
    (state) => state.applyBulkHoursDelta,
  )
  const form = useInvoiceStore((state) => state.form)

  const [bulkDelta, setBulkDelta] = useState('0.25')
  const [bulkReason, setBulkReason] = useState('')
  const [manualHours, setManualHours] = useState('0.50')
  const [manualReason, setManualReason] = useState('')
  const [manualProject, setManualProject] = useState('')

  const summary = useMemo(
    () => summarizeAdjustments(billableItems),
    [billableItems],
  )

  const applyBulk = (sign: 1 | -1) => {
    const abs = Math.abs(Number(bulkDelta))
    if (!Number.isFinite(abs) || abs <= 0) {
      toast.error('Enter a positive hour amount to adjust.')
      return
    }
    if (billableItems.length === 0) {
      toast.error('No billable entries in the current timeline.')
      return
    }

    applyBulkHoursDelta({
      deltaHours: sign * abs,
      reason: bulkReason.trim() || 'Bulk time adjustment',
      onlyIds: billableItems.map((item) => item.id),
    })
    toast.success(
      `${sign > 0 ? 'Added' : 'Removed'} ${abs.toFixed(2)}h on each of ${billableItems.length} billable entr${billableItems.length === 1 ? 'y' : 'ies'}.`,
    )
  }

  const addManual = () => {
    const hours = Number(manualHours)
    if (!Number.isFinite(hours) || hours <= 0) {
      toast.error('Adjustment hours must be greater than 0.')
      return
    }
    if (!manualReason.trim()) {
      toast.error('Add a short reason for the adjustment.')
      return
    }

    addManualTimeAdjustment({
      hours,
      reason: manualReason.trim(),
      project: manualProject.trim() || undefined,
    })
    setManualReason('')
    toast.success(`Added ${hours.toFixed(2)}h adjustment entry.`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time Adjustments</CardTitle>
        <CardDescription>
          Increase or decrease worked time before export. Changes apply to the
          current invoice line items and update billable totals automatically.
        </CardDescription>
      </CardHeader>

      {(summary.adjustedCount > 0 || summary.manualCount > 0) && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {summary.adjustedCount} edited entr
          {summary.adjustedCount === 1 ? 'y' : 'ies'}
          {summary.manualCount > 0
            ? ` · ${summary.manualCount} manual adjustment${summary.manualCount === 1 ? '' : 's'}`
            : ''}
          {' · '}
          net {summary.netDeltaHours >= 0 ? '+' : ''}
          {summary.netDeltaHours.toFixed(2)}h vs original parse
          {form.hourlyRateUsd
            ? ` (≈ ${formatUsd(summary.netDeltaHours * form.hourlyRateUsd)})`
            : ''}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-nlog-border p-4">
          <p className="text-sm font-medium text-nlog-navy">
            Adjust every billable entry
          </p>
          <p className="text-xs text-nlog-slate">
            Adds or removes the same amount from each of the{' '}
            {billableItems.length} timeline-matched entr
            {billableItems.length === 1 ? 'y' : 'ies'}.
          </p>
          <div className="space-y-2">
            <Label htmlFor="bulkDelta">Hours per entry</Label>
            <Input
              id="bulkDelta"
              type="number"
              step="0.05"
              min="0.01"
              value={bulkDelta}
              onChange={(event) => setBulkDelta(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulkReason">Reason (optional)</Label>
            <Input
              id="bulkReason"
              placeholder="e.g. Buffer for code review"
              value={bulkReason}
              onChange={(event) => setBulkReason(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => applyBulk(-1)}>
              <Minus className="h-4 w-4" />
              Decrease all
            </Button>
            <Button type="button" onClick={() => applyBulk(1)}>
              <Plus className="h-4 w-4" />
              Increase all
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-nlog-border p-4">
          <p className="text-sm font-medium text-nlog-navy">
            Add adjustment entry
          </p>
          <p className="text-xs text-nlog-slate">
            Creates a dedicated line item for extra or corrective time (for
            example meeting overhead or a write-down).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="manualHours">Hours</Label>
              <Input
                id="manualHours"
                type="number"
                step="0.05"
                min="0.01"
                value={manualHours}
                onChange={(event) => setManualHours(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manualProject">Project (optional)</Label>
              <Input
                id="manualProject"
                placeholder="General"
                value={manualProject}
                onChange={(event) => setManualProject(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="manualReason">Reason</Label>
            <Textarea
              id="manualReason"
              className="min-h-24"
              placeholder="Why this time is being added or corrected"
              value={manualReason}
              onChange={(event) => setManualReason(event.target.value)}
            />
          </div>
          <Button type="button" onClick={addManual}>
            <Plus className="h-4 w-4" />
            Add adjustment
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function ParseMessages({
  errors,
  warnings,
}: {
  errors: { row?: number; message: string }[]
  warnings: { row?: number; message: string }[]
}) {
  if (errors.length === 0 && warnings.length === 0) return null

  return (
    <div className="space-y-2">
      {errors.map((error, index) => (
        <p key={`error-${index}`} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      ))}
      {warnings.map((warning, index) => (
        <p
          key={`warning-${index}`}
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {warning.message}
        </p>
      ))}
    </div>
  )
}
