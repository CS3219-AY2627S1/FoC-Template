import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { useLogin } from '@/api/user/auth'
import { FormError } from '@/components/FormError'
import { Notice } from '@/components/Notice'
import { SubmitButton } from '@/components/SubmitButton'
import { TextField } from '@/components/TextField'
import { ApiError, fieldErrorsOf } from '@/lib/http'
import { AuthCard } from '../components/AuthCard'

export function LoginPage() {
  // After verification the email comes along, so only the password is left to type.
  const arrival = useLocation().state as { identifier?: string; verified?: boolean } | null
  const [values, setValues] = useState({ identifier: arrival?.identifier ?? '', password: '' })
  const login = useLogin()
  const fieldErrors = fieldErrorsOf(login.error)
  const notVerified = login.error instanceof ApiError && login.error.code === 'ACCOUNT_NOT_VERIFIED'

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    login.mutate(values)
  }

  return (
    <AuthCard
      title="Log in"
      footer={
        <>
          New to Relay? <Link to="/signup">Create an account</Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        {arrival?.verified && !login.error && (
          <Notice tone="success" role="status" title="Email verified">
            Log in with your password to start.
          </Notice>
        )}
        <FormError error={login.error} fields={['identifier', 'password']} />
        {notVerified && (
          // Only an email can be carried over; a username is not enough to verify.
          <Link
            to="/verify"
            state={{ email: values.identifier.includes('@') ? values.identifier.trim() : undefined }}
            className="justify-self-start"
          >
            Verify your email
          </Link>
        )}
        <TextField
          label="Username or NUS email"
          name="identifier"
          autoComplete="username"
          value={values.identifier}
          onChange={(identifier) => setValues({ ...values, identifier })}
          errors={fieldErrors.identifier}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={(password) => setValues({ ...values, password })}
          errors={fieldErrors.password}
        />
        <SubmitButton pending={login.isPending} pendingLabel="Logging in…">
          Log in
        </SubmitButton>
      </form>
    </AuthCard>
  )
}
