import {
  emptyCompletedItem,
  formatCheckInDateLabel,
  getCheckInReportScope,
  getEstWeekKey,
  groupCompletedByClient,
  type CheckInCoverageMode,
  type CheckInDraft,
} from '@/lib/checkin-model'
import {
  buildCheckInPrefillFromEntries,
  summarizeEntriesForCheckInAi,
} from '@/lib/checkin-from-worklogs'
import { loadWorklogsForCheckIn } from '@/lib/load-worklogs-for-checkin'
import { requestProposeCheckIn } from '@/lib/groq-client'
import type { ProposedCheckInResult } from '@/lib/groq-types'
import { useCheckInStore } from '@/store/checkin-store'

function proposedToDraftPatch(
  proposed: ProposedCheckInResult,
  base: CheckInDraft,
  mode: CheckInCoverageMode,
): Partial<CheckInDraft> {
  const completed =
    proposed.completed.length > 0
      ? groupCompletedByClient(
          proposed.completed.map((item) => ({
            id: crypto.randomUUID(),
            client: item.client,
            task: item.task,
          })),
        )
      : groupCompletedByClient(
          base.completed.length > 0 ? base.completed : [emptyCompletedItem()],
        )

  const scope = getCheckInReportScope(new Date(), mode)

  return {
    projects: proposed.projects || base.projects,
    currentlyWorking: {
      client:
        proposed.currentlyWorking.client || base.currentlyWorking.client,
      task: proposed.currentlyWorking.task || base.currentlyWorking.task,
    },
    completed,
    pending:
      proposed.pending.trim().length > 0 ? proposed.pending : base.pending,
    blocker: {
      issue:
        proposed.blocker.issue.trim().length > 0
          ? proposed.blocker.issue
          : base.blocker.issue,
      pointPerson:
        proposed.blocker.pointPerson.trim().length > 0
          ? proposed.blocker.pointPerson
          : base.blocker.pointPerson,
    },
    helpFrom:
      proposed.helpFrom.trim().length > 0 ? proposed.helpFrom : base.helpFrom,
    eta: proposed.eta.trim().length > 0 ? proposed.eta : base.eta,
    dateLabel: formatCheckInDateLabel(new Date(), mode),
    weekKey: scope.weekKey || base.weekKey || getEstWeekKey(),
  }
}

function proposePayload(displayName?: string) {
  const { draft, coverageMode } = useCheckInStore.getState()
  const name = draft.name.trim() || displayName?.trim() || ''
  const scope = getCheckInReportScope(new Date(), coverageMode)

  return {
    draft,
    name,
    scope,
    mode: coverageMode,
    buildRequest: (
      worklogEntries: ReturnType<typeof summarizeEntriesForCheckInAi>,
    ) => ({
      contractorName: name,
      dateLabel: formatCheckInDateLabel(new Date(), coverageMode),
      weekKey: scope.weekKey,
      reportScope: {
        startDate: scope.startDate,
        endDate: scope.endDate,
        reportDay: scope.reportDay,
        label: scope.label,
        coverage: scope.coverage,
        mode: scope.mode,
      },
      existingDraft: {
        projects: draft.projects,
        currentlyWorking: draft.currentlyWorking,
        completed: draft.completed
          .filter((item) => item.client.trim() || item.task.trim())
          .map((item) => ({ client: item.client, task: item.task })),
        pending: draft.pending,
        blocker: draft.blocker,
        helpFrom: draft.helpFrom,
        eta: draft.eta,
      },
      worklogEntries,
    }),
  }
}

export async function prefillCheckInFromWorklogs(options?: {
  displayName?: string
}): Promise<{
  applied: boolean
  weekEntryCount: number
  notes: string[]
}> {
  const loaded = await loadWorklogsForCheckIn()
  if (loaded.entries.length === 0) {
    return {
      applied: false,
      weekEntryCount: 0,
      notes: loaded.notes,
    }
  }

  const store = useCheckInStore.getState()
  const draft = store.draft
  const scope = getCheckInReportScope(new Date(), store.coverageMode)
  const result = buildCheckInPrefillFromEntries(loaded.entries, {
    scope,
    // Prefill replaces for the selected coverage window (does not keep other windows' completed)
    mergeExistingCompleted: false,
  })

  if (!result.draftPatch.projects && !result.draftPatch.currentlyWorking) {
    return {
      applied: false,
      weekEntryCount: 0,
      notes: [...loaded.notes, ...result.notes],
    }
  }

  store.setDraft({
    ...result.draftPatch,
    name: draft.name.trim() || options?.displayName?.trim() || draft.name,
    dateLabel: formatCheckInDateLabel(new Date(), store.coverageMode),
    weekKey: scope.weekKey,
  })

  return {
    applied: true,
    weekEntryCount: result.weekEntryCount,
    notes: [...loaded.notes, ...result.notes],
  }
}

export async function draftCheckInWithLogger(options?: {
  displayName?: string
}): Promise<{
  applied: boolean
  proposed?: ProposedCheckInResult
  notes: string[]
}> {
  const loaded = await loadWorklogsForCheckIn()
  if (loaded.entries.length === 0) {
    return { applied: false, notes: loaded.notes }
  }

  const { draft, name, scope, mode, buildRequest } = proposePayload(
    options?.displayName,
  )
  const worklogEntries = summarizeEntriesForCheckInAi(loaded.entries, {
    scope,
  })
  const proposed = await requestProposeCheckIn(buildRequest(worklogEntries))

  const patch = proposedToDraftPatch(
    proposed,
    {
      ...draft,
      name,
      dateLabel: formatCheckInDateLabel(new Date(), mode),
      weekKey: scope.weekKey,
    },
    mode,
  )

  useCheckInStore.getState().setDraft({
    ...patch,
    name,
  })

  return {
    applied: true,
    proposed,
    notes: [...loaded.notes, ...(proposed.notes ?? [])],
  }
}

/** Propose without applying — for Logger Apply card */
export async function proposeCheckInDraftOnly(options?: {
  displayName?: string
}): Promise<{
  proposed: ProposedCheckInResult | null
  notes: string[]
}> {
  const loaded = await loadWorklogsForCheckIn()
  if (loaded.entries.length === 0) {
    return { proposed: null, notes: loaded.notes }
  }

  const { scope, buildRequest } = proposePayload(options?.displayName)
  const worklogEntries = summarizeEntriesForCheckInAi(loaded.entries, {
    scope,
  })
  const proposed = await requestProposeCheckIn(buildRequest(worklogEntries))

  return { proposed, notes: [...loaded.notes, ...(proposed.notes ?? [])] }
}

export function applyProposedCheckInDraft(
  proposed: ProposedCheckInResult,
  displayName?: string,
) {
  const store = useCheckInStore.getState()
  const draft = store.draft
  const name = draft.name.trim() || displayName?.trim() || draft.name
  const mode = store.coverageMode
  const scope = getCheckInReportScope(new Date(), mode)
  const patch = proposedToDraftPatch(
    proposed,
    {
      ...draft,
      name,
      dateLabel: formatCheckInDateLabel(new Date(), mode),
      weekKey: scope.weekKey,
    },
    mode,
  )
  store.setDraft({ ...patch, name })
}
