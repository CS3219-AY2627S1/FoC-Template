/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: One account review on one page (author's decision R2): why it was opened, the
 *        evidence (saved or current counts, the account's errands from the Order Service,
 *        login attempts, audit history), then the decision or cancel form, or the result.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { cancelReview, decideReview, getReview, listAccountErrands } from '../api/adminApi'
import { useToast } from '../components/toast/toastContext'
import { STATE_LABELS, formatCredits } from '../errands/presentation'
import type { Errand, ErrandPage } from '../errands/types'
import { AdminShell } from './AdminShell'
import { AuditEntriesList } from './AuditEntriesList'
import { buttonClass, errorText } from './errors'
import { OUTCOME_CHOICES, REVIEW_STATUS_LABELS, REVIEW_STATUS_STYLES, sgTime, STATUS_LABELS, STATUS_STYLES } from './format'
import { LoginEventsList } from './LoginEventsList'
import { ReasonDialog } from './ReasonDialog'
import { Badge, ErrorBox } from './shared'
import { REASON_MAX, type AccountReviewDetail, type ReviewEvidence, type ReviewOutcome } from './types'

const SECTION_SIZE = 10
const ERRANDS_SHOWN = 20

export function ReviewPage() {
  return <AdminShell><ReviewContent /></AdminShell>
}

function ReviewContent() {
  const { id = '' } = useParams()
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{ key: string; review: AccountReviewDetail | null; error: unknown }>({ key: '', review: null, error: null })
  const key = `${id}|${version}`

  useEffect(() => {
    const controller = new AbortController()
    getReview(id, controller.signal).then(
      (review) => { if (!controller.signal.aborted) setState({ key, review, error: null }) },
      (error: unknown) => { if (!controller.signal.aborted) setState({ key, review: null, error }) },
    )
    return () => controller.abort()
  }, [id, key])

  const review = state.review?.id === id ? state.review : null
  if (!review) {
    return <>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-navy-900">Review #{id}</h1>
      <div className="mt-6">
        {state.key !== key
          ? <p role="status" className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading review…</p>
          : <ErrorBox title="Couldn’t load this review" error={state.error} onRetry={() => setVersion((n) => n + 1)} />}
      </div>
    </>
  }

  const evidence = review.status === 'OPEN' ? review.currentEvidence : review.evidence
  return <>
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <h1 className="text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">Review #{review.id}</h1>
      <Badge className={REVIEW_STATUS_STYLES[review.status]}>{REVIEW_STATUS_LABELS[review.status]}</Badge>
    </div>
    <p className="mt-2 text-sm"><Link to="/admin/reviews" className="font-semibold text-navy-800 underline-offset-2 hover:underline">← All reviews</Link></p>

    <section aria-label="Review summary" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Account</span>
        <Link to={`/admin/accounts/${review.account.id}`} className="font-bold text-navy-900 underline-offset-2 hover:underline">@{review.account.username}</Link>
        <span className="text-slate-500">({review.account.displayName})</span>
        <Badge className={STATUS_STYLES[review.account.status]}>Now {STATUS_LABELS[review.account.status].toLowerCase()}</Badge>
        {review.account.status !== review.statusAtOpen && <span className="text-xs text-slate-500">(was {STATUS_LABELS[review.statusAtOpen].toLowerCase()} when opened)</span>}
      </div>
      <p className="mt-3 text-xs text-slate-500">Opened by @{review.openedBy.username} · {sgTime(review.openedAt)}</p>
      <h2 className="mt-2 text-sm font-semibold text-navy-900">Why it was opened</h2>
      <p className="mt-1 break-words text-sm text-slate-700">{review.openReason}</p>
    </section>

    <section aria-labelledby="evidence-heading" className="mt-8">
      <h2 id="evidence-heading" className="text-2xl font-bold text-navy-900">Evidence</h2>
      {evidence && <EvidenceCounts evidence={evidence} saved={review.status === 'DECIDED'} />}
      {review.status === 'CANCELLED' && <p className="mt-3 text-sm text-slate-600">No evidence is saved for a cancelled review.</p>}

      <h3 className="mb-3 mt-6 text-lg font-bold text-navy-900">Errands (from the Order Service)</h3>
      <ErrandsEvidence accountId={review.account.id} />

      <h3 className="mb-3 mt-6 text-lg font-bold text-navy-900">Login attempts</h3>
      <LoginEventsList query={{ accountId: review.account.id }} pageSize={SECTION_SIZE} showAccount={false} reloadKey={version} />

      <h3 className="mb-3 mt-6 text-lg font-bold text-navy-900">Audit history</h3>
      <AuditEntriesList query={{ targetId: review.account.id }} pageSize={SECTION_SIZE} reloadKey={version} />
    </section>

    <section aria-labelledby="decision-heading" className="mt-8">
      <h2 id="decision-heading" className="mb-3 text-2xl font-bold text-navy-900">Decision</h2>
      {review.status === 'OPEN'
        ? <DecisionForm review={review} onDone={() => setVersion((n) => n + 1)} />
        : <ClosedResult review={review} />}
    </section>
  </>
}

function EvidenceCounts({ evidence, saved }: { evidence: ReviewEvidence; saved: boolean }) {
  const items: [string, number][] = [
    ['Failed logins, last 7 days', evidence.failedLoginsLast7Days],
    ['Blocked logins, last 7 days', evidence.blockedLoginsLast7Days],
    ['Failed logins, last 90 days', evidence.failedLoginsLast90Days],
    ['Blocked logins, last 90 days', evidence.blockedLoginsLast90Days],
    ['Audit entries, last 90 days', evidence.auditEntriesLast90Days],
  ]
  return <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-xs text-slate-500">
      {saved ? `Saved with the decision, ${sgTime(evidence.capturedAt)}. These stay after the login records are deleted (90 days).`
        : 'As of now; these numbers are saved when the review is decided.'}
    </p>
    <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
      {items.map(([label, value]) => (
        <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="text-2xl font-bold tabular-nums text-navy-900">{value}</dd></div>
      ))}
    </dl>
  </div>
}

// Author's decision B7: the browser asks the Order Service directly; nothing here is saved
function ErrandsEvidence({ accountId }: { accountId: string }) {
  const [state, setState] = useState<{ id: string; asRequester: ErrandPage | null; asCourier: ErrandPage | null; error: unknown }>({ id: '', asRequester: null, asCourier: null, error: null })
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      listAccountErrands(accountId, 'requester', ERRANDS_SHOWN, controller.signal),
      listAccountErrands(accountId, 'courier', ERRANDS_SHOWN, controller.signal),
    ]).then(
      ([asRequester, asCourier]) => { if (!controller.signal.aborted) setState({ id: accountId, asRequester, asCourier, error: null }) },
      (error: unknown) => { if (!controller.signal.aborted) setState({ id: accountId, asRequester: null, asCourier: null, error }) },
    )
    return () => controller.abort()
  }, [accountId])

  if (state.id !== accountId) return <p role="status" className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading errands…</p>
  if (state.error !== null) {
    return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-slate-700">
      Couldn’t load errands from the Order Service ({errorText(state.error)}). The rest of the evidence is unaffected.
    </div>
  }
  return <div className="grid gap-4 lg:grid-cols-2">
    <ErrandColumn title="As requester" page={state.asRequester!} />
    <ErrandColumn title="As courier" page={state.asCourier!} />
  </div>
}

