/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
 * Scope (AI-28): Generated the account list endpoint, admin users page and their tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

import { useEffect, useState } from 'react'
import type { AccountType } from '../auth/auth.token'
import { useAuth } from '../auth/useAuth'
import { listAccounts, updateAccountType, type AccountPage, type AccountSummary } from './account.api'
import { errorMessage, PAGE_SIZE } from './admin.utils'
import { Badge, Modal, Pagination } from './AdminUi'

type LoadResult = { key: string; data: AccountPage | null; error: string }

const SEARCH_DELAY_MS = 300

function displayName(account: AccountSummary) {
  return account.name ?? account.email
}

// Admin dashboard section: search accounts (server-side, paged) and promote or demote administrators
export function AdminUsers() {
  const { currentUserId } = useAuth()
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [type, setType] = useState<AccountType | ''>('')
  const [page, setPage] = useState(0)
  const [reload, setReload] = useState(0)
  const [result, setResult] = useState<LoadResult>({ key: '', data: null, error: '' })
  const [changing, setChanging] = useState<AccountSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')

  // Wait until typing pauses before searching, instead of one request per keystroke
  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [search])

  const requestKey = JSON.stringify([appliedSearch, type, page, reload])
  useEffect(() => {
    const controller = new AbortController()
    listAccounts({ search: appliedSearch, type: type || undefined, page, size: PAGE_SIZE }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ key: requestKey, data, error: '' }) })
      .catch(error => { if (!controller.signal.aborted) setResult({ key: requestKey, data: null, error: errorMessage(error) }) })
    return () => controller.abort()
  }, [appliedSearch, type, page, reload, requestKey])

  const loading = result.key !== requestKey
  const accounts = result.data?.items ?? []
  const totalElements = result.data?.page.totalElements ?? 0
  const promoting = changing?.type === 'Student'

  async function confirmChange() {
    if (!changing) return
    const newType: AccountType = promoting ? 'Administrator' : 'Student'
    setSaving(true); setActionError('')
    try {
      await updateAccountType(changing.id, newType)
      setNotice(promoting
        ? `${displayName(changing)} is now an administrator. They get access the next time they open or reload the app.`
        : `${displayName(changing)} is no longer an administrator.`)
      setChanging(null); setReload(value => value + 1)
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function closeDialog() { setChanging(null); setActionError('') }

  return <>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <section className="admin-panel">
      <div className="admin-toolbar">
        <label className="admin-search">Search by name or email<input type="search" maxLength={100} value={search} placeholder="Name or email…" onChange={event => { setSearch(event.target.value); setPage(0) }} /></label>
        <label>Role<select value={type} onChange={event => { setType(event.target.value as AccountType | ''); setPage(0) }}><option value="">All roles</option><option value="Student">Students</option><option value="Administrator">Administrators</option></select></label>
      </div>
      <div className="admin-panel-head"><h2>Accounts</h2><span className="admin-muted">{loading ? 'Loading…' : `${totalElements} ${totalElements === 1 ? 'account' : 'accounts'}`}</span></div>
      {result.error && !loading && <p className="admin-error" role="alert">{result.error}</p>}
      {loading && !result.data && <p role="status" className="admin-muted admin-users-loading">Loading accounts…</p>}
      {result.data && <div className="admin-table-scroll"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody>{accounts.map(account => <tr key={account.id}>
          <td><strong>{account.name ?? 'No name set'}</strong></td>
          <td>{account.email}</td>
          <td><Badge status={account.type} /></td>
          <td>{account.id === currentUserId
            ? <span className="admin-muted">You</span>
            : <button type="button" onClick={() => { setNotice(''); setChanging(account) }}>{account.type === 'Student' ? 'Make administrator' : 'Remove administrator'}</button>}</td>
        </tr>)}</tbody>
      </table>{!accounts.length && !loading && <div className="admin-empty">No accounts match the search.</div>}</div>}
      <Pagination page={page} totalItems={totalElements} onChange={setPage} />
    </section>
    {changing && <Modal title={promoting ? `Make ${displayName(changing)} an administrator?` : `Remove administrator access from ${displayName(changing)}?`} close={closeDialog}>
      <p>{promoting
        ? 'They will be able to manage suppliers, categories, buildings, errands and other accounts, including other administrators. They get access the next time they open or reload the app.'
        : 'They will lose access to the admin dashboard. A session they already have open can keep administrator access for up to 15 minutes.'}</p>
      {actionError && <p role="alert" className="admin-error">{actionError}</p>}
      <div className="admin-dialog-actions"><button type="button" onClick={closeDialog}>Cancel</button><button type="button" className="admin-primary" disabled={saving} onClick={() => void confirmChange()}>{saving ? 'Saving…' : promoting ? 'Make administrator' : 'Remove administrator'}</button></div>
    </Modal>}
  </>
}
