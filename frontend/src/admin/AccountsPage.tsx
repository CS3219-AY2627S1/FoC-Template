/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Admin accounts list: search (username, email, display name), status and role
 *        filters kept in the URL, newest first with "load more" (author's decisions).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { listAccounts } from '../api/adminApi'
import { AdminShell } from './AdminShell'
import { ROLE_LABELS, sgDate, sgTime, STATUS_LABELS, STATUS_STYLES } from './format'
import { buttonClass, inputClass } from './errors'
import { Badge, ErrorBox, LoadMore } from './shared'
import { ACCOUNT_ROLES, ACCOUNT_STATUSES, type AccountQuery, type AccountRole, type AccountStatus, type AdminAccount } from './types'
import { useCursorList } from './useCursorList'

const PAGE_SIZE = 50

function readQuery(params: URLSearchParams): AccountQuery {
  const status = params.get('status')
  const role = params.get('role')
  return {
    search: params.get('search') ?? undefined,
    status: ACCOUNT_STATUSES.includes(status as AccountStatus) ? (status as AccountStatus) : undefined,
    role: ACCOUNT_ROLES.includes(role as AccountRole) ? (role as AccountRole) : undefined,
  }
}

export function AccountsPage() {
  return <AdminShell title="Accounts" intro="Every account, newest first. Open one to see its logins and audit history, or to suspend, restore or change its role.">
    <AccountsContent />
  </AdminShell>
}

function AccountsContent() {
  const [params, setParams] = useSearchParams()
  const query = readQuery(params)
  const [retry, setRetry] = useState(0)
  const key = `${query.search ?? ''}|${query.status ?? ''}|${query.role ?? ''}|${retry}`
  const list = useCursorList<AdminAccount>(key, (cursor, signal) =>
    listAccounts(query, cursor, PAGE_SIZE, signal).then((page) => ({ items: page.accounts, nextCursor: page.nextCursor })))

  return <>
    <AccountFilters key={params.toString()} query={query} onApply={(next) => {
      const p = new URLSearchParams()
      if (next.search) p.set('search', next.search)
      if (next.status) p.set('status', next.status)
      if (next.role) p.set('role', next.role)
      setParams(p)
    }} />
    <section className="mt-6" aria-label="Accounts" aria-busy={list.loading}>
      {list.loading && <p role="status" className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading accounts…</p>}
      {!list.loading && list.error !== null && list.items.length === 0 && <ErrorBox title="Couldn’t load accounts" error={list.error} onRetry={() => setRetry((n) => n + 1)} />}
      {!list.loading && list.error === null && list.items.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">No accounts match.</p>
      )}
      {list.items.length > 0 && <>
        <p className="mb-3 text-sm text-slate-500">Times shown in Singapore time</p>
        <ul className="space-y-3">{list.items.map((account) => <AccountRow key={account.id} account={account} />)}</ul>
        <LoadMore hasMore={list.hasMore} loadingMore={list.loadingMore} error={list.error} onLoadMore={list.loadMore} noun="accounts" />
      </>}
    </section>
  </>
}

function AccountFilters({ query, onApply }: { query: AccountQuery; onApply: (q: AccountQuery) => void }) {
  const [search, setSearch] = useState(query.search ?? '')
  const [status, setStatus] = useState<string>(query.status ?? '')
  const [role, setRole] = useState<string>(query.role ?? '')
  function submit(event: FormEvent) {
    event.preventDefault()
    onApply({ search: search.trim() || undefined, status: (status || undefined) as AccountStatus | undefined, role: (role || undefined) as AccountRole | undefined })
  }
  return <form role="search" aria-label="Find accounts" onSubmit={submit} className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
      <label className="min-w-0 text-sm font-medium text-navy-900">Search
        <input type="search" value={search} maxLength={100} placeholder="Username, email or display name" onChange={(e) => setSearch(e.target.value)} className={inputClass} />
      </label>
      <label className="min-w-0 text-sm font-medium text-navy-900">Status
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
          <option value="">Any status</option>
          {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-sm font-medium text-navy-900">Role
        <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
          <option value="">Any role</option>
          {ACCOUNT_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" className="min-h-11 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">Search</button>
        <button type="button" className={buttonClass} onClick={() => { setSearch(''); setStatus(''); setRole(''); onApply({}) }}>Clear</button>
      </div>
    </div>
  </form>
}

function AccountRow({ account }: { account: AdminAccount }) {
  return <li className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Link to={`/admin/accounts/${account.id}`} className="font-bold text-navy-900 underline-offset-2 hover:underline">{account.displayName}</Link>
        <p className="truncate text-sm text-slate-600">@{account.username} · <span className="break-all">{account.email}</span></p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge className={STATUS_STYLES[account.status]}>{STATUS_LABELS[account.status]}</Badge>
        {account.role === 'ADMINISTRATOR' && <Badge className="bg-accent-500 text-white">{ROLE_LABELS[account.role]}</Badge>}
      </div>
    </div>
    <p className="mt-2 text-xs text-slate-500">
      Joined {sgDate(account.createdAt)} · {account.lastLoginAt ? `Last login ${sgTime(account.lastLoginAt)}` : 'No login in the last 90 days'}
    </p>
  </li>
}
