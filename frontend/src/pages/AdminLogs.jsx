/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Created the admin audit log page, per instructions.md Stage 26e: a read-only,
 *        filterable, sortable, paginated table of GET /admin/audit-logs, reached from the new
 *        "Audit log" nav link. Filters (actor/target substring, action, reasonCode, from/to)
 *        reset the page to 1 and AND together; a deleted actor/target shows "user deleted".
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Replaced native dropdowns with the requested searchable control.
 * Author review: Congchen
 */

import SearchableSelect from '../components/SearchableSelect'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { Pager } from '../components/ApiNotice'
import { useToast } from '../components/Toast'
import { useApi } from '../api/useApi'
import { listAuditLogs } from '../api/auditLog'
import { describeError } from '../api/errorMessages'
import { ACTION_LABELS, ALL_REASON_CODES, AUDIT_ACTIONS } from '../constants/auditReasons'

const inputClass =
  'h-11 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink md:h-10 md:text-sm'
const selectClass =
  'h-11 w-full rounded-btn border border-line bg-surface px-3 text-sm text-ink md:h-10'

function humanize(code) {
  return code
    .split('_')
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(' ')
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

// `before`/`after` each have (at most) one changed field, e.g. { status: 'active' }; NULL for
// EMAIL_UNMASK (no state change).
function formatChange(before, after) {
  const key = Object.keys(after ?? before ?? {})[0]
  if (!key) return '—'
  return (before ? String(before[key]) : '—') + ' → ' + (after ? String(after[key]) : '—')
}

export default function AdminLogs() {
  const { showToast } = useToast()

  const [actorInput, setActorInput] = useState('')
  const [targetInput, setTargetInput] = useState('')
  const [actor, setActor] = useState('')
  const [target, setTarget] = useState('')
  const [actions, setActions] = useState([])
  const [reasonCode, setReasonCode] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => setActor(actorInput.trim()), 300)
    return () => clearTimeout(t)
  }, [actorInput])
  useEffect(() => {
    const t = setTimeout(() => setTarget(targetInput.trim()), 300)
    return () => clearTimeout(t)
  }, [targetInput])
  useEffect(() => {
    setPage(1)
  }, [actor, target, actions, reasonCode, from, to, sortDir])

  const params = useMemo(
    () => ({
      page,
      actor: actor || undefined,
      target: target || undefined,
      action: actions.length > 0 ? actions : undefined,
      reasonCode: reasonCode || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      sortDir,
    }),
    [page, actor, target, actions, reasonCode, from, to, sortDir],
  )

  const { data, error } = useApi(() => listAuditLogs(params), [params])

  // Per instructions.md Stage 26e: "Failure -> toast", unlike the other admin list pages
  // (which show an inline notice in place of the table).
  useEffect(() => {
    if (error) showToast(describeError(error).message, 'error')
  }, [error, showToast])

  const logs = data?.logs ?? []

  function toggleSort() {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
  }

  return (
    <div className="page-width page-gutter py-8 md:py-10">
      <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Audit log</h1>

      <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_160px]">
        <input
          type="search"
          value={actorInput}
          onChange={(e) => setActorInput(e.target.value)}
          placeholder="Search actor"
          aria-label="Filter by actor"
          className={inputClass}
        />
        <input
          type="search"
          value={targetInput}
          onChange={(e) => setTargetInput(e.target.value)}
          placeholder="Search target"
          aria-label="Filter by target"
          className={inputClass}
        />
        <SearchableSelect
          multiple
          aria-label="Filter by action"
          value={actions}
          onChange={(e) => setActions(Array.from(e.target.selectedOptions, (o) => o.value))}
          className={selectClass}
        >
          {AUDIT_ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </SearchableSelect>
        <SearchableSelect
          aria-label="Filter by reason code"
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value)}
          className={selectClass}
        >
          <option value="">Any reason</option>
          {ALL_REASON_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {humanize(c.code)}
            </option>
          ))}
        </SearchableSelect>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block text-sm text-ink-70">
          From
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From"
            className={inputClass + ' mt-1'}
          />
        </label>
        <label className="block text-sm text-ink-70">
          To
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To"
            className={inputClass + ' mt-1'}
          />
        </label>
      </div>

      {logs.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No audit log entries match those filters"
            body="Try clearing a filter or widening the date range."
          />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="border-b border-line text-ink-40">
                <th scope="col" className="py-2 pr-2 text-left font-medium">
                  <button type="button" onClick={toggleSort} className="flex items-center gap-1 hover:text-ink">
                    Time
                    {sortDir === 'asc' ? (
                      <ChevronUp size={14} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={14} aria-hidden="true" />
                    )}
                  </button>
                </th>
                <th scope="col" className="py-2 pr-2 text-left font-medium">Actor</th>
                <th scope="col" className="py-2 pr-2 text-left font-medium">Action</th>
                <th scope="col" className="py-2 pr-2 text-left font-medium">Target</th>
                <th scope="col" className="py-2 pr-2 text-left font-medium">Reason</th>
                <th scope="col" className="py-2 pr-2 text-left font-medium">Before → after</th>
                <th scope="col" className="py-2 pl-2 text-left font-medium">User agent</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-2 text-ink-70">{formatDateTime(log.createdAt)}</td>
                  <td className="py-2.5 pr-2 text-ink">{log.actorUsername ?? 'user deleted'}</td>
                  <td className="py-2.5 pr-2 text-ink">{ACTION_LABELS[log.action] ?? log.action}</td>
                  <td className="py-2.5 pr-2 text-ink">{log.targetUsername ?? 'user deleted'}</td>
                  <td className="py-2.5 pr-2 text-ink-70">{log.reason}</td>
                  <td className="py-2.5 pr-2 text-ink-70">{formatChange(log.before, log.after)}</td>
                  <td className="py-2.5 pl-2 text-ink-70">{log.userAgent ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager
        metadata={data ? { currPage: data.page, totalPages: data.totalPages } : null}
        onPage={setPage}
      />
    </div>
  )
}
