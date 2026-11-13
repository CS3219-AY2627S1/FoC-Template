import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useChangePassword } from '@/api/user/account'
import { FormError } from '@/components/FormError'
import { SubmitButton } from '@/components/SubmitButton'
import { TextField } from '@/components/TextField'
import { fieldErrorsOf } from '@/lib/http'

export function ChangePasswordForm() {
  // A refused change keeps what was typed (N5.4); on success the page is left anyway.
  const [values, setValues] = useState({ currentPassword: '', newPassword: '' })
  const change = useChangePassword()
  const navigate = useNavigate()
  const fieldErrors = fieldErrorsOf(change.error)

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    change.mutate(values, {
      onSuccess: () =>
        navigate('/profile', { state: { notice: 'Password changed', detail: 'Every other device is logged out.' } }),
    })
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="ds-surface grid grid-cols-1 content-start gap-4 p-5">
      <p className="text-muted">You stay logged in here. Every other device is logged out.</p>
      <FormError error={change.error} fields={['currentPassword', 'newPassword']} />
      <TextField
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        value={values.currentPassword}
        onChange={(currentPassword) => setValues({ ...values, currentPassword })}
        errors={fieldErrors.currentPassword}
      />
      <TextField
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        value={values.newPassword}
        onChange={(newPassword) => setValues({ ...values, newPassword })}
        errors={fieldErrors.newPassword}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SubmitButton pending={change.isPending} pendingLabel="Changing…">
          Change password
        </SubmitButton>
        <Link to="/profile" className="ds-btn ds-btn--glass">
          Cancel
        </Link>
      </div>
    </form>
  )
}
