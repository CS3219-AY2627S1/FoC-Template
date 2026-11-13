import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@base-ui/react/button'
import { useForgotPassword } from '../../hooks/useForgotPassword'
import { nusEmailSchema } from '../../schemas/nusEmail.schema'
import styles from '../../styles/authPage.module.scss'
import formStyles from '../../styles/authForm.module.scss'

export const ForgotPasswordPage = () => {
  const request = useForgotPassword()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string>()
  const [sent, setSent] = useState(false)
  const requestError = request.error
    ? 'Unable to send the email. Please try again.'
    : undefined

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Forgot password?</h1>
        <p className={styles.description}>
          Enter your account email to receive a password reset link.
        </p>
      </header>
      <form
        className={formStyles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (request.isPending) return
          const result = nusEmailSchema.safeParse(email)
          setEmailError(
            result.success ? undefined : result.error.issues[0]?.message,
          )
          if (result.success)
            request.mutate(result.data, { onSuccess: () => setSent(true) })
        }}
      >
        <div className={formStyles.field}>
          <label htmlFor="reset-email">Email</label>
          <input
            id="reset-email"
            className={formStyles.input}
            type="email"
            autoComplete="email"
            placeholder="Your NUS email address"
            value={email}
            disabled={request.isPending}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? 'reset-email-error' : undefined}
            onChange={(event) => {
              setEmail(event.target.value)
              setEmailError(undefined)
              setSent(false)
              request.reset()
            }}
          />
          {emailError && (
            <p id="reset-email-error" className={formStyles.error} role="alert">
              {emailError}
            </p>
          )}
        </div>
        {sent && (
          <p className={styles.description} role="status">
            If your account is eligible, check your inbox and spam folder for a
            password reset email.
          </p>
        )}
        {requestError && (
          <p className={formStyles.error} role="alert">
            {requestError}
          </p>
        )}
        <Button
          type="submit"
          className={formStyles.submit}
          disabled={request.isPending}
        >
          {request.isPending
            ? 'Sending…'
            : sent
              ? 'Resend reset link'
              : 'Send reset link'}
        </Button>
      </form>
      <p className={styles.footer}>
        <Link className={styles.link} to="/login">
          Back to login
        </Link>
      </p>
    </>
  )
}
