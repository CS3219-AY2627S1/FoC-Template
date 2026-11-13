import type { AdminUser } from '@/api/user/types'
import { formatDateTime } from '@/lib/format'
import { AccountStateBadge } from './AccountStateBadge'
import { RoleBadges } from './RoleBadges'

type AccountDetailsProps = {
  account: AdminUser
}

// F1.4.1: every field the user-service returns for an account.
export function AccountDetails({ account }: AccountDetailsProps) {
  return (
    <section aria-labelledby="account-details" className="ds-surface grid grid-cols-1 gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="account-details">Account</h2>
        <AccountStateBadge state={account.state} />
      </div>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="ds-label">Username</dt>
          <dd className="mt-1 wrap-anywhere">{account.username}</dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">NUS email</dt>
          <dd className="mt-1 wrap-anywhere">{account.email}</dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">Roles</dt>
          <dd className="mt-1">
            <RoleBadges roles={account.roles} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">Joined</dt>
          <dd className="mt-1 nums-tabular">{formatDateTime(account.createdAt)}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="ds-label">Account id</dt>
          <dd className="mt-1 font-mono text-sm wrap-anywhere">{account.id}</dd>
        </div>
      </dl>
    </section>
  )
}
