import type { ComputedInvoice, InvoiceDraft, InvoiceTotals, WorklogEntry } from './invoice-model'
import { ACCOUNT_LINK, resolveWisePaymentLink } from './invoice-model'
import { sortLineItemsChronologically } from './timeline'

export function calculateTotals(
  lineItems: WorklogEntry[],
  hourlyRateUsd: number,
  taxPercent: number,
  discountUsd: number,
): InvoiceTotals {
  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.qtyHours * hourlyRateUsd,
    0,
  )
  const taxAmount = subtotal * (taxPercent / 100)
  const totalDue = subtotal + taxAmount - discountUsd
  const totalHours = lineItems.reduce((sum, item) => sum + item.qtyHours, 0)

  return {
    subtotal: round2(subtotal),
    taxAmount: round2(taxAmount),
    totalDue: round2(totalDue),
    totalHours: round2(totalHours),
  }
}

export function computeInvoice(draft: InvoiceDraft): ComputedInvoice {
  const sortedLineItems = sortLineItemsChronologically(draft.lineItems)

  const totals = calculateTotals(
    sortedLineItems,
    draft.hourlyRateUsd,
    draft.taxPercent,
    draft.discountUsd,
  )

  const lineItemsWithAmounts = sortedLineItems.map((item) => ({
    ...item,
    rateUsd: draft.hourlyRateUsd,
    amountUsd: round2(item.qtyHours * draft.hourlyRateUsd),
  }))

  return {
    ...draft,
    lineItems: sortedLineItems,
    accountLink: ACCOUNT_LINK,
    resolvedWisePaymentLink: resolveWisePaymentLink(draft.wisePaymentLink),
    lineItemsWithAmounts,
    totals,
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
