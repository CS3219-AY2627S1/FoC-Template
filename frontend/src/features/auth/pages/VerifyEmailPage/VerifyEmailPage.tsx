import { useRef, useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import type { SubmitEvent } from 'react'
import { useEmailVerification } from '../../hooks/useEmailVerification'
import { AuthRequestError } from '../../lib/authRequest'
import { nusEmailSchema } from '../../schemas/nusEmail.schema'
import formStyles from '../../styles/authForm.module.scss'
import pageStyles from '../../styles/authPage.module.scss'
import styles from './VerifyEmailPage.module.scss'

export const VerifyEmailPage = () => {
  const {
    token,
    email: initialEmail,
    purpose,
  } = useSearch({
    from: '/auth/verify-email',
  })
  const { verification, resend } = useEmailVerification(token, purpose)
  const [email, setEmail] = useState(initialEmail ?? '')
  const [fieldError, setFieldError] = useState('')
  const [requestedEmail, setRequestedEmail] = useState('')
  const submitting = useRef(false)

  if (purpose === 'email-change') {
    return <EmailChangeResult token={token} verification={verification} />
  }

  const linkUnavailable =
    verification.error instanceof AuthRequestError &&
    verification.error.status === 400
  const checking =
    Boolean(token) && (verification.isIdle || verification.isPending)
  const needsAddress = !requestedEmail && !initialEmail
  const title = checking
    ? 'Verifying your email…'
    : verification.isSuccess
      ? 'Email verified'
      : verification.isError && !requestedEmail
        ? linkUnavailable
          ? 'Link unavailable'
          : 'Unable to verify email'
        : 'Check your email'

  const resendEmail = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current) return

    const result = nusEmailSchema.safeParse(email)
    if (!result.success) {
      setFieldError(result.error.issues[0].message)
      return
    }

    setFieldError('')
    submitting.current = true
    try {
      await resend.mutateAsync(result.data)
      setEmail(result.data)
      setRequestedEmail(result.data)
    } catch {
      // The mutation error is shown beside the existing resend action.
    } finally {
      submitting.current = false
    }
  }

  const resendError = resend.error
    ? resend.error instanceof AuthRequestError && resend.error.status === 429
      ? 'Please wait a minute before requesting another email.'
      : 'Unable to resend the email. Please try again.'
    : undefined

  return (
    <section className={styles.content}>
      <h1 className={pageStyles.title}>{title}</h1>
      {checking ? (
        <p role="status">Please wait while we verify your email.</p>
      ) : verification.isSuccess ? (
        <>
          <p role="status">Your email has been verified. You can now log in.</p>
          <Link className={`${formStyles.submit} ${styles.action}`} to="/login">
            Log in
          </Link>
        </>
      ) : linkUnavailable ? (
        <p>
          This link may have expired or already been used. Please return to log
          in.
        </p>
      ) : verification.isError ? (
        <>
          <p role="alert">Unable to verify your email. Please try again.</p>
          <Button
            className={formStyles.submit}
            onClick={() => verification.mutate(token!)}
          >
            Try again
          </Button>
        </>
      ) : (
        <>
          <p>Verify your email to finish creating your account.</p>
          {(requestedEmail || initialEmail) && (
            <p className={styles.email}>{requestedEmail || initialEmail}</p>
          )}
          <p>Check your inbox and spam folder for the verification email.</p>
          <form
            className={styles.resend}
            onSubmit={(event) => void resendEmail(event)}
            noValidate
          >
            {needsAddress && (
              <div className={formStyles.field}>
                <label htmlFor="verification-email">Email</label>
                <Input
                  className={formStyles.input}
                  id="verification-email"
                  type="email"
                  autoComplete="email"
                  placeholder="Your NUS email address"
                  value={email}
                  onValueChange={setEmail}
                  disabled={resend.isPending}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={
                    fieldError ? 'verification-email-error' : undefined
                  }
                />
                {fieldError && (
                  <p
                    id="verification-email-error"
                    className={formStyles.error}
                    role="alert"
                  >
                    {fieldError}
                  </p>
                )}
              </div>
            )}
            {resendError && (
              <p className={formStyles.error} role="alert">
                {resendError}
              </p>
            )}
            {resend.isSuccess && (
              <p className={styles.feedback} role="status">
                If your account still needs verification, check your inbox and
                spam folder for the latest email.
              </p>
            )}
            <Button
              className={formStyles.submit}
              type="submit"
              disabled={resend.isPending}
            >
              {resend.isPending
                ? 'Requesting email…'
                : 'Resend verification email'}
            </Button>
          </form>
        </>
      )}
      {!verification.isSuccess && (
        <Link className={pageStyles.link} to="/login">
          Back to log in
        </Link>
      )}
    </section>
  )
}

const EmailChangeResult = ({
  token,
  verification,
}: {
  token?: string
  verification: ReturnType<typeof useEmailVerification>['verification']
}) => {
  const checking =
    Boolean(token) && (verification.isIdle || verification.isPending)
  const status =
    verification.error instanceof AuthRequestError
      ? verification.error.status
      : undefined
  const unavailable = !token || status === 400
  const occupied = status === 409
  const title = checking
    ? 'Verifying your email…'
    : verification.isSuccess
      ? 'Email updated'
      : unavailable
        ? 'Link unavailable'
        : 'Unable to update email'

  return (
    <section className={styles.content}>
      <h1 className={pageStyles.title}>{title}</h1>
      {checking ? (
        <p role="status">Please wait while we verify your email.</p>
      ) : verification.isSuccess ? (
        <>
          <p role="status">Your email address has been updated successfully.</p>
          <Link
            className={`${formStyles.submit} ${styles.action}`}
            to="/profile"
          >
            Back to profile
          </Link>
        </>
      ) : (
        <>
          <p role="alert">
            {unavailable
              ? 'This link is no longer valid. Return to Edit Profile to request a new one.'
              : occupied
                ? 'This email address is already in use. Return to Edit Profile to choose another address.'
                : 'Unable to verify your email. Please try again.'}
          </p>
          {!unavailable && !occupied && (
            <Button
              className={formStyles.submit}
              onClick={() => verification.mutate(token)}
            >
              Try again
            </Button>
          )}
          <Link className={pageStyles.link} to="/profile/edit">
            Back to Edit Profile
          </Link>
        </>
      )}
    </section>
  )
}
