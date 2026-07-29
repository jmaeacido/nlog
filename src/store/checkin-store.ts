import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  completedLinesForWeek,
  CHECK_IN_CONTRACTOR_NAME,
  createEmptyDraft,
  createReportFromDraft,
  draftFromReport,
  getEstWeekKey,
  startNextDraftFrom,
  type CheckInCompletedItem,
  type CheckInCoverageMode,
  type CheckInDraft,
  type CheckInReport,
} from '@/lib/checkin-model'
import {
  isLastRecordedCheckIn,
  LAST_RECORDED_CHECK_IN,
} from '@/data/last-checkin-report'

const MAX_ENTRIES = 100

interface CheckInState {
  draft: CheckInDraft
  entries: CheckInReport[]
  coverageMode: CheckInCoverageMode
  setCoverageMode: (mode: CheckInCoverageMode) => void
  setDraft: (patch: Partial<CheckInDraft>) => void
  replaceDraft: (draft: CheckInDraft) => void
  appendCompleted: (item?: Partial<CheckInCompletedItem>) => void
  updateCompleted: (
    id: string,
    patch: Partial<Omit<CheckInCompletedItem, 'id'>>,
  ) => void
  removeCompleted: (id: string) => void
  ensureDraftForSession: (displayName: string) => void
  saveReport: () => CheckInReport
  loadReportIntoDraft: (id: string) => boolean
  clearDraft: (displayName?: string) => void
  startNextCheckIn: (displayName?: string) => void
  removeEntry: (id: string) => void
  importReport: (report: CheckInReport) => boolean
  ensureLastRecordedCheckIn: () => boolean
  getCompletedForWeek: (weekKey?: string) => CheckInCompletedItem[]
  getEntry: (id: string) => CheckInReport | undefined
}

function newestSameWeekEntry(
  entries: CheckInReport[],
  weekKey: string,
): CheckInReport | undefined {
  return [...entries]
    .filter((entry) => entry.weekKey === weekKey)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

export const useCheckInStore = create<CheckInState>()(
  persist(
    (set, get) => ({
      draft: createEmptyDraft(),
      entries: [],
      coverageMode: 'week_to_date',

      setCoverageMode: (mode) => set({ coverageMode: mode }),

      setDraft: (patch) =>
        set((state) => ({
          draft: { ...state.draft, ...patch },
        })),

      replaceDraft: (draft) => set({ draft }),

      appendCompleted: (item) =>
        set((state) => ({
          draft: {
            ...state.draft,
            completed: [
              ...state.draft.completed,
              {
                id: crypto.randomUUID(),
                client: item?.client ?? '',
                task: item?.task ?? '',
              },
            ],
          },
        })),

      updateCompleted: (id, patch) =>
        set((state) => ({
          draft: {
            ...state.draft,
            completed: state.draft.completed.map((row) =>
              row.id === id ? { ...row, ...patch } : row,
            ),
          },
        })),

      removeCompleted: (id) =>
        set((state) => {
          const next = state.draft.completed.filter((row) => row.id !== id)
          return {
            draft: {
              ...state.draft,
              completed:
                next.length > 0
                  ? next
                  : [{ id: crypto.randomUUID(), client: '', task: '' }],
            },
          }
        }),

      ensureDraftForSession: (_displayName) => {
        const state = get()
        const weekKey = getEstWeekKey()
        const name = CHECK_IN_CONTRACTOR_NAME
        const sameWeekNewest = newestSameWeekEntry(state.entries, weekKey)

        // Empty / stale draft: seed from same-week report or fresh empty
        const draftIsBlank =
          !state.draft.projects.trim() &&
          !state.draft.currentlyWorking.client.trim() &&
          !state.draft.currentlyWorking.task.trim() &&
          !state.draft.eta.trim() &&
          state.draft.completed.every(
            (item) => !item.client.trim() && !item.task.trim(),
          )

        if (draftIsBlank && sameWeekNewest) {
          set({
            draft: draftFromReport(sameWeekNewest, {
              refreshDateLabel: true,
              name,
            }),
          })
          return
        }

        if (state.draft.weekKey !== weekKey) {
          if (sameWeekNewest) {
            set({
              draft: draftFromReport(sameWeekNewest, {
                refreshDateLabel: true,
                name,
              }),
            })
          } else {
            set({
              draft: {
                ...createEmptyDraft(name),
                weekKey,
              },
            })
          }
          return
        }

        if (name && state.draft.name !== name) {
          set((current) => ({
            draft: { ...current.draft, name },
          }))
        }
      },

      saveReport: () => {
        const draft = get().draft
        const report = createReportFromDraft(draft)

        set((state) => {
          // Replace same-day / same dateLabel entry if re-saving today
          const withoutDup = state.entries.filter(
            (entry) =>
              !(
                entry.weekKey === report.weekKey &&
                entry.dateLabel === report.dateLabel &&
                entry.name === report.name
              ),
          )
          return {
            draft: {
              ...draft,
              completed:
                report.completed.length > 0
                  ? report.completed.map((item) => ({ ...item }))
                  : draft.completed,
            },
            entries: [report, ...withoutDup].slice(0, MAX_ENTRIES),
          }
        })

        return report
      },

      loadReportIntoDraft: (id) => {
        const entry = get().entries.find((item) => item.id === id)
        if (!entry) return false
        set({
          draft: draftFromReport(entry, { name: CHECK_IN_CONTRACTOR_NAME }),
        })
        return true
      },

      clearDraft: () => {
        set({ draft: createEmptyDraft() })
      },

      startNextCheckIn: () => {
        const { draft, entries } = get()
        const weekKey = getEstWeekKey()
        const sameWeek = newestSameWeekEntry(entries, weekKey)
        const source = sameWeek ?? draft
        set({ draft: startNextDraftFrom(source, CHECK_IN_CONTRACTOR_NAME) })
      },

      removeEntry: (id) =>
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== id),
        })),

      importReport: (report) => {
        const exists = get().entries.some(
          (entry) =>
            entry.id === report.id ||
            (entry.dateLabel === report.dateLabel &&
              entry.name === report.name),
        )
        if (exists) return false

        set((state) => ({
          entries: [report, ...state.entries].slice(0, MAX_ENTRIES),
        }))
        return true
      },

      ensureLastRecordedCheckIn: () => {
        const state = get()
        const already = state.entries.some(isLastRecordedCheckIn)
        if (already) return false

        const report: CheckInReport = {
          ...LAST_RECORDED_CHECK_IN,
          completed: LAST_RECORDED_CHECK_IN.completed.map((item) => ({
            ...item,
          })),
        }

        set((current) => ({
          entries: [report, ...current.entries].slice(0, MAX_ENTRIES),
          draft: draftFromReport(report),
        }))
        return true
      },

      getCompletedForWeek: (weekKey) =>
        completedLinesForWeek(get().entries, weekKey ?? getEstWeekKey()),

      getEntry: (id) => get().entries.find((entry) => entry.id === id),
    }),
    {
      name: 'nlog-checkins',
      version: 2,
      migrate: (persisted) => {
        const state = persisted as {
          draft?: CheckInDraft
          entries?: CheckInReport[]
          coverageMode?: CheckInCoverageMode
        }
        return {
          draft: state.draft ?? createEmptyDraft(),
          entries: state.entries ?? [],
          coverageMode: state.coverageMode ?? 'week_to_date',
        }
      },
      partialize: (state) => ({
        draft: state.draft,
        entries: state.entries,
        coverageMode: state.coverageMode,
      }),
    },
  ),
)
