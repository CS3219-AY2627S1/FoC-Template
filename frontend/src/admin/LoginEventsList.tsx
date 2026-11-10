/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Login-attempt list shared by the Login activity page and the account page; IP hidden
 *        and browser shown as a short summary, as the author decided.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { Link } from 'react-router'
import { listLoginEvents } from '../api/adminApi'
import { browserSummary, OUTCOME_LABELS, OUTCOME_STYLES, REASON_LABELS, sgTime } from './format'
import { Badge, ErrorBox, LoadMore } from './shared'
import type { LoginEvent, LoginEventQuery } from './types'
import { useCursorList } from './useCursorList'

export function LoginEventsList({ query, pageSize, showAccount, reloadKey = 0 }: {
  query: LoginEventQuery
  pageSize: number
  /** The account page leaves it out: every row is the same account */
  showAccount: boolean
  reloadKey?: number
}) {
  const key = `${query.accountId ?? ''}|${query.outcome ?? ''}|${query.reason ?? ''}|${pageSize}|${reloadKey}`
  const list = useCursorList<LoginEvent>(key, (cursor, signal) =>
    listLoginEvents(query, cursor, pageSize, signal).then((page) => ({ items: page.events, nextCursor: page.nextCursor })))

  if (list.loading) return <p role="status" className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading login attempts…</p>
  if (list.error !== null && list.items.length === 0) return <ErrorBox title="Couldn’t load login attempts" error={list.error} />
  if (list.items.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">No login attempts match.</p>
  }
  return <>
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Login attempts">
      {list.items.map((event) => (
        <li key={event.id} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
          <time dateTime={event.occurredAt} className="w-44 shrink-0 tabular-nums text-slate-600">{sgTime(event.occurredAt)}</time>
          <Badge className={OUTCOME_STYLES[event.outcome]}>{OUTCOME_LABELS[event.outcome]}</Badge>
          {event.reason && <span className="text-slate-700">{REASON_LABELS[event.reason] ?? event.reason}</span>}
          {showAccount && (event.account
            ? <Link to={`/admin/accounts/${event.account.id}`} className="font-semibold text-navy-800 underline-offset-2 hover:underline">@{event.account.username ?? event.account.id}</Link>
            : <span className="italic text-slate-500">Unknown username</span>)}
          {/* IP not shown yet (author): behind nginx it is nginx's own address until the client-IP handling is settled */}
          <span className="ml-auto min-w-0 truncate text-slate-500" title={event.userAgent ?? undefined}>{browserSummary(event.userAgent)}</span>
        </li>
      ))}
    </ul>
    <LoadMore hasMore={list.hasMore} loadingMore={list.loadingMore} error={list.error} onLoadMore={list.loadMore} noun="attempts" />
  </>
}
