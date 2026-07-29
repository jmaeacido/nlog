import {
  consolidateClientItems,
  consolidateBlockers,
  emptyBlockerItem,
  emptyClientItem,
  emptyCompletedItem,
  formatCheckInDateLabel,
  getCheckInReportScope,
  getEstWeekKey,
  normalizeCompletedDeliverables,
  type CheckInCoverageMode,
  type CheckInDraft,
} from '@/lib/checkin-model'
import {
  summarizeEntriesForCheckInAi,
} from '@/lib/checkin-from-worklogs'
import { loadWorklogsForCheckIn } from '@/lib/load-worklogs-for-checkin'
import { parseCheckInFileMetadata } from '@/lib/load-worklogs-for-checkin'
import { requestProposeCheckIn } from '@/lib/groq-client'
import type { ProposedCheckInResult } from '@/lib/groq-types'
import { useCheckInStore } from '@/store/checkin-store'

const TEXT_HEADINGS = [
  ['currentlyWorking', /^currently working on\s*:?\s*$/i],
  [
    'completed',
    /^completed (?:this week so far|since last check-in)\b.*:?\s*$/i,
  ],
  ['pending', /^pending\s*\/\s*up next\s*:?\s*$/i],
  ['blocker', /^blocker \(if any\)\s*:?\s*$/i],
  ['helpFrom', /^who i need help (?:or|\/) confirmation from\b.*:?\s*$/i],
  ['eta', /^eta on current item\s*:?\s*$/i],
] as const

type TextHeading = (typeof TEXT_HEADINGS)[number][0]

function parseTextSections(content: string): Partial<Record<TextHeading, string>> {
  const sections: Partial<Record<TextHeading, string[]>> = {}
  let active: TextHeading | null = null
  for (const rawLine of content.replace(/\r\n/g, '\n').split('\n')) {
    const heading = TEXT_HEADINGS.find(([, pattern]) => pattern.test(rawLine.trim()))
    if (heading) {
      active = heading[0]
      sections[active] ??= []
    } else if (active) {
      sections[active]!.push(rawLine)
    }
  }
  return Object.fromEntries(
    Object.entries(sections).map(([key, lines]) => [
      key,
      (lines as string[]).join('\n').trim(),
    ]),
  )
}

function cleanSection(value = ''): string {
  return value
    .split('\n')
    .map((line) => line.trim())
    .map((line) => {
      const combined = line.match(/^client\s*:\s*.+?,\s*task\s*:\s*(.+)$/i)
      if (combined) return combined[1].trim()
      if (/^client\s*:/i.test(line)) return ''
      return line.replace(/^task\s*:\s*/i, '')
    })
    .filter(Boolean)
    .join('\n')
}

