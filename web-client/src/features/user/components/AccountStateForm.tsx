import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { useChangeAccountState } from '@/api/user/admin'
import type { AdminUser } from '@/api/user/types'
import { FormError } from '@/components/FormError'
import { Notice } from '@/components/Notice'
import { SubmitButton } from '@/components/SubmitButton'
import { TextAreaField } from '@/components/TextAreaField'
import { fieldErrorsOf } from '@/lib/http'

type AccountStateFormProps = {
  account: AdminUser
}

// F5.5.2 and F5.5.3. Which action shows follows the state the user-service returns; whether it
// is allowed (own account, last administrator) the user-service decides and explains.
export function AccountStateForm({ account }: AccountStateFormProps) {
  const [reason, setReason] = useState('')
  const change = useChangeAccountState(account.id)
  const fieldErrors = fieldErrorsOf(change.error)

  if (account.state === 'PendingVerification') {
    return (
      <section aria-labelledby="account-state" className="ds-surface grid grid-cols-1 gap-2 p-5">
        <h2 id="account-state">Account state</h2>
        <p className="text-muted">This account has not verified its email yet.</p>
      </section>
    )
  }

  const suspending = account.state === 'Active'

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    change.mutate({ state: suspending ? 'Suspended' : 'Active', reason }, { onSuccess: () => setReason('') })
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-labelledby="account-state" className="ds-surface grid grid-cols-1 gap-4 p-5">
      <h2 id="account-state">{suspending ? 'Suspend account' : 'Reinstate account'}</h2>
      <p className="text-muted">
        {suspending
          ? 'Every session of this account ends at once. The reason is recorded with your name.'
          : 'The account can log in again. The reason is recorded with your name.'}
      </p>
      {/* The outcome comes from the answer, since the page shows the new state only after it reloads. */}
      {change.isSuccess && (
        <Notice tone="success" role="status" title={change.data.state === 'Suspended' ? 'Account suspended' : 'Account reinstated'} />
      )}
      <FormError error={change.error} fields={['reason']} />
      <TextAreaField
        label="Reason"
        name="reason"
        value={reason}
        onChange={setReason}
        hint="Between 20 and 500 characters"
        characterLimit={500}
        errors={fieldErrors.reason}
      />
      <SubmitButton pending={change.isPending} pendingLabel={suspending ? 'Suspending…' : 'Reinstating…'}>
        {suspending ? 'Suspend account' : 'Reinstate account'}
      </SubmitButton>
    </form>
  )
}
