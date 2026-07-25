import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer'
import type { ComputedInvoice } from './invoice-model'
import { INVOICE_PARTIES } from './invoice-model'
import { downloadBlob, sanitizeFilename } from './utils'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#1e293b',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  column: {
    width: '48%',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e3a5f',
    marginBottom: 8,
  },
  label: {
    fontSize: 8,
    color: '#64748b',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  text: {
    marginBottom: 2,
    lineHeight: 1.4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 16,
  },
  metaItem: {
    marginRight: 24,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1e3a5f',
    color: '#ffffff',
    padding: 6,
    marginTop: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  colDesc: { width: '55%' },
  colQty: { width: '15%', textAlign: 'right' },
  colRate: { width: '15%', textAlign: 'right' },
  colAmount: { width: '15%', textAlign: 'right' },
  totalsBlock: {
    marginTop: 12,
    alignSelf: 'flex-end',
    width: '45%',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalDue: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: '#1e3a5f',
    fontWeight: 'bold',
    fontSize: 11,
  },
  paymentBlock: {
    marginTop: 24,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
  },
  paymentTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1e3a5f',
    marginBottom: 8,
  },
  paymentRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  paymentLabel: {
    width: 100,
    color: '#64748b',
  },
})

function InvoiceDocument({ invoice }: { invoice: ComputedInvoice }) {
  const { vendor, billTo, paymentDetails } = INVOICE_PARTIES
  const projects = [
    ...new Set(invoice.lineItemsWithAmounts.map((item) => item.project)),
  ].join(' / ')

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.column}>
            <Text style={styles.text}>{vendor.name}</Text>
            <Text style={styles.text}>{vendor.address}</Text>
            <Text style={styles.text}>{vendor.email}</Text>
          </View>
          <View style={styles.column}>
            <Text style={styles.title}>INVOICE</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Invoice #</Text>
            <Text style={styles.text}>{invoice.invoiceNumber}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.text}>{invoice.billingPeriod}</Text>
          </View>
        </View>

        <View style={styles.headerRow}>
          <View style={styles.column}>
            <Text style={styles.label}>Bill To</Text>
            <Text style={styles.text}>{billTo.name}</Text>
            <Text style={styles.text}>{billTo.company}</Text>
            <Text style={styles.text}>{billTo.address}</Text>
            <Text style={styles.text}>{billTo.email}</Text>
          </View>
          <View style={styles.column}>
            <Text style={styles.label}>For / Project</Text>
            <Text style={styles.text}>{projects}</Text>
            <Text style={styles.text}>
              Work completed from {invoice.billingPeriod}
            </Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>DESCRIPTION</Text>
          <Text style={styles.colQty}>QTY</Text>
          <Text style={styles.colRate}>RATE (USD)</Text>
          <Text style={styles.colAmount}>AMOUNT (USD)</Text>
        </View>

        {invoice.lineItemsWithAmounts.map((item, index) => (
          <View key={index} style={styles.tableRow}>
            <Text style={styles.colDesc}>{item.description}</Text>
            <Text style={styles.colQty}>{item.qtyHours.toFixed(2)}</Text>
            <Text style={styles.colRate}>{item.rateUsd.toFixed(2)}</Text>
            <Text style={styles.colAmount}>{item.amountUsd.toFixed(2)}</Text>
          </View>
        ))}

        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>${invoice.totals.subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Tax ({invoice.taxPercent}%)</Text>
            <Text>${invoice.totals.taxAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Discount</Text>
            <Text>${invoice.discountUsd.toFixed(2)}</Text>
          </View>
          <View style={styles.totalDue}>
            <Text>TOTAL DUE (USD)</Text>
            <Text>${invoice.totals.totalDue.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.paymentBlock}>
          <Text style={styles.paymentTitle}>Payment Details</Text>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Wise Payment Link</Text>
            <Text>{invoice.resolvedWisePaymentLink}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Bank / Platform</Text>
            <Text>{paymentDetails.platform}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Account Name</Text>
            <Text>{paymentDetails.accountName}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Email</Text>
            <Text>{paymentDetails.email}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Account Link</Text>
            <Text>{invoice.accountLink}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Account Number</Text>
            <Text>{paymentDetails.accountNumber}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Bank code / BRSTN</Text>
            <Text>{paymentDetails.bankCode}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Reference / Note</Text>
            <Text>Invoice #{invoice.invoiceNumber}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export async function exportInvoicePdf(invoice: ComputedInvoice): Promise<void> {
  const blob = await pdf(<InvoiceDocument invoice={invoice} />).toBlob()
  const filename = `Invoice_JohnMarkAgustin_${sanitizeFilename(invoice.billingPeriod)}.pdf`
  downloadBlob(blob, filename)
}
