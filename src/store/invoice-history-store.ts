import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ComputedInvoice } from '@/lib/invoice-model'
import {
  buildHistoryFingerprint,
  createHistoryEntry,
  type InvoiceExportFormat,
  type InvoiceHistoryEntry,
} from '@/lib/invoice-history'

const MAX_HISTORY_ENTRIES = 100

interface InvoiceHistoryState {
  entries: InvoiceHistoryEntry[]
  recordExport: (
    invoice: ComputedInvoice,
    format: InvoiceExportFormat,
  ) => InvoiceHistoryEntry
  removeEntry: (id: string) => void
  clearHistory: () => void
  getEntry: (id: string) => InvoiceHistoryEntry | undefined
}

export const useInvoiceHistoryStore = create<InvoiceHistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      recordExport: (invoice, format) => {
        const fingerprint = buildHistoryFingerprint(invoice)
        const existing = get().entries.find(
          (entry) => buildHistoryFingerprint(entry.invoice) === fingerprint,
        )
        const nextEntry = createHistoryEntry(invoice, format, existing)

        set((state) => {
          const withoutExisting = existing
            ? state.entries.filter((entry) => entry.id !== existing.id)
            : state.entries

          return {
            entries: [nextEntry, ...withoutExisting].slice(0, MAX_HISTORY_ENTRIES),
          }
        })

        return nextEntry
      },
      removeEntry: (id) =>
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== id),
        })),
      clearHistory: () => set({ entries: [] }),
      getEntry: (id) => get().entries.find((entry) => entry.id === id),
    }),
    {
      name: 'nlog-invoice-history',
      version: 1,
      partialize: (state) => ({
        entries: state.entries,
      }),
    },
  ),
)
