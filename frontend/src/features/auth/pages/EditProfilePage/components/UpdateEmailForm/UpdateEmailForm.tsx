import { useRef, useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { useEmailChange } from '../../../../hooks/useUserProfile'
import { getProfileError } from '../../../../utils/getProfileError'
import { nusEmailSchema } from '../../../../schemas/nusEmail.schema'
import styles from '../../EditProfilePage.module.scss'

export const UpdateEmailForm = ({ busy }: { busy: boolean }) => {
  const [email, setEmail] = useState('')
  const [sentEmail, setSentEmail] = useState('')
  const [emailFieldError, setEmailFieldError] = useState('')
  const sendingEmail = useRef(false)
  const emailChange = useEmailChange()
  const emailRequestError = emailChange.error
    ? getProfileError(emailChange.error)
    : null
  const emailError = emailFieldError || emailRequestError?.fields.email
  const isResend =
    sentEmail === email.trim().toLowerCase() && Boolean(sentEmail)
  const sendVerificationEmail = async () => {
    if (sendingEmail.current) return
    emailChange.reset()
    const result = nusEmailSchema.safeParse(email)
    setEmailFieldError(result.success ? '' : result.error.issues[0].message)
    if (!result.success) return

    sendingEmail.current = true
    try {
      await emailChange.mutateAsync(result.data)
      setEmail(result.data)
      setSentEmail(result.data)
    } catch {
      // The mutation error is displayed below the email form.
    } finally {
      sendingEmail.current = false
    }
  }

  return (
    <form
      className={styles.form}
      noValidate
      aria-label="Update email"
      aria-busy={emailChange.isPending}
      onSubmit={(event) => {
        event.preventDefault()
        void sendVerificationEmail()
      }}
    >
      <fieldset
        className={styles.card}
        disabled={busy || emailChange.isPending}
      >
        <legend className={styles.srOnly}>Update your email</legend>
        <h2>Update Email</h2>
        <p className={styles.hint}>
          Your email will change after you verify the new address.
        </p>
        <div className={styles.field}>
          <label htmlFor="new-email">New email address</label>
          <Input
            id="new-email"
            type="email"
            autoComplete="email"
            value={email}
            onValueChange={(value) => {
              setEmail(value)
              setEmailFieldError('')
              emailChange.reset()
            }}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? 'new-email-error' : undefined}
          />
          {emailError && (
            <p className={styles.fieldError} id="new-email-error">
              {emailError}
            </p>
          )}
        </div>
      </fieldset>
      {emailRequestError && (
        <p className={styles.error} role="alert">
          {emailRequestError.message}
        </p>
      )}
      {isResend && (
        <div className={styles.success} role="status">
          <p>Check {sentEmail} for a verification email.</p>
          <p>Please check your inbox and spam folder.</p>
          <p>
            Your current email will remain unchanged until verification is
            complete.
          </p>
        </div>
      )}
      <div className={styles.footer}>
        <Button
          className={styles.save}
          type="submit"
          disabled={busy || emailChange.isPending}
        >
          {emailChange.isPending
            ? 'Requesting email…'
            : isResend
              ? 'Resend verification email'
              : 'Send verification email'}
        </Button>
      </div>
    </form>
  )
}
