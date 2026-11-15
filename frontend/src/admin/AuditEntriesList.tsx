/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Audit-entry list shared by the Audit log page and the account page, showing each
 *        entry's shortened hash and its link to the entry before (the author's decision).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { Link } from 'react-router'
import { listAudit } from '../api/adminApi'
import { ACTION_LABELS, shortHash, sgTime } from './format'
import { ErrorBox, LoadMore } from './shared'
import type { AuditEntry, AuditQuery } from './types'
import { useCursorList } from './useCursorList'

export function AuditEntriesList({ query, pageSize, reloadKey = 0 }: { query: AuditQuery; pageSize: number; reloadKey?: number }) {
  const key = `${query.targetId ?? ''}|${pageSize}|${reloadKey}`
  const list = useCursorList<AuditEntry>(key, (cursor, signal) =>
    listAudit(query, cursor, pageSize, signal).then((page) => ({ items: page.entries, nextCursor: page.nextCursor })))

  if (list.loading) return <p role="status" className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading audit entries…</p>
  if (list.error !== null && list.items.length === 0) return <ErrorBox title="Couldn’t load the audit log" error={list.error} />
  if (list.items.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">No audit entries yet.</p>
  }
  return <>
    <ol className="space-y-3" aria-label="Audit entries">
      {list.items.map((entry) => <AuditEntryCard key={entry.id} entry={entry} />)}
    </ol>
    <LoadMore hasMore={list.hasMore} loadingMore={list.loadingMore} error={list.error} onLoadMore={list.loadMore} noun="entries" />
  </>
}

function AuditEntryCard({ entry }: { entry: AuditEntry }) {
  const actor = entry.actor.type === 'SYSTEM' ? 'System' : `@${entry.actor.username ?? entry.actor.id}`
  return <li className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-bold text-navy-900">
        <span className="mr-2 text-sm font-semibold text-slate-400">#{entry.id}</span>{ACTION_LABELS[entry.action] ?? entry.action}
      </h3>
      <time dateTime={entry.occurredAt} className="text-sm tabular-nums text-slate-500">{sgTime(entry.occurredAt)}</time>
    </div>
    <p className="mt-2 text-sm text-slate-700">
      {actor} → <Link to={`/admin/accounts/${entry.target.id}`} className="font-semibold text-navy-800 underline-offset-2 hover:underline">@{entry.target.username ?? entry.target.id}</Link>
      {': '}
      {entry.previousValue !== null && <><span className="font-mono text-xs">{entry.previousValue}</span> → </>}
      <span className="font-mono text-xs">{entry.newValue}</span>
    </p>
    {entry.reason && <p className="mt-1 break-words text-sm text-slate-600">Reason: {entry.reason}</p>}
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-2 font-mono text-xs text-slate-500">
      <div><dt className="inline font-sans font-medium">Hash </dt><dd className="inline" title={entry.hash}>{shortHash(entry.hash)}</dd></div>
      <div><dt className="inline font-sans font-medium">Links to previous </dt><dd className="inline" title={entry.previousHash}>{shortHash(entry.previousHash)}</dd></div>
    </dl>
  </li>
}
