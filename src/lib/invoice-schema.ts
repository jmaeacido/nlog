import { z } from 'zod'

const dateField = z.string().min(1, 'Date is required')
const timeField = z.string()

export const invoiceFormSchema = z
  .object({
    invoiceNumber: z.string().min(1, 'Invoice number is required'),
    billingPeriod: z.string().min(1, 'Billing period is required'),
    timelineStartDate: dateField,
    timelineEndDate: dateField,
    timelineStartTime: timeField,
    timelineEndTime: timeField,
    hourlyRateUsd: z.coerce.number().positive('Rate must be greater than 0'),
    taxPercent: z.coerce.number().min(0, 'Tax cannot be negative'),
    discountUsd: z.coerce.number().min(0, 'Discount cannot be negative'),
    wisePaymentLink: z
      .string()
      .transform((value) => value.trim())
      .refine(
        (value) => !value || z.string().url().safeParse(value).success,
        'Wise payment link must be a valid URL',
      ),
  })
  .superRefine((values, context) => {
    const start = new Date(`${values.timelineStartDate}T00:00:00`)
    const end = new Date(`${values.timelineEndDate}T00:00:00`)

    if (end < start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must be on or after start date',
        path: ['timelineEndDate'],
      })
    }

    const hasStartTime = Boolean(values.timelineStartTime)
    const hasEndTime = Boolean(values.timelineEndTime)

    if (hasStartTime !== hasEndTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide both start and end times, or leave both empty',
        path: ['timelineEndTime'],
      })
    }
  })

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>

export const defaultFormValues: InvoiceFormValues = {
  invoiceNumber: '004',
  billingPeriod: '',
  timelineStartDate: '',
  timelineEndDate: '',
  timelineStartTime: '',
  timelineEndTime: '',
  hourlyRateUsd: 8,
  taxPercent: 0,
  discountUsd: 0,
  wisePaymentLink: '',
}

export function suggestNextInvoiceNumber(lastNumber: string): string {
  const match = lastNumber.match(/(\d+)/)
  if (!match) return lastNumber
  const next = Number.parseInt(match[1], 10) + 1
  return lastNumber.replace(match[1], String(next).padStart(match[1].length, '0'))
}
