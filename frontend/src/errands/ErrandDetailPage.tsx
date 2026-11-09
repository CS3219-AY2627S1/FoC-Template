/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Member errand detail: state and what happens next, the actions open to the viewer's
 *        part, deadlines, supplier snapshot, items and history. Polls while credits are reserved.
 * Author review: Reviewed and approved by @mattis.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { getErrand, runErrandAction } from '../api/errandApi'
import { getCurrentUserId } from '../auth/tokenSubject'
import { TopBar } from '../components/TopBar'
import { ConfirmErrandAction } from './ConfirmErrandAction'
import { describeActionError, describeLoadError, isStaleErrandError, type ErrorCopy } from './errandErrors'
import { ErrandRequestError } from './ErrandRequestError'
import { ErrandStateBadge } from './ErrandStateBadge'
import {
  actionCopy,
  activeDeadline,
  availableActions,
  describeActor,
  describeHistoryEntry,
  formatCredits,
  formatDateTime,
  formatRelative,
  isPast,
  stateGuidance,
  viewerPart,
  type DeadlineField,
} from './presentation'
import { TERMINAL_STATES, type ErrandDetail, type MemberAction } from './types'
import { useRemoteData } from './useRemoteData'

/** How often to re-read an errand while Credit Service decides on the reservation */
export const RESERVATION_POLL_MS = 2000

interface DetailLocationState {
  readonly from?: string
}

export function ErrandDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const location = useLocation()
  const fromState = (location.state as DetailLocationState | null)?.from
  const backPath = fromState?.startsWith('/errands') ? fromState : '/errands/mine'
  const { data: errand, error, loading, reload } = useRemoteData(`errand:${id}`, (signal) => getErrand(id, signal))
  const viewerId = getCurrentUserId()

  const pending = errand?.state === 'PENDING_RESERVATION'
  useEffect(() => {
    if (!pending) return
    const timer = window.setInterval(reload, RESERVATION_POLL_MS)
    return () => window.clearInterval(timer)
  }, [pending, reload])

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Link
          to={backPath}
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-navy-700 hover:bg-navy-100"
        >
          ← {backPath.startsWith('/errands/mine') ? 'Back to My errands' : 'Back to Open errands'}
        </Link>

        {errand === null && error === null && <DetailSkeleton />}
        {errand === null && error !== null && (
          <div className="mt-4">
            <ErrandRequestError error={error} onRetry={reload} />
          </div>
        )}
        {errand !== null && (
          <ErrandDetailView
            // Remount on a new errand so dialog and messages do not carry over
            key={errand.id}
            errand={errand}
            viewerId={viewerId}
            refreshing={loading}
            refreshError={error}
            onReload={reload}
          />
        )}
      </main>
    </>
  )
}

interface ErrandDetailViewProps {
  readonly errand: ErrandDetail
  readonly viewerId: string | null
  readonly refreshing: boolean
  readonly refreshError: unknown
  readonly onReload: () => void
}

