import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardCopy,
  ClipboardList,
  FolderOpen,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/auth-provider'
import { AppShell, type AppView } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  draftCheckInWithLogger,
  prefillCheckInFromWorklogs,
} from '@/lib/checkin-autofill'
import {
  formatCheckInDateLabel,
  formatCheckInForSlack,
  getCheckInCadenceStatus,
  getCheckInReportScope,
  type CheckInCoverageMode,
} from '@/lib/checkin-model'
import { checkInDraftSchema } from '@/lib/checkin-schema'
import { cn } from '@/lib/utils'
import {
  fetchSlackCheckInConfigured,
  requestPostCheckInSlack,
} from '@/lib/checkin-client'
import { ApiAuthError } from '@/lib/api-client'
import { useCheckInStore } from '@/store/checkin-store'
import { useInvoiceHistoryStore } from '@/store/invoice-history-store'

function formatSavedAt(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function CheckInPage({
  onNavigate,
}: {
  onNavigate: (view: AppView) => void
}) {
  const { displayName } = useAuth()
  const historyCount = useInvoiceHistoryStore((state) => state.entries.length)
  const draft = useCheckInStore((state) => state.draft)
  const entries = useCheckInStore((state) => state.entries)
  const setDraft = useCheckInStore((state) => state.setDraft)
  const appendCompleted = useCheckInStore((state) => state.appendCompleted)
  const updateCompleted = useCheckInStore((state) => state.updateCompleted)
  const removeCompleted = useCheckInStore((state) => state.removeCompleted)
  const ensureDraftForSession = useCheckInStore(
    (state) => state.ensureDraftForSession,
  )
  const saveReport = useCheckInStore((state) => state.saveReport)
  const loadReportIntoDraft = useCheckInStore(
    (state) => state.loadReportIntoDraft,
  )
  const startNextCheckIn = useCheckInStore((state) => state.startNextCheckIn)
  const removeEntry = useCheckInStore((state) => state.removeEntry)
  const coverageMode = useCheckInStore((state) => state.coverageMode)
  const setCoverageMode = useCheckInStore((state) => state.setCoverageMode)

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [autofilling, setAutofilling] = useState<'worklogs' | 'logger' | null>(
    null,
  )
  const [slackPosting, setSlackPosting] = useState(false)
  const [slackEnabled, setSlackEnabled] = useState(false)

  useEffect(() => {
    void fetchSlackCheckInConfigured().then(setSlackEnabled).catch(() => {
      setSlackEnabled(false)
    })
  }, [])

  const ensureLastRecordedCheckIn = useCheckInStore(
    (state) => state.ensureLastRecordedCheckIn,
  )

  useEffect(() => {
    ensureDraftForSession(displayName || '')
    const imported = ensureLastRecordedCheckIn()
    if (imported) {
      toast.message('Loaded your last recorded check-in (Mon Jul 27 — Obsidian Quant).')
    }
  }, [displayName, ensureDraftForSession, ensureLastRecordedCheckIn])

  const cadence = useMemo(
    () => getCheckInCadenceStatus(new Date(), coverageMode),
    [coverageMode],
  )
  const reportScope = useMemo(
    () => getCheckInReportScope(new Date(), coverageMode),
    [coverageMode],
  )

  const handleCoverageMode = (mode: CheckInCoverageMode) => {
    setCoverageMode(mode)
    setDraft({
      dateLabel: formatCheckInDateLabel(new Date(), mode),
      weekKey: getCheckInReportScope(new Date(), mode).weekKey,
    })
  }

  const handlePrefillWorklogs = async () => {
    setAutofilling('worklogs')
    try {
      const result = await prefillCheckInFromWorklogs({
        displayName: displayName || undefined,
      })
      if (!result.applied) {
        toast.error(result.notes[0] || 'Could not prefill from worklogs.')
        if (result.notes.length > 1) {
          toast.message(result.notes.slice(1, 3).join(' '))
        }
        return
      }
      setFieldErrors({})
      const scope = getCheckInReportScope(new Date(), coverageMode)
      toast.success(
        `Prefilled ${result.weekEntryCount} entr${result.weekEntryCount === 1 ? 'y' : 'ies'} for ${scope.coverage}.`,
      )
      if (result.notes.length > 1) {
        toast.message(result.notes.slice(1, 3).join(' '))
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Worklog prefill failed.',
      )
    } finally {
      setAutofilling(null)
    }
  }

  const handleDraftWithLogger = async () => {
    setAutofilling('logger')
    try {
      const result = await draftCheckInWithLogger({
        displayName: displayName || undefined,
      })
      if (!result.applied) {
        toast.error(result.notes[0] || 'Logger needs worklog markdown first.')
        return
      }
      setFieldErrors({})
      const rateLimited = result.notes.some((note) =>
        /rate limit|token limit|locally from worklogs/i.test(note),
      )
      if (rateLimited) {
        toast.message(
          'Groq is rate-limited — filled a local draft from worklogs. Review it, or retry Logger later.',
        )
      } else {
        toast.success(
          'Logger drafted your check-in from worklogs. Review before saving.',
        )
      }
      const extra = result.proposed?.notes?.slice(0, 2).join(' ')
      if (extra && !rateLimited) toast.message(extra)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Logger draft failed.',
      )
    } finally {
      setAutofilling(null)
    }
  }

  const validate = () => {
    const result = checkInDraftSchema.safeParse(draft)
    if (result.success) {
      setFieldErrors({})
      return true
    }
    const next: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const key = issue.path.join('.')
      if (!next[key]) next[key] = issue.message
    }
    setFieldErrors(next)
    return false
  }

  const handleSave = () => {
    if (!validate()) {
      toast.error('Fix the highlighted fields before saving.')
      return
    }
    saveReport()
    toast.success('Check-in saved on this device.')
  }

  const handleCopy = async () => {
    if (!validate()) {
      toast.error('Fix the highlighted fields before copying.')
      return
    }
    const text = formatCheckInForSlack(draft)
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied for Slack — paste into Output Reporting Channel.')
    } catch {
      toast.error('Could not copy to clipboard.')
    }
  }

  const handleSaveAndCopy = async () => {
    if (!validate()) {
      toast.error('Fix the highlighted fields first.')
      return
    }
    saveReport()
    const text = formatCheckInForSlack(useCheckInStore.getState().draft)
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Saved and copied for Slack.')
    } catch {
      toast.success('Saved. Clipboard copy failed — use Copy for Slack.')
    }
  }

  const postToSlack = async (text: string) => {
    setSlackPosting(true)
    try {
      const result = await requestPostCheckInSlack(text)
      if (result.permalink) {
        toast.success('Posted to Output Reporting Channel.', {
          action: {
            label: 'Open in Slack',
            onClick: () => window.open(result.permalink!, '_blank', 'noopener'),
          },
        })
      } else {
        toast.success('Posted to Output Reporting Channel.')
      }
      return true
    } catch (error) {
      const message =
        error instanceof ApiAuthError || error instanceof Error
          ? error.message
          : 'Slack post failed.'
      toast.error(message)
      return false
    } finally {
      setSlackPosting(false)
    }
  }

  const handleSaveAndPost = async () => {
    if (!validate()) {
      toast.error('Fix the highlighted fields first.')
      return
    }
    saveReport()
    const text = formatCheckInForSlack(useCheckInStore.getState().draft)
    await postToSlack(text)
  }

  const handlePostOnly = async () => {
    if (!validate()) {
      toast.error('Fix the highlighted fields before posting.')
      return
    }
    const text = formatCheckInForSlack(draft)
    await postToSlack(text)
  }

  const err = (path: string) => fieldErrors[path]

  return (
    <AppShell
      activeView="checkin"
      onNavigate={onNavigate}
      historyCount={historyCount}
    >
      <div className="mb-6 space-y-2">
        <h1 className="text-xl font-semibold text-nlog-navy">
          Contractor check-in
        </h1>
        <p className="text-sm text-nlog-slate">
          Mon / Wed / Fri before 9am EST. Status report — not a timesheet.
          Completed must match your billing invoice.
        </p>

        <div className="space-y-2">
          <p className="text-xs font-medium text-nlog-navy">Report coverage</p>
          <div className="flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              className={cn(
                'flex-1 rounded-md px-3 py-2 text-left text-xs transition',
                coverageMode === 'week_to_date'
                  ? 'bg-white text-nlog-navy shadow-sm'
                  : 'text-nlog-slate hover:text-nlog-navy',
              )}
              onClick={() => handleCoverageMode('week_to_date')}
            >
              <span className="font-medium">Week to date</span>
              <span className="mt-0.5 block text-[11px] text-nlog-slate">
                Mon Sat–Mon · Wed Sat–Wed · Fri Sat–Fri
              </span>
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 rounded-md px-3 py-2 text-left text-xs transition',
                coverageMode === 'segment'
                  ? 'bg-white text-nlog-navy shadow-sm'
                  : 'text-nlog-slate hover:text-nlog-navy',
              )}
              onClick={() => handleCoverageMode('segment')}
            >
              <span className="font-medium">Since last check-in</span>
              <span className="mt-0.5 block text-[11px] text-nlog-slate">
                Mon Sat–Mon · Wed Tue–Wed · Fri Thu–Fri
              </span>
            </button>
          </div>
        </div>

        <p
          className={cn(
            'rounded-lg px-3 py-2 text-xs',
            cadence.kind === 'due_today' &&
              'bg-amber-50 text-amber-900',
            cadence.kind === 'overdue' && 'bg-rose-50 text-rose-900',
            cadence.kind === 'upcoming' && 'bg-slate-100 text-nlog-slate',
          )}
        >
          {cadence.kind === 'due_today' && cadence.label}
          {cadence.kind === 'overdue' &&
            `${cadence.label} · since ${cadence.sinceLabel}`}
          {cadence.kind === 'upcoming' &&
            `${cadence.label} · next ${cadence.nextLabel}`}
        </p>
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-nlog-slate">
          This report covers{' '}
          <span className="font-medium text-nlog-navy">{reportScope.coverage}</span>
          {' '}({reportScope.label}).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={autofilling !== null}
            onClick={() => void handlePrefillWorklogs()}
          >
            <FolderOpen className="h-4 w-4" />
            {autofilling === 'worklogs'
              ? 'Reading worklogs…'
              : 'Prefill from worklogs'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={autofilling !== null}
            onClick={() => void handleDraftWithLogger()}
          >
            <Sparkles className="h-4 w-4" />
            {autofilling === 'logger' ? 'Logger drafting…' : 'Draft with Logger'}
          </Button>
        </div>
        <p className="text-[11px] text-nlog-slate">
          Uses Generate worklogs if loaded; otherwise saved project paths /
          OneDrive. Both Prefill and Logger only include entries inside the
          selected report coverage.
        </p>
      </div>

      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="checkin-name">Contractor name</Label>
            <Input
              id="checkin-name"
              value={draft.name}
              onChange={(e) => setDraft({ name: e.target.value })}
              placeholder="Your name"
            />
            {err('name') && (
              <p className="text-xs text-rose-700">{err('name')}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="checkin-date">Date / report</Label>
            <Input
              id="checkin-date"
              value={draft.dateLabel}
              onChange={(e) => setDraft({ dateLabel: e.target.value })}
              placeholder="Monday, July 27, 2026 (Monday Report)"
            />
            {err('dateLabel') && (
              <p className="text-xs text-rose-700">{err('dateLabel')}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="checkin-projects">Project(s)</Label>
          <Input
            id="checkin-projects"
            value={draft.projects}
            onChange={(e) => setDraft({ projects: e.target.value })}
            placeholder="Every project touched since the last report"
          />
          {err('projects') && (
            <p className="text-xs text-rose-700">{err('projects')}</p>
          )}
        </div>

        <fieldset className="space-y-3 rounded-xl border border-nlog-border bg-white p-4">
          <legend className="px-1 text-sm font-medium text-nlog-navy">
            Currently working on
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="checkin-client">Client</Label>
              <Input
                id="checkin-client"
                value={draft.currentlyWorking.client}
                onChange={(e) =>
                  setDraft({
                    currentlyWorking: {
                      ...draft.currentlyWorking,
                      client: e.target.value,
                    },
                  })
                }
                placeholder="Alchemydev — Obsidian Quant"
              />
              {err('currentlyWorking.client') && (
                <p className="text-xs text-rose-700">
                  {err('currentlyWorking.client')}
                </p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="checkin-task">Task</Label>
              <Textarea
                id="checkin-task"
                className="min-h-24"
                value={draft.currentlyWorking.task}
                onChange={(e) =>
                  setDraft({
                    currentlyWorking: {
                      ...draft.currentlyWorking,
                      task: e.target.value,
                    },
                  })
                }
                placeholder="Blog CMS — running through local testing and getting it ready for production…"
              />
              {err('currentlyWorking.task') && (
                <p className="text-xs text-rose-700">
                  {err('currentlyWorking.task')}
                </p>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-nlog-border bg-white p-4">
          <legend className="px-1 text-sm font-medium text-nlog-navy">
            Completed this week so far
          </legend>
          <p className="text-xs text-nlog-slate">
            One row per deliverable (not sub-steps). Same client can appear on
            multiple rows — Slack copies as{' '}
            <span className="font-medium">Client: …, Task: …</span>
          </p>
          <div className="space-y-3">
            {draft.completed.map((item, index) => (
              <div
                key={item.id}
                className="space-y-2 rounded-lg bg-slate-50 p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor={`completed-client-${item.id}`}>
                      Client {index + 1}
                    </Label>
                    <Input
                      id={`completed-client-${item.id}`}
                      value={item.client}
                      onChange={(e) =>
                        updateCompleted(item.id, { client: e.target.value })
                      }
                      placeholder="Alchemydev — Obsidian Quant"
                    />
                    {err(`completed.${index}.client`) && (
                      <p className="text-xs text-rose-700">
                        {err(`completed.${index}.client`)}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="mt-6"
                    aria-label="Remove deliverable"
                    onClick={() => removeCompleted(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`completed-task-${item.id}`}>Task</Label>
                  <Textarea
                    id={`completed-task-${item.id}`}
                    className="min-h-20"
                    value={item.task}
                    onChange={(e) =>
                      updateCompleted(item.id, { task: e.target.value })
                    }
                    placeholder="Blog CMS — initial build (database, login, admin dashboard, …)"
                  />
                  {err(`completed.${index}.task`) && (
                    <p className="text-xs text-rose-700">
                      {err(`completed.${index}.task`)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => appendCompleted()}
          >
            <Plus className="h-4 w-4" />
            Add deliverable
          </Button>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="checkin-pending">Pending / up next</Label>
          <Textarea
            id="checkin-pending"
            className="min-h-20"
            value={draft.pending}
            onChange={(e) => setDraft({ pending: e.target.value })}
            placeholder={
              'Run through the full acceptance checklist locally\nPackage for review (branch/PR) and prepare production deploy'
            }
          />
        </div>

        <fieldset className="space-y-3 rounded-xl border border-nlog-border bg-white p-4">
          <legend className="px-1 text-sm font-medium text-nlog-navy">
            Blocker (if any)
          </legend>
          <div className="space-y-1.5">
            <Label htmlFor="checkin-blocker-issue">What’s blocking</Label>
            <Textarea
              id="checkin-blocker-issue"
              className="min-h-20"
              value={draft.blocker.issue}
              onChange={(e) =>
                setDraft({
                  blocker: { ...draft.blocker, issue: e.target.value },
                })
              }
              placeholder='Specific issue — not “waiting on approval”'
            />
            {err('blocker.issue') && (
              <p className="text-xs text-rose-700">{err('blocker.issue')}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="checkin-blocker-pp">
              Point Person to answer this
            </Label>
            <Input
              id="checkin-blocker-pp"
              value={draft.blocker.pointPerson}
              onChange={(e) =>
                setDraft({
                  blocker: { ...draft.blocker, pointPerson: e.target.value },
                })
              }
              placeholder="Name to @tag in Slack only if blocking"
            />
            {err('blocker.pointPerson') && (
              <p className="text-xs text-rose-700">
                {err('blocker.pointPerson')}
              </p>
            )}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="checkin-help">
            Who I need help / confirmation from (non-blocking)
          </Label>
          <Textarea
            id="checkin-help"
            className="min-h-20"
            value={draft.helpFrom}
            onChange={(e) => setDraft({ helpFrom: e.target.value })}
            placeholder={
              'Arvin — review the deliverable before merge and production deploy\nKev — SEO or content expectations for first posts'
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="checkin-eta">ETA on current item</Label>
          <Textarea
            id="checkin-eta"
            className="min-h-20"
            value={draft.eta}
            onChange={(e) => setDraft({ eta: e.target.value })}
            placeholder={
              'Local acceptance + PR packaging: Wednesday, July 29, 2026\nProduction go-live (pending approval): Friday, July 31, 2026'
            }
          />
          {err('eta') && (
            <p className="text-xs text-rose-700">{err('eta')}</p>
          )}
        </div>

        <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-nlog-border bg-nlog-bg/95 px-4 py-4 backdrop-blur">
          <div className="flex flex-wrap gap-2">
            {slackEnabled ? (
              <>
                <Button
                  type="button"
                  disabled={slackPosting}
                  onClick={() => void handleSaveAndPost()}
                >
                  <Send className="h-4 w-4" />
                  {slackPosting ? 'Posting…' : 'Save & post to Slack'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={slackPosting}
                  onClick={() => void handlePostOnly()}
                >
                  <Send className="h-4 w-4" />
                  Post to Slack
                </Button>
              </>
            ) : (
              <Button type="button" onClick={() => void handleSaveAndCopy()}>
                <ClipboardCopy className="h-4 w-4" />
                Save &amp; copy for Slack
              </Button>
            )}
            <Button type="button" variant="outline" onClick={handleSave}>
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCopy()}
            >
              <ClipboardList className="h-4 w-4" />
              Copy for Slack
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                startNextCheckIn(displayName || undefined)
                setFieldErrors({})
                toast.message('Started next check-in — Completed carried forward for this week.')
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Start next check-in
            </Button>
          </div>
        </div>
      </div>

      <section className="mt-10 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-nlog-navy">
            Saved check-ins
          </h2>
          {entries.length > 0 && (
            <span className="text-xs text-nlog-slate">
              {entries.length} on this device
            </span>
          )}
        </div>

        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-nlog-border px-4 py-6 text-center text-sm text-nlog-slate">
            No saved check-ins yet. Save one to reopen or re-copy later.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-2 rounded-xl border border-nlog-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-nlog-navy">
                    {entry.dateLabel}
                  </p>
                  <p className="truncate text-xs text-nlog-slate">
                    {entry.currentlyWorking.client
                      ? `${entry.currentlyWorking.client} — ${entry.currentlyWorking.task}`
                      : entry.projects}{' '}
                    · {formatSavedAt(entry.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      loadReportIntoDraft(entry.id)
                      setFieldErrors({})
                      toast.message('Loaded into the form.')
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  >
                    Reopen
                  </Button>
                  {slackEnabled && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={slackPosting}
                      onClick={() => {
                        void postToSlack(formatCheckInForSlack(entry))
                      }}
                    >
                      Post
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(formatCheckInForSlack(entry))
                        .then(() => toast.success('Copied for Slack.'))
                        .catch(() => toast.error('Copy failed.'))
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Delete check-in"
                    onClick={() => {
                      removeEntry(entry.id)
                      toast.message('Check-in removed.')
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  )
}
