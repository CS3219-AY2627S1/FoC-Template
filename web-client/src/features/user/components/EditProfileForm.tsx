import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useUpdateProfile } from '@/api/user/account'
import type { PublicUser } from '@/api/user/types'
import { FormError } from '@/components/FormError'
import { SubmitButton } from '@/components/SubmitButton'
import { TextField } from '@/components/TextField'
import { fieldErrorsOf } from '@/lib/http'

type EditProfileFormProps = {
  user: PublicUser
}

export function EditProfileForm({ user }: EditProfileFormProps) {
  const [values, setValues] = useState({ fullName: user.fullName, username: user.username })
  const update = useUpdateProfile()
  const navigate = useNavigate()
  const fieldErrors = fieldErrorsOf(update.error)

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    // The overview shows the notice; the flag travels in the router state, not the URL.
    update.mutate(values, { onSuccess: () => navigate('/profile', { state: { notice: 'Profile saved' } }) })
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="ds-surface grid grid-cols-1 content-start gap-4 p-5">
      {/* The user-service refuses changes to email, roles and state here (F1.4.3). */}
      <p className="text-muted">Your NUS email cannot be changed.</p>
      <FormError error={update.error} fields={['fullName', 'username']} />
      <TextField
        label="Full name"
        name="fullName"
        autoComplete="name"
        value={values.fullName}
        onChange={(fullName) => setValues({ ...values, fullName })}
        errors={fieldErrors.fullName}
      />
      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        value={values.username}
        onChange={(username) => setValues({ ...values, username })}
        errors={fieldErrors.username}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SubmitButton pending={update.isPending} pendingLabel="Saving…">
          Save changes
        </SubmitButton>
        <Link to="/profile" className="ds-btn ds-btn--glass">
          Cancel
        </Link>
      </div>
    </form>
  )
}