function ErrandColumn({ title, page }: { title: string; page: ErrandPage }) {
  const disputed = page.items.filter((e) => e.state === 'DISPUTED').length
  return <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-sm font-semibold text-navy-900">
      {title}: {page.totalItems} {page.totalItems === 1 ? 'errand' : 'errands'}
      {disputed > 0 && <span className="ml-2 text-red-700">· {disputed} disputed</span>}
    </p>
    {page.items.length === 0
      ? <p className="mt-2 text-sm text-slate-500">None.</p>
      : <ul className="mt-2 divide-y divide-slate-100 text-sm">{page.items.map((e) => <ErrandLine key={e.id} errand={e} />)}</ul>}
    {page.totalItems > page.items.length && <p className="mt-2 text-xs text-slate-500">Newest {page.items.length} shown.</p>}
  </div>
}

function ErrandLine({ errand }: { errand: Errand }) {
  return <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
    <Badge className={errand.state === 'DISPUTED' ? 'bg-red-50 text-red-800' : 'bg-slate-100 text-slate-700'}>{STATE_LABELS[errand.state] ?? errand.state}</Badge>
    <span className="min-w-0 truncate text-navy-900">{errand.supplierName}</span>
    <span className="text-slate-500">{formatCredits(errand.creditAmount)}</span>
    <time dateTime={errand.createdAt} className="ml-auto text-xs tabular-nums text-slate-500">{sgTime(errand.createdAt)}</time>
  </li>
}

