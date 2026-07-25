import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { MessageCircle, Send, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { requestLoggerChat } from '@/lib/groq-client'
import type { LoggerChatMessage, ProposedCheckInResult } from '@/lib/groq-types'
import {
  applyProposedCheckInDraft,
  proposeCheckInDraftOnly,
} from '@/lib/checkin-autofill'
import { calculateTotals } from '@/lib/calculate-totals'
import { convertUsdToPhp } from '@/lib/exchange-rate'
import {
  getHoursDelta,
  isHoursAdjusted,
  summarizeAdjustments,
} from '@/lib/time-adjustments'
import {
  filterLineItemsByTimeline,
  formatTimelineLabel,
} from '@/lib/timeline'
import { cn } from '@/lib/utils'
import { useUsdPhpRate } from '@/hooks/use-usd-php-rate'
import { useCheckInStore } from '@/store/checkin-store'
import { useInvoiceHistoryStore } from '@/store/invoice-history-store'
import { useInvoiceStore } from '@/store/invoice-store'

const WELCOME: LoggerChatMessage = {
  role: 'assistant',
  content:
    "Hi — I'm Logger. I can help with worklogs, invoices, FX, and Mon/Wed/Fri check-ins. What do you need?",
}

const SUGGESTIONS = [
  'Draft my check-in from worklogs',
  'What worklog format does NLog expect?',
  'How do I adjust worked hours?',
  'Convert my total due to PHP',
]

const DRAFT_CHECKIN_RE =
  /\b(draft|fill|prefill|write|prepare|create).{0,40}\bcheck[-\s]?in\b|\bcheck[-\s]?in\b.{0,40}\b(draft|fill|prefill)\b/i

const THINKING_LABELS = ['Thinking', 'Reading your context', 'Drafting a reply']

function LoggerThinkingLoader() {
  const [labelIndex, setLabelIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLabelIndex((current) => (current + 1) % THINKING_LABELS.length)
    }, 1800)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div
      className="max-w-[90%] rounded-2xl bg-slate-100 px-3 py-2.5 text-sm text-slate-700"
      role="status"
      aria-live="polite"
      aria-label="Logger is thinking"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex items-center gap-1" aria-hidden="true">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="animate-logger-dot h-1.5 w-1.5 rounded-full bg-nlog-navy"
              style={{ animationDelay: `${dot * 160}ms` }}
            />
          ))}
        </span>
        <span className="animate-logger-pulse text-xs font-medium text-nlog-slate">
          {THINKING_LABELS[labelIndex]}…
        </span>
      </div>
    </div>
  )
}

