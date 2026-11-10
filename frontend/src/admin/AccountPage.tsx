/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: One account's admin page: details, suspend/restore/role actions through the reason
 *        pop-up, then its login attempts and audit entries stacked below (author's decisions).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { changeRole, getAccount, restoreAccount, suspendAccount } from '../api/adminApi'
import { getCurrentUserId } from '../auth/tokenSubject'
import { useToast } from '../components/toast/toastContext'
import { AdminShell } from './AdminShell'
import { AuditEntriesList } from './AuditEntriesList'
import { ROLE_LABELS, sgDate, sgTime, STATUS_LABELS, STATUS_STYLES } from './format'
import { LoginEventsList } from './LoginEventsList'
import { ReasonDialog } from './ReasonDialog'
import { buttonClass } from './errors'
import { Badge, ErrorBox } from './shared'
import type { AdminAccount } from './types'

const SECTION_SIZE = 10
type Action = 'suspend' | 'restore' | 'promote' | 'demote'

export function AccountPage() {
  return <AdminShell><AccountContent /></AdminShell>
}

function AccountContent() {
  const { id = '' } = useParams()
  const { showToast } = useToast()
  const [version, setVersion] = useState(0) // bumped after an action: re-read everything
  const [state, setState] = useState<{ key: string; account: AdminAccount | null; error: unknown }>({ key: '', account: null, error: null })
  const [action, setAction] = useState<Action | null>(null)
  const key = `${id}|${version}`

  useEffect(() => {
    const controller = new AbortController()
    getAccount(id, controller.signal).then(
      (account) => { if (!controller.signal.aborted) setState({ key, account, error: null }) },
      (error: unknown) => { if (!controller.signal.aborted) setState({ key, account: null, error }) },
    )
    return () => controller.abort()
  }, [id, key])

  // Keep showing the last account while it is re-read after an action
  const account = state.account?.id === id ? state.account : null
  const loading = state.key !== key && !account
  const isSelf = getCurrentUserId() === id.toLowerCase()

  async function run(chosen: Action, reason: string) {
    if (!account) return
    if (chosen === 'suspend') await suspendAccount(account.id, reason)
    else if (chosen === 'restore') await restoreAccount(account.id, reason)
    else await changeRole(account.id, chosen === 'promote' ? 'ADMINISTRATOR' : 'MEMBER', reason)
    const done = { suspend: 'suspended', restore: 'restored', promote: 'is now an administrator', demote: 'is now a member' }[chosen]
    showToast(`@${account.username} ${chosen === 'suspend' || chosen === 'restore' ? `was ${done}` : done}.`, 'success')
    setAction(null)
    setVersion((n) => n + 1)
  }

  return <>
    <h1 className="mt-6 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">{account ? account.displayName : 'Account'}</h1>
    <p className="mt-2 text-sm"><Link to="/admin/accounts" className="font-semibold text-navy-800 underline-offset-2 hover:underline">← All accounts</Link></p>
    {loading && <p role="status" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading account…</p>}
    {!loading && !account && state.error !== null && (
      <div className="mt-6"><ErrorBox title="Couldn’t load this account" error={state.error} onRetry={() => setVersion((n) => n + 1)} /></div>
    )}
    {account && <>
      <section aria-label="Account details" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold text-navy-900">@{account.username}</p>
            <p className="break-all text-sm text-slate-600">{account.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={STATUS_STYLES[account.status]}>{STATUS_LABELS[account.status]}</Badge>
            <Badge className={account.role === 'ADMINISTRATOR' ? 'bg-accent-500 text-white' : 'bg-slate-100 text-slate-700'}>{ROLE_LABELS[account.role]}</Badge>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Joined</dt><dd className="font-medium text-navy-900">{sgDate(account.createdAt)}</dd></div>
          <div><dt className="text-xs text-slate-500">Last successful login</dt><dd className="font-medium text-navy-900">{account.lastLoginAt ? sgTime(account.lastLoginAt) : 'None in the last 90 days'}</dd></div>
          <div><dt className="text-xs text-slate-500">Account ID</dt><dd className="break-all font-mono text-xs text-navy-900">{account.id}</dd></div>
        </dl>
        {isSelf
          ? <p className="mt-4 text-sm text-slate-500">This is your own account. You can’t suspend it or change its role.</p>
          : <div className="mt-5 flex flex-wrap gap-2">
            {account.status === 'SUSPENDED'
              ? <button type="button" className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800" onClick={() => setAction('restore')}>Restore account</button>
              : <button type="button" className="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800" onClick={() => setAction('suspend')}>Suspend account</button>}
            {account.role === 'MEMBER'
              ? <button type="button" className={buttonClass} onClick={() => setAction('promote')}>Make administrator</button>
              : <button type="button" className={buttonClass} onClick={() => setAction('demote')}>Make member</button>}
          </div>}
      </section>

      <section aria-labelledby="logins-heading" className="mt-8">
        <h2 id="logins-heading" className="mb-3 text-xl font-bold text-navy-900">Login attempts</h2>
        <LoginEventsList query={{ accountId: account.id }} pageSize={SECTION_SIZE} showAccount={false} reloadKey={version} />
      </section>

      <section aria-labelledby="audit-heading" className="mt-8">
        <h2 id="audit-heading" className="mb-3 text-xl font-bold text-navy-900">Audit history</h2>
        <AuditEntriesList query={{ targetId: account.id }} pageSize={SECTION_SIZE} reloadKey={version} />
      </section>

      {action && <ReasonDialog
        {...DIALOGS[action](account)}
        onCancel={() => setAction(null)}
        onConfirm={(reason) => run(action, reason)}
      />}
    </>}
  </>
}

const DIALOGS: Record<Action, (a: AdminAccount) => { title: string; description: string; confirmLabel: string; tone: 'danger' | 'safe' | 'neutral'; reasonRequired: boolean }> = {
  suspend: (a) => ({ title: `Suspend @${a.username}?`, description: 'They are logged out at once and cannot log in until restored. The reason is kept in the audit log.', confirmLabel: 'Suspend account', tone: 'danger', reasonRequired: true }),
  restore: (a) => ({ title: `Restore @${a.username}?`, description: 'They can log in again. The reason is kept in the audit log.', confirmLabel: 'Restore account', tone: 'safe', reasonRequired: true }),
  promote: (a) => ({ title: `Make @${a.username} an administrator?`, description: 'They get access to every admin page and action.', confirmLabel: 'Make administrator', tone: 'neutral', reasonRequired: false }),
  demote: (a) => ({ title: `Make @${a.username} a member?`, description: 'They lose access to the admin pages and actions at once.', confirmLabel: 'Make member', tone: 'neutral', reasonRequired: false }),
}
