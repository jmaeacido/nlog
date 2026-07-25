import ExcelJS from 'exceljs'
import type { ComputedInvoice } from './invoice-model'
import { INVOICE_PARTIES } from './invoice-model'
import { downloadBlob, sanitizeFilename } from './utils'

const TEMPLATE_URL = '/templates/invoice-template.xlsx'
const LINE_ITEM_START_ROW = 13
const MAX_LINE_ITEMS = 40
const SUBTOTAL_ROW = 53
const TAX_ROW = 54
const DISCOUNT_ROW = 55
const TOTAL_ROW = 56
const WISE_LINK_ROW = 59
const ACCOUNT_LINK_ROW = 64
const REFERENCE_ROW = 67

export async function exportInvoiceXlsx(invoice: ComputedInvoice): Promise<void> {
  const response = await fetch(TEMPLATE_URL)
  if (!response.ok) {
    throw new Error('Failed to load invoice template.')
  }

  const buffer = await response.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]

  if (!sheet) {
    throw new Error('Invoice template worksheet not found.')
  }

  const projects = [
    ...new Set(invoice.lineItemsWithAmounts.map((item) => item.project)),
  ].join(' / ')

  setCell(sheet, 6, 2, invoice.invoiceNumber)
  setCell(sheet, 6, 3, invoice.billingPeriod)
  setCell(sheet, 8, 3, projects)
  setCell(
    sheet,
    9,
    3,
    `Work completed from ${invoice.billingPeriod}`,
  )

  clearLineItems(sheet)

  invoice.lineItemsWithAmounts.forEach((item, index) => {
    const row = LINE_ITEM_START_ROW + index
    if (index >= MAX_LINE_ITEMS) return

    setCell(sheet, row, 1, item.description)
    setCell(sheet, row, 2, item.qtyHours)
    setCell(sheet, row, 3, item.rateUsd)
    setCell(sheet, row, 4, item.amountUsd)
  })

  setCell(sheet, SUBTOTAL_ROW, 4, invoice.totals.subtotal)
  setCell(sheet, TAX_ROW, 2, invoice.taxPercent)
  setCell(sheet, TAX_ROW, 4, invoice.totals.taxAmount)
  setCell(sheet, DISCOUNT_ROW, 2, invoice.discountUsd)
  setCell(sheet, TOTAL_ROW, 4, invoice.totals.totalDue)
  setCell(sheet, WISE_LINK_ROW, 2, invoice.resolvedWisePaymentLink)
  setCell(sheet, ACCOUNT_LINK_ROW, 2, invoice.accountLink)
  setCell(sheet, REFERENCE_ROW, 2, `Invoice #${invoice.invoiceNumber}`)

  void INVOICE_PARTIES

  const output = await workbook.xlsx.writeBuffer()
  const filename = `Invoice_JohnMarkAgustin_${sanitizeFilename(invoice.billingPeriod)}.xlsx`
  downloadBlob(
    new Blob([output], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  )
}

function clearLineItems(sheet: ExcelJS.Worksheet) {
  for (let row = LINE_ITEM_START_ROW; row < LINE_ITEM_START_ROW + MAX_LINE_ITEMS; row++) {
    for (let col = 1; col <= 4; col++) {
      const cell = sheet.getCell(row, col)
      cell.value = null
    }
  }
}

function setCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: string | number,
) {
  sheet.getCell(row, col).value = value
}