export function LoggerChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<LoggerChatMessage[]>([WELCOME])
  const [isSending, setIsSending] = useState(false)
  const [pendingCheckIn, setPendingCheckIn] =
    useState<ProposedCheckInResult | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { displayName } = useAuth()
  const {
    step,
    worklogFiles,
    lineItems,
    parseErrors,
    parseWarnings,
    usedAiParse,
    form,
  } = useInvoiceStore()

  const checkInDraft = useCheckInStore((state) => state.draft)
  const { rate: usdPhpRate } = useUsdPhpRate()
  const historyEntries = useInvoiceHistoryStore((state) => state.entries)

  const context = useMemo(() => {
    const hasTimeline = Boolean(form.timelineStartDate && form.timelineEndDate)
    const timelineFilter = hasTimeline
      ? filterLineItemsByTimeline(lineItems, {
          startDate: form.timelineStartDate,
          endDate: form.timelineEndDate,
          startTime: form.timelineStartTime,
          endTime: form.timelineEndTime,
        })
      : null

    const billableItems = timelineFilter?.included ?? lineItems
    const billableTotals = calculateTotals(
      billableItems,
      form.hourlyRateUsd,
      form.taxPercent,
      form.discountUsd,
    )
    const allTotals = calculateTotals(
      lineItems,
      form.hourlyRateUsd,
      form.taxPercent,
      form.discountUsd,
    )

    const rate = usdPhpRate?.rate
    const projects = [...new Set(billableItems.map((item) => item.project))]
    const adjustmentSummary = summarizeAdjustments(billableItems)
    const adjustedEntries = billableItems
      .filter((entry) => isHoursAdjusted(entry) || entry.isManualAdjustment)
      .slice(0, 8)
      .map((entry) => ({
        project: entry.project,
        qtyHours: entry.qtyHours,
        originalQtyHours: entry.originalQtyHours ?? entry.qtyHours,
        deltaHours: entry.isManualAdjustment
          ? entry.qtyHours
          : getHoursDelta(entry),
        reason: entry.adjustmentReason,
        isManualAdjustment: Boolean(entry.isManualAdjustment),
      }))

    const completedPreview = checkInDraft.completed
      .filter((item) => item.client.trim() || item.task.trim())
      .slice(0, 8)
      .map((item) => ({ client: item.client, task: item.task }))

    return {
      step,
      worklogFileCount: worklogFiles.length,
      lineItemCount: lineItems.length,
      billableEntryCount: billableItems.length,
      excludedEntryCount: timelineFilter?.excluded.length ?? 0,
      unparseableEntryCount: timelineFilter?.unparseable.length ?? 0,
      parseErrorCount: parseErrors.length,
      parseWarningCount: parseWarnings.length,
      usedAiParse,
      invoiceNumber: form.invoiceNumber || undefined,
      billingPeriod: form.billingPeriod || undefined,
      timelineLabel: hasTimeline
        ? formatTimelineLabel({
            startDate: form.timelineStartDate,
            endDate: form.timelineEndDate,
            startTime: form.timelineStartTime,
            endTime: form.timelineEndTime,
          })
        : undefined,
      timelineStartDate: form.timelineStartDate || undefined,
      timelineEndDate: form.timelineEndDate || undefined,
      historyCount: historyEntries.length,
      recentHistory: historyEntries.slice(0, 5).map((entry) => ({
        invoiceNumber: entry.invoice.invoiceNumber,
        billingPeriod: entry.invoice.billingPeriod,
        totalDue: entry.invoice.totals.totalDue,
        savedAt: entry.updatedAt,
      })),
      adjustedEntryCount: adjustmentSummary.adjustedCount,
      manualAdjustmentCount: adjustmentSummary.manualCount,
      netAdjustmentHours: adjustmentSummary.netDeltaHours,
      adjustedEntries,
      hourlyRateUsd: form.hourlyRateUsd,
      hourlyRatePhp:
        rate != null ? convertUsdToPhp(form.hourlyRateUsd, rate) : undefined,
      taxPercent: form.taxPercent,
      discountUsd: form.discountUsd,
      totalHours: billableTotals.totalHours,
      subtotalUsd: billableTotals.subtotal,
      taxAmountUsd: billableTotals.taxAmount,
      totalDue: billableTotals.totalDue,
      totalDuePhp:
        rate != null ? convertUsdToPhp(billableTotals.totalDue, rate) : undefined,
      allLineItemCount: lineItems.length,
      allTotalHours: allTotals.totalHours,
      allTotalDue: allTotals.totalDue,
      usdPhpRate: rate,
      usdPhpAsOf: usdPhpRate?.asOf,
      usdPhpProvider: usdPhpRate?.provider,
      projects: projects.slice(0, 12),
      recentDescriptions: billableItems
        .slice(-5)
        .map((item) => item.description.slice(0, 160)),
      checkIn: {
        dateLabel: checkInDraft.dateLabel || undefined,
        weekKey: checkInDraft.weekKey || undefined,
        projects: checkInDraft.projects || undefined,
        currentlyWorking: checkInDraft.currentlyWorking,
        completedCount: completedPreview.length,
        completedPreview,
        pending: checkInDraft.pending || undefined,
        hasBlocker: Boolean(checkInDraft.blocker.issue.trim()),
        eta: checkInDraft.eta || undefined,
      },
      checkInWorklogPreview: billableItems.slice(-8).map((item) => ({
        time: item.time,
        project: item.project,
        description: item.description.slice(0, 160),
        qtyHours: item.qtyHours,
      })),
    }
  }, [
    step,
    worklogFiles.length,
    lineItems,
    parseErrors.length,
    parseWarnings.length,
    usedAiParse,
    form,
    usdPhpRate,
    historyEntries,
    checkInDraft,
  ])

  useEffect(() => {
    if (!open) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    inputRef.current?.focus()
  }, [open, messages, isSending, pendingCheckIn])

  const runCheckInDraftFlow = async (nextMessages: LoggerChatMessage[]) => {
    try {
      const { proposed, notes } = await proposeCheckInDraftOnly({
        displayName: displayName || undefined,
      })
      if (!proposed) {
        const detail = notes[0] || 'No worklog markdown available yet.'
        setMessages([
          ...nextMessages,
          {
            role: 'assistant',
            content: `I couldn't draft a check-in yet. ${detail}\n\nLoad worklogs on Generate (or save project paths / OneDrive), then ask me again — or use Prefill from worklogs / Draft with Logger on the Check-in page.`,
          },
        ])
        return
      }

      setPendingCheckIn(proposed)
      const preview = [
        proposed.currentlyWorking.client
          ? `Current: ${proposed.currentlyWorking.client} — ${proposed.currentlyWorking.task}`
          : null,
        proposed.completed.length
          ? `Completed (${proposed.completed.length}): ${proposed.completed
              .slice(0, 3)
              .map((item) => item.client)
              .join(', ')}${proposed.completed.length > 3 ? '…' : ''}`
          : null,
        proposed.eta ? `ETA: ${proposed.eta}` : null,
        ...(proposed.notes ?? []).slice(0, 2),
      ]
        .filter(Boolean)
        .join('\n')

      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: `I drafted a check-in from your worklogs. Review the Apply card below — nothing is written until you confirm.\n\n${preview}`,
        },
      ])
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Check-in draft failed.'
      toast.error(message)
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: `I hit a snag drafting the check-in: ${message}`,
        },
      ])
    }
  }

  const sendMessage = async (raw: string) => {
    const content = raw.trim()
    if (!content || isSending) return

    const nextMessages = [...messages, { role: 'user' as const, content }]
    setMessages(nextMessages)
    setInput('')
    setIsSending(true)
    setPendingCheckIn(null)

    try {
      if (DRAFT_CHECKIN_RE.test(content)) {
        await runCheckInDraftFlow(nextMessages)
        return
      }

      const result = await requestLoggerChat({
        messages: nextMessages,
        context,
      })
      setMessages([...nextMessages, { role: 'assistant', content: result.reply }])
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Logger could not reply right now.'
      toast.error(message)
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: `I hit a snag: ${message}`,
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  const handleApplyCheckIn = () => {
    if (!pendingCheckIn) return
    applyProposedCheckInDraft(pendingCheckIn, displayName || undefined)
    setPendingCheckIn(null)
    toast.success('Check-in draft applied. Open Check-in to review and copy for Slack.')
    setMessages((current) => [
      ...current,
      {
        role: 'assistant',
        content:
          'Applied. Open the Check-in tab to review fields, then Save & copy for Slack.',
      },
    ])
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void sendMessage(input)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage(input)
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Close Logger chat' : 'Open Logger chat'}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-nlog-navy text-white shadow-lg transition hover:bg-nlog-navy-light',
          'bottom-[max(1rem,env(safe-area-inset-bottom))]',
        )}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {open && (
        <section
          aria-label="Logger chatbot"
          className={cn(
            'fixed right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-nlog-border bg-white shadow-xl',
            'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]',
            'max-h-[min(34rem,calc(100dvh-7rem))]',
          )}
        >
          <header className="flex items-center justify-between gap-3 border-b border-nlog-border bg-nlog-navy px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 shrink-0" />
                Logger
              </p>
              <p className="text-xs text-white/75">
                NLog assistant · Groq · live USD/PHP
              </p>
            </div>
            <button
              type="button"
              aria-label="Close Logger"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={cn(
                  'max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                  message.role === 'assistant'
                    ? 'bg-slate-100 text-slate-800'
                    : 'ml-auto bg-nlog-navy text-white',
                )}
              >
                {message.content}
              </div>
            ))}
            {isSending && <LoggerThinkingLoader />}
            {pendingCheckIn && !isSending && (
              <div className="rounded-xl border border-nlog-border bg-white p-3 text-sm shadow-sm">
                <p className="font-medium text-nlog-navy">Proposed check-in</p>
                <p className="mt-1 text-xs text-nlog-slate">
                  {pendingCheckIn.projects || 'Projects from worklogs'}
                </p>
                <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto text-xs text-nlog-navy">
                  {pendingCheckIn.completed.slice(0, 6).map((item, index) => (
                    <li key={`${item.client}-${index}`}>
                      <p className="font-medium">
                        Client {index + 1} - {item.client}
                      </p>
                      <p className="text-nlog-slate">Task:</p>
                      {item.task
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <Button type="button" size="sm" onClick={handleApplyCheckIn}>
                    Apply to Check-in
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPendingCheckIn(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
          </div>

          {messages.length <= 1 && !isSending && (
            <div className="flex flex-wrap gap-2 border-t border-nlog-border px-3 py-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={isSending}
                  onClick={() => void sendMessage(suggestion)}
                  className="rounded-full border border-nlog-border bg-slate-50 px-2.5 py-1 text-left text-xs text-nlog-navy hover:bg-slate-100"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 border-t border-nlog-border p-3"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Ask Logger about worklogs or invoices…"
              className="min-h-[2.75rem] max-h-28 flex-1 resize-none rounded-lg border border-nlog-border px-3 py-2 text-sm outline-none ring-nlog-accent focus-visible:ring-2"
              aria-label="Message Logger"
              disabled={isSending}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isSending || !input.trim()}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </section>
      )}
    </>
  )
}