function localTextFilePatch(
  files: Awaited<ReturnType<typeof loadWorklogsForCheckIn>>['files'],
): Partial<CheckInDraft> {
  const current = []
  const completed = []
  const pending = []
  const blockers = []
  const help = []
  const eta = []
  const projects: string[] = []

  for (const file of files) {
    const metadata = parseCheckInFileMetadata(file.name)
    if (!metadata) continue
    const client = metadata.clientProject
    if (!projects.includes(client)) projects.push(client)
    const sections = parseTextSections(file.content)
    const item = (task: string) => ({
      id: crypto.randomUUID(),
      client,
      task: cleanSection(task),
    })
    if (sections.currentlyWorking) current.push(item(sections.currentlyWorking))
    if (sections.completed) completed.push(item(sections.completed))
    if (sections.pending) pending.push(item(sections.pending))
    if (sections.helpFrom) help.push(item(sections.helpFrom))
    if (sections.eta) eta.push(item(sections.eta))

    if (sections.blocker) {
      const issue: string[] = []
      const people: string[] = []
      let target: 'issue' | 'people' = 'issue'
      for (const rawLine of sections.blocker.split('\n')) {
        const line = rawLine.trim()
        if (!line || /^client\s*:/i.test(line)) continue
        if (/^point person(?: to answer this)?\s*:/i.test(line)) {
          target = 'people'
          people.push(line.replace(/^point person(?: to answer this)?\s*:\s*/i, ''))
        } else if (/^what'?s blocking\s*:/i.test(line)) {
          target = 'issue'
          issue.push(line.replace(/^what'?s blocking\s*:\s*/i, ''))
        } else {
          ;(target === 'people' ? people : issue).push(line)
        }
      }
      const issueText = issue.filter(Boolean).join('\n')
      blockers.push({
        id: crypto.randomUUID(),
        client,
        task: '',
        issue: issueText || 'None at this time.',
        pointPerson:
          people.filter(Boolean).join('\n') ||
          (/^none\b/i.test(issueText) ? 'None' : ''),
      })
    }
  }

  return {
    projects: projects.join(', '),
    currentlyWorking: current.length ? consolidateClientItems(current) : [emptyClientItem()],
    completed: completed.length ? consolidateClientItems(completed) : [emptyCompletedItem()],
    pending: pending.length ? consolidateClientItems(pending) : [emptyClientItem()],
    blocker: blockers.length ? consolidateBlockers(blockers) : [emptyBlockerItem()],
    helpFrom: help.length ? consolidateClientItems(help) : [emptyClientItem()],
    eta: eta.length ? consolidateClientItems(eta) : [emptyClientItem()],
  }
}

function proposedToDraftPatch(
  proposed: ProposedCheckInResult,
  base: CheckInDraft,
  mode: CheckInCoverageMode,
): Partial<CheckInDraft> {
  const toItems = (items: Array<{ client: string; task: string }>) =>
    consolidateClientItems(
      items.map((item) => ({ id: crypto.randomUUID(), ...item })),
    )
  const toBlockers = (
    items: Array<{ client: string; issue: string; pointPerson: string }>,
  ) =>
    consolidateBlockers(
      items.map((item) => ({
        id: crypto.randomUUID(),
        task: '',
        ...item,
      })),
    )
  const completed =
    proposed.completed.length > 0
      ? normalizeCompletedDeliverables(
          proposed.completed.map((item) => ({
            id: crypto.randomUUID(),
            client: item.client,
            task: item.task,
          })),
        )
      : normalizeCompletedDeliverables(
          base.completed.length > 0 ? base.completed : [emptyCompletedItem()],
        )

  const scope = getCheckInReportScope(new Date(), mode)

  return {
    projects: proposed.projects || base.projects,
    currentlyWorking:
      proposed.currentlyWorking.length ? toItems(proposed.currentlyWorking) : [emptyClientItem()],
    completed,
    pending: proposed.pending.length ? toItems(proposed.pending) : [emptyClientItem()],
    blocker: proposed.blocker.length ? toBlockers(proposed.blocker) : [emptyBlockerItem()],
    helpFrom: proposed.helpFrom.length ? toItems(proposed.helpFrom) : [emptyClientItem()],
    eta: proposed.eta.length ? toItems(proposed.eta) : [emptyClientItem()],
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
      files: Awaited<ReturnType<typeof loadWorklogsForCheckIn>>['files'],
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
      sourceDocuments: files.slice(0, 30).map((file) => {
        const metadata = parseCheckInFileMetadata(file.name)
        return {
          name: file.name,
          sourcePath: file.sourcePath,
          clientProject: metadata?.clientProject,
          reportDate: metadata?.date,
          reportLabel: metadata?.reportLabel,
          content: file.content.slice(0, 12_000),
        }
      }),
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
  const store = useCheckInStore.getState()
  const scope = getCheckInReportScope(new Date(), store.coverageMode)
  const loaded = await loadWorklogsForCheckIn({ scope })
  if (loaded.files.length === 0) {
    return {
      applied: false,
      weekEntryCount: 0,
      notes: loaded.notes,
    }
  }

  const draft = store.draft
  store.setDraft({
    ...localTextFilePatch(loaded.files),
    name: draft.name.trim() || options?.displayName?.trim() || draft.name,
    dateLabel: formatCheckInDateLabel(new Date(), store.coverageMode),
    weekKey: scope.weekKey,
  })
  return {
    applied: true,
    weekEntryCount: loaded.files.length,
    notes: [
      ...loaded.notes,
      'Parsed locally from Check-In text files. No Groq API call was made.',
    ],
  }
}

export async function draftCheckInWithLogger(options?: {
  displayName?: string
}): Promise<{
  applied: boolean
  proposed?: ProposedCheckInResult
  notes: string[]
}> {
  const current = useCheckInStore.getState()
  const loaded = await loadWorklogsForCheckIn({
    scope: getCheckInReportScope(new Date(), current.coverageMode),
  })
  if (loaded.files.length === 0) {
    return { applied: false, notes: loaded.notes }
  }

  const { draft, name, scope, mode, buildRequest } = proposePayload(
    options?.displayName,
  )
  const worklogEntries = summarizeEntriesForCheckInAi(loaded.entries, {
    scope,
  })
  const proposed = await requestProposeCheckIn(
    buildRequest(worklogEntries, loaded.files),
  )

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
  const current = useCheckInStore.getState()
  const loaded = await loadWorklogsForCheckIn({
    scope: getCheckInReportScope(new Date(), current.coverageMode),
  })
  if (loaded.files.length === 0) {
    return { proposed: null, notes: loaded.notes }
  }

  const { scope, buildRequest } = proposePayload(options?.displayName)
  const worklogEntries = summarizeEntriesForCheckInAi(loaded.entries, {
    scope,
  })
  const proposed = await requestProposeCheckIn(
    buildRequest(worklogEntries, loaded.files),
  )

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
