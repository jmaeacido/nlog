import { useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { computeInvoice } from '@/lib/calculate-totals'
import type { InvoiceDraft } from '@/lib/invoice-model'
import { useInvoiceHistoryStore } from '@/store/invoice-history-store'
import { useInvoiceStore } from '@/store/invoice-store'

export function ExportActions({ draft }: { draft: InvoiceDraft }) {
  const [isExporting, setIsExporting] = useState<'pdf' | 'xlsx' | null>(null)
  const markExported = useInvoiceStore((state) => state.markExported)
  const recordExport = useInvoiceHistoryStore((state) => state.recordExport)

  const handleExport = async (type: 'pdf' | 'xlsx') => {
    if (draft.lineItems.length === 0) {
      toast.error('Add at least one worklog line item before exporting.')
      return
    }

    if (!draft.billingPeriod.trim()) {
      toast.error('Billing period is required.')
      return
    }

    setIsExporting(type)
    try {
      const invoice = computeInvoice(draft)

      if (type === 'xlsx') {
        const { exportInvoiceXlsx } = await import('@/lib/export-xlsx')
        await exportInvoiceXlsx(invoice)
        toast.success('XLSX invoice downloaded and saved to History.')
      } else {
        const { exportInvoicePdf } = await import('@/lib/export-pdf')
        await exportInvoicePdf(invoice)
        toast.success('PDF invoice downloaded and saved to History.')
      }

      recordExport(invoice, type)
      markExported()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Export failed. Please try again.'
      toast.error(message)
    } finally {
      setIsExporting(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button
        type="button"
        className="flex-1"
        disabled={isExporting !== null}
        onClick={() => void handleExport('xlsx')}
      >
        <FileSpreadsheet className="h-4 w-4" />
        {isExporting === 'xlsx' ? 'Generating XLSX...' : 'Download XLSX'}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="flex-1"
        disabled={isExporting !== null}
        onClick={() => void handleExport('pdf')}
      >
        <FileText className="h-4 w-4" />
        {isExporting === 'pdf' ? 'Generating PDF...' : 'Download PDF'}
      </Button>
    </div>
  )
}