function ErrandDetailView({ errand, viewerId, refreshing, refreshError, onReload }: ErrandDetailViewProps) {
  const part = viewerPart(errand, viewerId)
  const actions = availableActions(errand.state, part)
  const [confirming, setConfirming] = useState<MemberAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ readonly kind: 'success' | 'error'; readonly copy: ErrorCopy } | null>(null)

  async function run(action: MemberAction, reason: string | undefined) {
    setBusy(true)
    setFeedback(null)
    try {
      await runErrandAction(errand.id, action, reason)
      setFeedback({ kind: 'success', copy: { title: actionCopy(action, errand).success, message: '' } })
      onReload()
    } catch (actionError) {
      setFeedback({ kind: 'error', copy: describeActionError(actionError) })
      // The errand changed under us (another courier, a deadline, the sweeper): show its real state
      if (isStaleErrandError(actionError)) onReload()
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  return (
    <article className="mt-4 space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <ErrandStateBadge state={errand.state} />
          {part !== 'visitor' && (
            <span className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-800">
              {part === 'requester' ? 'You requested this' : "You're the courier"}
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-500">Errand from</p>
            <h1 className="break-words text-3xl font-bold tracking-tight text-navy-900">{errand.supplierName}</h1>
          </div>
          <p className="shrink-0 text-2xl font-bold text-accent-600">{formatCredits(errand.creditAmount)}</p>
        </div>
        <p className="mt-4 rounded-xl bg-navy-50 px-4 py-3 text-sm leading-6 text-navy-900" aria-live="polite">
          {stateGuidance(errand, part)}
        </p>

        {feedback && (
          <div
            role={feedback.kind === 'error' ? 'alert' : 'status'}
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              feedback.kind === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            <p className="font-semibold">{feedback.copy.title}</p>
            {feedback.copy.message && <p className="mt-1">{feedback.copy.message}</p>}
          </div>
        )}
        {refreshError !== null && (
          <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {describeLoadError(refreshError).title}. Showing what we last loaded.
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {actions.map((action) => {
            const copy = actionCopy(action, errand)
            return (
              <button
                key={action}
                type="button"
                disabled={busy}
                onClick={() => setConfirming(action)}
                className={`min-h-11 rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50 ${buttonClass(copy.tone)}`}
              >
                {copy.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={onReload}
            disabled={refreshing}
            className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-50 sm:ml-auto"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Panel title="What to get">
            <ul className="divide-y divide-slate-100">
              {errand.items.map((item, index) => (
                <li key={index} className="flex items-start justify-between gap-4 py-2 text-sm">
                  <span className="min-w-0 break-words text-slate-800">{item.name}</span>
                  <span className="shrink-0 font-semibold text-navy-900">× {item.quantity}</span>
                </li>
              ))}
            </ul>
            {errand.notes && (
              <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes from the requester</p>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-700">{errand.notes}</p>
              </div>
            )}
          </Panel>

          <Panel title="Route">
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-semibold text-navy-900">Pick up from</dt>
                <dd className="mt-1 break-words text-slate-700">
                  {errand.supplierName} · {errand.supplierBuildingCode}
                  <span className="mt-1 block text-slate-600">{errand.supplierLocationDescription}</span>
                  <Link to={`/suppliers/${errand.supplierId}`} className="mt-1 inline-block font-semibold text-navy-700 underline">
                    Supplier details
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-navy-900">Drop off at</dt>
                <dd className="mt-1 break-words text-slate-700">{errand.dropoffLocation}</dd>
              </div>
            </dl>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Deadlines">
            <Deadlines errand={errand} />
          </Panel>
          <Panel title="People">
            <dl className="space-y-2 text-sm">
              <PersonRow term="Requester" value={part === 'requester' ? 'You' : 'Another member'} />
              <PersonRow
                term="Courier"
                value={errand.courierId === null ? 'Not assigned yet' : part === 'courier' ? 'You' : 'Another member'}
              />
            </dl>
          </Panel>
          <Panel title="History">
            <History errand={errand} viewerId={viewerId} />
          </Panel>
        </div>
      </div>

      {confirming && (
        <ConfirmErrandAction
          copy={actionCopy(confirming, errand)}
          withReason={confirming === 'reject'}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={(reason) => void run(confirming, reason)}
        />
      )}
    </article>
  )
}

const DEADLINE_ROWS: readonly { readonly field: DeadlineField; readonly label: string }[] = [
  { field: 'listingDeadline', label: 'Accepted by' },
  { field: 'pickupDeadline', label: 'Picked up by' },
  { field: 'deliveryDeadline', label: 'Delivered by' },
  { field: 'confirmDeadline', label: 'Confirmed by' },
]

function Deadlines({ errand }: { readonly errand: ErrandDetail }) {
  const current = activeDeadline(errand.state)
  return (
    <dl className="space-y-2 text-sm">
      {DEADLINE_ROWS.map(({ field, label }) => {
        const value = errand[field]
        const highlighted = field === current
        return (
          <div
            key={field}
            className={`flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg px-3 py-2 ${
              highlighted ? 'bg-accent-500/10 ring-1 ring-accent-500/40' : ''
            }`}
          >
            <dt className={`font-semibold ${highlighted ? 'text-accent-600' : 'text-navy-900'}`}>
              {label}
              {highlighted && <span className="sr-only"> (current step)</span>}
            </dt>
            <dd className="text-right text-slate-700">
              {value === null ? (
                <span className="text-slate-500">{TERMINAL_STATES.has(errand.state) ? 'Not reached' : 'Set when delivered'}</span>
              ) : (
                <>
                  {formatDateTime(value)}
                  {highlighted && (
                    <span className={`block text-xs ${isPast(value) ? 'font-semibold text-red-700' : 'text-slate-500'}`}>
                      {isPast(value) ? `passed ${formatRelative(value)}` : formatRelative(value)}
                    </span>
                  )}
                </>
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function History({ errand, viewerId }: { readonly errand: ErrandDetail; readonly viewerId: string | null }) {
  if (errand.history.length === 0) return <p className="text-sm text-slate-500">No history yet.</p>
  return (
    <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
      {errand.history.map((entry, index) => {
        const actor = describeActor(entry, viewerId, errand)
        return (
          <li key={index} className="relative text-sm">
            <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-navy-700" aria-hidden="true" />
            <p className="font-semibold text-navy-900">{describeHistoryEntry(entry)}</p>
            <p className="text-xs text-slate-500">
              {formatDateTime(entry.at)}
              {actor && ` · ${actor}`}
            </p>
            {entry.reason && entry.action !== 'reservation_rejected' && (
              <p className="mt-1 break-words text-slate-600">“{entry.reason}”</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Panel({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-bold text-navy-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function PersonRow({ term, value }: { readonly term: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="font-semibold text-navy-900">{term}</dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  )
}

function buttonClass(tone: 'primary' | 'danger' | 'neutral'): string {
  if (tone === 'danger') return 'border border-red-300 bg-white text-red-700 hover:bg-red-50'
  if (tone === 'neutral') return 'border border-slate-300 bg-white text-navy-800 hover:bg-navy-50'
  return 'bg-navy-800 text-white hover:bg-navy-700'
}

function DetailSkeleton() {
  return (
    <div className="mt-4 animate-pulse space-y-5" role="status">
      <span className="sr-only">Loading errand…</span>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-8">
        <div className="h-5 w-24 rounded bg-slate-200" />
        <div className="h-9 w-2/3 rounded bg-slate-200" />
        <div className="h-12 rounded bg-slate-200" />
      </div>
      <div className="h-40 rounded-2xl border border-slate-200 bg-white" />
    </div>
  )
}
