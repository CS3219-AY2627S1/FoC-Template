import { type FormEvent, useEffect, useRef, useState } from 'react'
import {
  Ban,
  LockKeyhole,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldMinus,
  ShieldPlus,
} from 'lucide-react'

import { ApiError, api, type AdminAccount, type AdminAccountPage } from './api/client'

type Props = {
  currentUserId: string
}

const emptyPage: AdminAccountPage = {
  content: [], page: 0, size: 20, totalElements: 0, totalPages: 0,
}

export function AdminUserManagement({ currentUserId }: Props) {
  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [pageNumber, setPageNumber] = useState(0)
  const [requestVersion, setRequestVersion] = useState(0)
  const [accounts, setAccounts] = useState<AdminAccountPage>(emptyPage)
  const [loading, setLoading] = useState(true)
  const [changingUserId, setChangingUserId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [restore, setRestore] = useState<AdminAccount | null>(null)
  const [restoreReason, setRestoreReason] = useState('')
  const restoreField = useRef<HTMLTextAreaElement>(null)
  const restoreButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (restore) restoreField.current?.focus()
    else if (!changingUserId) restoreButton.current?.focus()
  }, [restore, changingUserId])
  const closeRestore = () => { setRestore(null); setRestoreReason('') }
  const reactivate = async (event: FormEvent) => {
    event.preventDefault()
    if (!restore || !restoreReason.trim() || changingUserId) return
    setChangingUserId(restore.userId); setMessage(''); setError('')
    try {
      replaceAccount(await api.setAccountStatus(restore.userId, 'ACTIVE', restoreReason.trim()))
      setMessage(`${restore.username} has been reactivated.`); closeRestore()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'We couldn’t reactivate this account.') }
    finally { setChangingUserId(null) }
  }

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 3000)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    let cancelled = false
    void api.listAdminAccounts(query, pageNumber)
      .then(result => { if (!cancelled) setAccounts(result) })
      .catch(requestError => {
        if (!cancelled) setError(requestError instanceof ApiError ? requestError.message : 'We couldn’t load accounts.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [pageNumber, query, requestVersion])

  const search = (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    setError('')
    setLoading(true)
    setPageNumber(0)
    setQuery(queryDraft.trim())
    setRequestVersion(current => current + 1)
  }

  const replaceAccount = (updated: AdminAccount) => {
    setAccounts(current => ({
      ...current,
      content: current.content.map(account => account.userId === updated.userId ? updated : account),
    }))
  }

  const changeAdministrator = async (account: AdminAccount, administrator: boolean) => {
    const action = administrator ? 'promote' : 'remove Admin access from'
    if (!window.confirm(`Are you sure you want to ${action} ${account.username}?`)) return
    setChangingUserId(account.userId)
    setMessage('')
    setError('')
    try {
      replaceAccount(await api.setAdministrator(account.userId, administrator))
      setMessage(administrator ? `${account.username} is now an administrator.` : `Admin access removed from ${account.username}.`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'We couldn’t change admin access.')
    } finally {
      setChangingUserId(null)
    }
  }

  const changeStatus = async (account: AdminAccount, status: 'ACTIVE' | 'BANNED') => {
    const action = status === 'BANNED' ? 'ban' : 'reactivate'
    if (!window.confirm(`Are you sure you want to ${action} ${account.username}?`)) return
    setChangingUserId(account.userId)
    setMessage('')
    setError('')
    try {
      replaceAccount(await api.setAccountStatus(account.userId, status))
      setMessage(status === 'BANNED' ? `${account.username} has been banned.` : `${account.username} has been reactivated.`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'We couldn’t update this account.')
    } finally {
      setChangingUserId(null)
    }
  }

  return <section className="admin-users" aria-labelledby="admin-users-title">
    <p className="eyebrow">Administration</p>
    <h1 id="admin-users-title">Manage users</h1>
    <p className="intro">Manage who can use FoC and who is an admin.</p>

    <form className="admin-user-search" role="search" onSubmit={search}>
      <label htmlFor="admin-user-query">Search by email or username</label>
      <span>
        <input id="admin-user-query" value={queryDraft} onChange={event => setQueryDraft(event.target.value)} />
        <button disabled={loading}><Search aria-hidden="true" className="account-icon" />Search</button>
      </span>
    </form>

    {message && <p className="admin-user-success" role="status">{message}</p>}
    {error && <p className="admin-user-notice error" role="alert">{error}</p>}
    {loading && <p role="status">Loading accounts…</p>}
    {!loading && accounts.content.length === 0 && <p>No accounts match your search.</p>}

    {!loading && accounts.content.length > 0 && <div className="admin-user-list" aria-label="User accounts">
      {accounts.content.map(account => {
        const isSelf = account.userId === currentUserId
        const isAdmin = account.roles.includes('ADMIN')
        const changing = changingUserId === account.userId
        return <article className={`admin-user-card${isSelf ? ' admin-user-card-self' : ''}`} key={account.userId}>
          <div className="admin-user-summary">
            <div className="admin-user-identity">
              <span className={`admin-user-avatar${isAdmin ? ' administrator' : ''}`} aria-hidden="true">{account.username.trim().charAt(0).toUpperCase()}</span>
              <div className="admin-user-name">
                <h2>{account.username}</h2>
                <p>{account.email}</p>
              </div>
            </div>
            <span className={`account-status account-status-${account.status.toLowerCase()}`}><span className="account-status-dot" aria-hidden="true" />{account.status}</span>
          </div>
          <div className="admin-user-roles" aria-label={`Roles for ${account.username}`}>
            {account.roles.map(role => <span className={role === 'ADMIN' ? 'administrator-role' : 'participant-role'} key={role}>
              {role === 'ADMIN' && <ShieldCheck aria-hidden="true" className="account-icon" />}
              {role === 'ADMIN' ? 'Administrator' : role === 'REQUESTER' ? 'Requester' : 'Courier'}
            </span>)}
          </div>
          <div className="admin-user-actions">
            {isSelf
              ? <div className="admin-self-label"><LockKeyhole aria-hidden="true" className="account-icon" /><div><strong>Current account</strong><span>Your own access is protected.</span></div></div>
              : <>
                <div className="admin-action-group">
                <button type="button" className={`admin-account-action ${isAdmin ? 'access-remove' : 'access-grant'}`} disabled={changing || account.status !== 'ACTIVE'}
                  onClick={() => { void changeAdministrator(account, !isAdmin) }}>
                  {isAdmin ? <ShieldMinus aria-hidden="true" className="account-icon" /> : <ShieldPlus aria-hidden="true" className="account-icon" />}
                  {changing ? 'Updating…' : isAdmin ? 'Remove Admin' : 'Promote to Admin'}
                </button>
                </div>
                <div className="admin-action-group">
                <button type="button" className={`admin-account-action ${account.status === 'BANNED' ? 'account-restore' : 'account-ban'}`} disabled={changing || account.status === 'UNVERIFIED'}
                  onClick={(event) => { if (account.status === 'BANNED') { restoreButton.current = event.currentTarget; setRestoreReason(''); setRestore(account) } else void changeStatus(account, 'BANNED') }}>
                  {account.status === 'BANNED' ? <RotateCcw aria-hidden="true" className="account-icon" /> : <Ban aria-hidden="true" className="account-icon" />}
                  {account.status === 'BANNED' ? 'Reactivate' : 'Ban account'}
                </button>
                </div>
              </>}
          </div>
        </article>
      })}
    </div>}

    {restore && <form className="admin-user-search account-reactivation" aria-label="Reactivate account" onSubmit={(event) => { void reactivate(event) }}>
      <h2>Reactivate {restore.username}</h2>
      <p>They’ll be able to sign in again.</p>
      <label htmlFor="reactivation-reason">Reason for reactivation</label>
      <textarea id="reactivation-reason" ref={restoreField} required maxLength={2000} rows={3}
        disabled={!!changingUserId} value={restoreReason} onChange={event => setRestoreReason(event.target.value)} />
      <button disabled={!!changingUserId || !restoreReason.trim()}>Confirm reactivation</button>
      <button type="button" className="secondary" disabled={!!changingUserId} onClick={closeRestore}>Cancel reactivation</button>
    </form>}
    {accounts.totalPages > 1 && <nav className="admin-user-pagination" aria-label="User account pages">
      <button type="button" className="secondary" disabled={loading || accounts.page === 0}
        onClick={() => { setLoading(true); setError(''); setPageNumber(current => Math.max(0, current - 1)) }}>Previous</button>
      <span>Page {accounts.page + 1} of {accounts.totalPages}</span>
      <button type="button" className="secondary" disabled={loading || accounts.page + 1 >= accounts.totalPages}
        onClick={() => { setLoading(true); setError(''); setPageNumber(current => current + 1) }}>Next</button>
    </nav>}
  </section>
}
