import { useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { Button } from '@base-ui/react/button'
import { useResetPassword } from '../../hooks/useForgotPassword'
import { AuthRequestError } from '../../lib/authRequest'
import { passwordSchema } from '../../schemas/password.schema'
import styles from '../../styles/authPage.module.scss'
import formStyles from '../../styles/authForm.module.scss'

export const ResetPasswordPage = () => {
  const { token } = useSearch({ from: '/auth/reset-password' })
  const reset = useResetPassword()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [validationError, setValidationError] = useState<string>()
  const unavailable =
    !token ||
    (reset.error instanceof AuthRequestError && reset.error.status === 410)

  if (reset.isSuccess || unavailable) {
    return (
      <section className={styles.header}>
        <h1 className={styles.title}>
          {reset.isSuccess ? 'Password reset' : 'Link unavailable'}
        </h1>
        <p className={styles.description}>
          {reset.isSuccess
            ? 'Your password has been reset successfully. You can now log in with your new password.'
            : 'This password reset link is no longer valid. Please request a new link.'}
        </p>
        <p className={styles.footer}>
          {reset.isSuccess ? (
            <Link
              className={`${formStyles.submit} ${styles.action}`}
              to="/login"
            >
              Log in
            </Link>
          ) : (
            <Link className={styles.link} to="/forgot-password">
              Request a new link
            </Link>
          )}
        </p>
      </section>
    )
  }

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Reset password</h1>
        <p className={styles.description}>
          Choose a new password for your FoC account.
        </p>
      </header>
      <form
        className={formStyles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (reset.isPending) return
          const result = passwordSchema.safeParse(password)
          const error = !result.success
            ? result.error.issues[0].message
            : password !== confirmation
              ? 'Passwords do not match.'
              : undefined
          setValidationError(error)
          if (!error)
            reset.mutate(
              { token, newPassword: password },
              {
                onSuccess: () => {
                  setPassword('')
                  setConfirmation('')
                },
              },
            )
        }}
      >
        <div className={formStyles.field}>
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            className={formStyles.input}
            type="password"
            autoComplete="new-password"
            placeholder="Enter a new password"
            value={password}
            disabled={reset.isPending}
            aria-describedby="password-hint"
            onChange={(event) => setPassword(event.target.value)}
          />
          <span id="password-hint">Use at least 8 characters.</span>
        </div>
        <div className={formStyles.field}>
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            className={formStyles.input}
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter your new password"
            value={confirmation}
            disabled={reset.isPending}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
        {validationError && (
          <p className={formStyles.error} role="alert">
            {validationError}
          </p>
        )}
        {reset.isError && !validationError && (
          <p className={formStyles.error} role="alert">
            Unable to reset your password. Please try again.
          </p>
        )}
        <Button
          type="submit"
          className={formStyles.submit}
          disabled={reset.isPending}
        >
          {reset.isPending ? 'Resetting…' : 'Reset password'}
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
