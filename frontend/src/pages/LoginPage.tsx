/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Sign-in page calling the User Service login endpoint via AuthProvider.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { useState, type FormEvent } from 'react'
import { useLocation } from 'react-router'
import { ApiError, NetworkError } from '../api/client'
import { useAuth } from '../auth/authContext'
import type { LoginPageState } from '../auth/AuthProvider'
import { FormField } from '../components/FormField'
import { APP_NAME } from '../config'
import { AuthLayout, primaryButtonClass } from './AuthLayout'

export function LoginPage() {
  const auth = useAuth()
  // Message to show above the form: either passed by the page that sent us here
  // ("Account created"), or the reason the last session ended ("Session expired")
  const notice = (useLocation().state as LoginPageState | null)?.notice ?? auth.notice

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await auth.login(identifier, password)
      // Nothing else to do: once logged in, the /login route redirects to the landing page
    } catch (err) {
      // 401 -> "Invalid username/email or password" (deliberately vague, US-F3.1.1)
      // 403 -> "This account is suspended" etc. (US-F3.1.2)
      if (err instanceof ApiError || err instanceof NetworkError) setError(err.message)
      else setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout heading="Welcome back" cardTitle={`Sign in to ${APP_NAME}`}>
      {notice && (
        <p className="mb-4 rounded-lg bg-navy-100 px-3 py-2 text-sm text-navy-900" role="status">
          {notice}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField
          label="Username or email"
          name="identifier"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={primaryButtonClass} disabled={submitting || !identifier || !password}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  )
}
