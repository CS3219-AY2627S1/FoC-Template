import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useResendCode, useVerify } from '@/api/user/auth'
import { FormError } from '@/components/FormError'
import { Notice } from '@/components/Notice'
import { SubmitButton } from '@/components/SubmitButton'
import { TextField } from '@/components/TextField'
import { useClientConfig } from '@/lib/clientConfig'
import { ApiError, fieldErrorsOf } from '@/lib/http'
import { AuthCard } from '../components/AuthCard'

// A wrong code tells how many tries the current code still has (details.attemptsLeft).
function attemptsLeftOf(error: unknown): number | undefined {
  if (!(error instanceof ApiError) || error.code !== 'CODE_INVALID') return undefined
  const details = error.details
  if (typeof details === 'object' && details !== null && 'attemptsLeft' in details && typeof details.attemptsLeft === 'number') {
    return details.attemptsLeft
  }
  return undefined
}

export function VerifyPage() {
  // Sign-up and the login page send the email along, so it is usually filled in already.
  const arrival = useLocation().state as { email?: string } | null
  const [values, setValues] = useState({ email: arrival?.email ?? '', code: '' })
  const verify = useVerify()
  const resend = useResendCode()
  const navigate = useNavigate()
  const fieldErrors = { ...fieldErrorsOf(resend.error), ...fieldErrorsOf(verify.error) }
  const attemptsLeft = attemptsLeftOf(verify.error)
  const devMailboxUrl = useClientConfig().data?.devMailboxUrl

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    resend.reset()
    verify.mutate(values, {
      onSuccess: (user) => navigate('/login', { replace: true, state: { identifier: user.email, verified: true } }),
    })
  }

  // Only one outcome shows at a time, so an old "code expired" does not sit next to "new code sent".
  function handleResend() {
    verify.reset()
    resend.mutate(values.email)
  }

  return (
    <AuthCard
      title="Verify your email"
      footer={
        <>
          Already verified? <Link to="/login">Log in</Link>
        </>
      }
    >
      <p className="text-muted">Enter the 6-digit code from the email we sent you.</p>
      {/* Only set while emails land in a test inbox instead of being sent, locally and in the cloud demo. */}
      {devMailboxUrl && (
        <Notice tone="info" title="Test mode: no real email is sent">
          Every email lands in a shared test inbox.{' '}
          <a href={devMailboxUrl} target="_blank" rel="noreferrer">
            Open Mailpit
          </a>{' '}
          to copy your code.
        </Notice>
      )}
      <form noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        {resend.isSuccess && <Notice tone="success" role="status" title={resend.data.message} />}
        <FormError error={verify.error ?? resend.error} fields={['email', 'code']} />
        {attemptsLeft !== undefined && (
          <p className="text-sm text-muted">
            {attemptsLeft > 0
              ? `${attemptsLeft} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} left for this code.`
              : 'This code has no attempts left. Send a new one.'}
          </p>
        )}
        <TextField
          label="NUS email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={values.email}
          onChange={(email) => setValues({ ...values, email })}
          errors={fieldErrors.email}
        />
        <TextField
          label="Code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={values.code}
          onChange={(code) => setValues({ ...values, code })}
          errors={fieldErrors.code}
        />
        <SubmitButton pending={verify.isPending} pendingLabel="Verifying…">
          Verify
        </SubmitButton>
        <button
          type="button"
          className="ds-btn ds-btn--text justify-self-center"
          disabled={resend.isPending}
          aria-busy={resend.isPending || undefined}
          onClick={handleResend}
        >
          {resend.isPending ? 'Sending…' : 'Send a new code'}
        </button>
      </form>
    </AuthCard>
  )
}
