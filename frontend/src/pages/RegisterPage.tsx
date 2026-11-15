/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Create-account page calling the User Service register endpoint; on success,
 *        goes to the login page with a message (author decision).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, NetworkError } from '../api/client'
import * as userApi from '../api/userApi'
import type { LoginPageState } from '../auth/AuthProvider'
import { FormField } from '../components/FormField'
import { AuthLayout, primaryButtonClass } from './AuthLayout'

type Field = 'username' | 'email' | 'password'

// Hint shown under the form. The actual rules are enforced by the User Service
// (US-F1.1.2, US-F1.1.3, US-F2.1); the page just shows whatever the server rejects,
// so the rules only live in one place.
const RULES_HINT =
  'Username: 3–30 letters, digits or underscores. Password: 12+ characters with an uppercase letter, a lowercase letter and a digit. Use your u.nus.edu email.'

export function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState<Record<Field, string>>({ username: '', email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const update = (field: Field) => (e: ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [field]: e.target.value }))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldErrors({})
    setFormError(null)
    setSubmitting(true)
    try {
      await userApi.register(values.username, values.email, values.password)
      const state: LoginPageState = { notice: 'Account created. Please log in.' }
      navigate('/login', { state })
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Object.keys(err.details).length > 0) {
        // VALIDATION_FAILED: the server says which fields are wrong
        setFieldErrors(err.details)
      } else if (err instanceof ApiError && err.code === 'USERNAME_TAKEN') {
        setFieldErrors({ username: err.message })
      } else if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
        setFieldErrors({ email: err.message })
      } else if (err instanceof ApiError || err instanceof NetworkError) {
        setFormError(err.message)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
      setSubmitting(false)
    }
  }

  const allFilled = values.username && values.email && values.password

  return (
    <AuthLayout heading="Join your campus community" cardTitle="One account. Request and deliver.">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField
          label="Username"
          name="username"
          autoComplete="username"
          value={values.username}
          onChange={update('username')}
          error={fieldErrors.username}
          required
        />
        <FormField
          label="Institutional email"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={update('email')}
          error={fieldErrors.email}
          required
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={update('password')}
          error={fieldErrors.password}
          required
        />
        <p className="text-xs text-slate-500">{RULES_HINT}</p>
        {formError && (
          <p className="text-sm text-red-600" role="alert">
            {formError}
          </p>
        )}
        <button type="submit" className={primaryButtonClass} disabled={submitting || !allFilled}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
