import { useGrantAdministrator, useRevokeAdministrator } from '@/api/user/admin'
import type { AdminUser } from '@/api/user/types'
import { FormError } from '@/components/FormError'
import { Notice } from '@/components/Notice'

type AdministratorRoleProps = {
  account: AdminUser
}

// F5.1.2. The user-service refuses to remove the last administrator and says so.
export function AdministratorRole({ account }: AdministratorRoleProps) {
  const grant = useGrantAdministrator(account.id)
  const revoke = useRevokeAdministrator(account.id)
  const isAdministrator = account.roles.includes('administrator')
  const action = isAdministrator ? revoke : grant
  const previous = isAdministrator ? grant : revoke
  const pending = grant.isPending || revoke.isPending

  function handleClick() {
    // aria-disabled keeps keyboard focus on the button, so a running request is ignored here (as in SubmitButton).
    if (pending) return
    // Only the latest change shows its outcome, so the one before it is cleared first.
    previous.reset()
    action.mutate()
  }

  return (
    <section aria-labelledby="administrator-role" className="ds-surface grid grid-cols-1 gap-4 p-5">
      <h2 id="administrator-role">Administrator role</h2>
      <p className="text-muted">
        {isAdministrator
          ? 'This account can open the admin console and decide reports.'
          : 'Administrators can open the admin console and decide reports.'}
      </p>
      {grant.isSuccess && <Notice tone="success" role="status" title="Administrator role granted" />}
      {revoke.isSuccess && <Notice tone="success" role="status" title="Administrator role removed" />}
      <FormError error={grant.error ?? revoke.error} />
      <button
        type="button"
        className="ds-btn ds-btn--glass"
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        onClick={handleClick}
      >
        {isAdministrator ? (pending ? 'Removing…' : 'Remove administrator role') : pending ? 'Granting…' : 'Make administrator'}
      </button>
    </section>
  )
}