function DecisionForm({ review, onDone }: { review: AccountReviewDetail; onDone: () => void }) {
  const { showToast } = useToast()
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null)
  const [reasoning, setReasoning] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const trimmed = reasoning.trim()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!outcome) { setError('Choose an outcome.'); return }
    if (trimmed.length === 0) { setError('Please write your reasoning.'); return }
    if (trimmed.length > REASON_MAX) { setError(`The reasoning must be at most ${REASON_MAX} characters.`); return }
    setBusy(true)
    setError(null)
    try {
      await decideReview(review.id, outcome, trimmed)
      showToast(`Review #${review.id} decided: ${OUTCOME_CHOICES[outcome].label}.`, 'success')
      onDone()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return <>
    <form noValidate onSubmit={submit} aria-label="Record a decision" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <fieldset>
        <legend className="text-sm font-semibold text-navy-900">Outcome</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {review.allowedOutcomes.map((o) => (
            <label key={o} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${outcome === o ? 'border-navy-800 bg-navy-50' : 'border-slate-200'}`}>
              <input type="radio" name="outcome" value={o} checked={outcome === o} disabled={busy} onChange={() => { setOutcome(o); setError(null) }} className="mt-1" />
              <span><span className="block font-semibold text-navy-900">{OUTCOME_CHOICES[o].label}</span><span className="text-slate-600">{OUTCOME_CHOICES[o].effect}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-4 block text-sm font-medium text-navy-900">
        Reasoning
        <textarea value={reasoning} rows={4} disabled={busy} onChange={(e) => { setReasoning(e.target.value); setError(null) }}
          aria-describedby="reasoning-help" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-navy-900" />
      </label>
      <p id="reasoning-help" className="mt-1 text-xs text-slate-500">
        Include what you saw in the errands. A suspend or reinstate uses this text as its audit reason. {trimmed.length}/{REASON_MAX}
      </p>
      <p role={error ? 'alert' : undefined} className="mt-2 text-sm text-red-700">{error}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50">
          {busy ? 'Saving…' : 'Record decision'}
        </button>
        <button type="button" disabled={busy} className={buttonClass} onClick={() => setCancelling(true)}>Cancel review</button>
      </div>
    </form>
    {cancelling && <ReasonDialog
      title={`Cancel review #${review.id}?`}
      description="Use this for a review opened by mistake. Nothing changes on the account, and no decision is recorded."
      confirmLabel="Cancel review"
      tone="neutral"
      reasonRequired
      onCancel={() => setCancelling(false)}
      onConfirm={async (reason) => {
        await cancelReview(review.id, reason)
        showToast(`Review #${review.id} was cancelled.`, 'success')
        setCancelling(false)
        onDone()
      }}
    />}
  </>
}

function ClosedResult({ review }: { review: AccountReviewDetail }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-sm font-semibold text-navy-900">
      {review.status === 'CANCELLED' ? 'Cancelled' : `Decided: ${OUTCOME_CHOICES[review.outcome!].label}`}
      {review.closedBy && review.closedAt && <span className="ml-2 font-normal text-slate-500">by @{review.closedBy.username} · {sgTime(review.closedAt)}</span>}
    </p>
    {review.outcome && <p className="mt-1 text-sm text-slate-600">{OUTCOME_CHOICES[review.outcome].effect}</p>}
    <h3 className="mt-3 text-sm font-semibold text-navy-900">{review.status === 'CANCELLED' ? 'Why it was cancelled' : 'Reasoning'}</h3>
    <p className="mt-1 break-words text-sm text-slate-700">{review.reasoning}</p>
  </div>
}
