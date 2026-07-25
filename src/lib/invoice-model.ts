export interface WorklogEntry {
  id: string
  time: string
  description: string
  qtyHours: number
  project: string
  /** Hours as originally parsed/imported; set when an adjustment is first applied. */
  originalQtyHours?: number
  /** Why hours were changed (shown in UI; not exported as a separate invoice column). */
  adjustmentReason?: string
  /** True when this row was created as a manual time adjustment. */
  isManualAdjustment?: boolean
}

export function createWorklogEntryId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `wl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function withWorklogIdentity(
  entry: Omit<WorklogEntry, 'id'> & { id?: string },
): WorklogEntry {
  return {
    ...entry,
    id: entry.id || createWorklogEntryId(),
    qtyHours: Number(entry.qtyHours.toFixed(2)),
  }
}

export interface InvoiceParties {
  vendor: {
    name: string
    address: string
    email: string
  }
  billTo: {
    name: string
    company: string
    address: string
    email: string
  }
  paymentDetails: {
    platform: string
    accountName: string
    email: string
    accountNumber: string
    bankCode: string
    referenceNote: string
  }
}

export interface InvoiceLineItem extends WorklogEntry {
  rateUsd: number
  amountUsd: number
}

export interface InvoiceDraft {
  invoiceNumber: string
  billingPeriod: string
  timelineStartDate: string
  timelineEndDate: string
  timelineStartTime: string
  timelineEndTime: string
  hourlyRateUsd: number
  taxPercent: number
  discountUsd: number
  wisePaymentLink: string
  lineItems: WorklogEntry[]
}

export interface InvoiceTotals {
  subtotal: number
  taxAmount: number
  totalDue: number
  totalHours: number
}

export interface ComputedInvoice extends InvoiceDraft {
  accountLink: string
  resolvedWisePaymentLink: string
  lineItemsWithAmounts: InvoiceLineItem[]
  totals: InvoiceTotals
}

/** Fixed account link — always used for the Account Link field on invoices. */
export const ACCOUNT_LINK = 'https://wise.com/pay/me/johnmarkagustinestrososa'

/** @deprecated Use ACCOUNT_LINK */
export const DEFAULT_ACCOUNT_LINK = ACCOUNT_LINK

export const INVOICE_PARTIES: InvoiceParties = {
  vendor: {
    name: 'JOHN MARK AGUSTIN E. ACIDO',
    address: 'Gingoog City, Misamis Oriental, Philippines',
    email: '94jmaea94@gmail.com',
  },
  billTo: {
    name: 'Ford Seeman/Deshorn King',
    company: 'Alchemy Dev',
    address: 'New York, USA',
    email: 'team@alchemydev.io',
  },
  paymentDetails: {
    platform: 'Wise Pilipinas Inc.',
    accountName: 'John Mark Agustin E. Acido',
    email: '94jmaea94@gmail.com',
    accountNumber: '822888404252081',
    bankCode: 'N/A',
    referenceNote: 'Please include invoice number in payment reference.',
  },
}

export function resolveWisePaymentLink(wisePaymentLink: string): string {
  const trimmed = wisePaymentLink.trim()
  return trimmed || ACCOUNT_LINK
}
