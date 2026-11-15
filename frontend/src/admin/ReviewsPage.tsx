/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Reviews tab (N2H1b): every account review, newest first, with a status filter kept
 *        in the URL and "load more".
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { Link, useSearchParams } from 'react-router'
import { listReviews } from '../api/adminApi'
import { AdminShell } from './AdminShell'
import { buttonClass, inputClass } from './errors'
import { OUTCOME_CHOICES, REVIEW_STATUS_LABELS, REVIEW_STATUS_STYLES, sgTime } from './format'
import { Badge, ErrorBox, LoadMore } from './shared'
import { REVIEW_STATUSES, type AccountReview, type ReviewStatus } from './types'
import { useCursorList } from './useCursorList'

export function ReviewsPage() {
  return <AdminShell title="Reviews" intro="Account reviews, newest first. Open one from an account's page; decide it on the review's own page.">
    <ReviewsContent />
  </AdminShell>
}

function ReviewsContent() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('status')
  const status = REVIEW_STATUSES.includes(raw as ReviewStatus) ? (raw as ReviewStatus) : undefined
  const list = useCursorList<AccountReview>(status ?? 'all', (cursor, signal) =>
    listReviews({ status }, cursor, 50, signal).then((page) => ({ items: page.reviews, nextCursor: page.nextCursor })))

  return <>
    <form aria-label="Filter reviews" onSubmit={(e) => e.preventDefault()} className="mt-6 flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <label className="min-w-48 text-sm font-medium text-navy-900">Status
        <select value={status ?? ''} onChange={(e) => setParams(e.target.value ? new URLSearchParams({ status: e.target.value }) : new URLSearchParams())} className={inputClass}>
          <option value="">Any status</option>
          {REVIEW_STATUSES.map((s) => <option key={s} value={s}>{REVIEW_STATUS_LABELS[s]}</option>)}
        </select>
      </label>
      <button type="button" className={buttonClass} onClick={() => setParams(new URLSearchParams())}>Clear filter</button>
    </form>
    <section className="mt-6" aria-label="Reviews list" aria-busy={list.loading}>
      {list.loading && <p role="status" className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading reviews…</p>}
      {!list.loading && list.error !== null && list.items.length === 0 && <ErrorBox title="Couldn’t load reviews" error={list.error} />}
      {!list.loading && list.error === null && list.items.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">No reviews match.</p>
      )}
      {list.items.length > 0 && <>
        <ul className="space-y-3">{list.items.map((review) => <ReviewRow key={review.id} review={review} />)}</ul>
        <LoadMore hasMore={list.hasMore} loadingMore={list.loadingMore} error={list.error} onLoadMore={list.loadMore} noun="reviews" />
      </>}
    </section>
  </>
}

function ReviewRow({ review }: { review: AccountReview }) {
  return <li className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Link to={`/admin/reviews/${review.id}`} className="font-bold text-navy-900 underline-offset-2 hover:underline">
          Review #{review.id}: @{review.account.username}
        </Link>
        <p className="mt-1 break-words text-sm text-slate-600">{review.openReason}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge className={REVIEW_STATUS_STYLES[review.status]}>{REVIEW_STATUS_LABELS[review.status]}</Badge>
        {review.outcome && <Badge className="bg-slate-100 text-slate-700">{OUTCOME_CHOICES[review.outcome].label}</Badge>}
      </div>
    </div>
    <p className="mt-2 text-xs text-slate-500">
      Opened by @{review.openedBy.username} · {sgTime(review.openedAt)}
      {review.closedAt && review.closedBy && <> · {review.status === 'CANCELLED' ? 'Cancelled' : 'Decided'} by @{review.closedBy.username} · {sgTime(review.closedAt)}</>}
    </p>
  </li>
}
