/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-14
 * Scope (AI-15): Implemented and tested the requested create-account UI.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import { useState, type SubmitEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { AuthShell } from '../components/auth/AuthShell'
import { useAuth } from '../features/auth/useAuth'

type LoginLocationState = {
  registrationComplete?: boolean
}

export function LoginPage() {
  const { signIn } = useAuth()
  const location = useLocation()
  const registrationComplete = (location.state as LoginLocationState | null)?.registrationComplete
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    try {
      await signIn({ email: email.trim(), password })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="WELCOME BACK"
      title="Sign in to Campus Couriers"
      description="Use your NUS email and password to continue."
      footer={
        <>
          New to Campus Couriers?{' '}
          <Link className="font-semibold text-[#175c45] hover:underline" to="/register">
            Create an account
          </Link>
        </>
      }
    >
      {registrationComplete ? (
        <p className="mt-6 rounded-lg bg-[#edf8f1] px-3 py-2 text-sm text-[#175c45]" role="status">
          Account created. Sign in with your new credentials.
        </p>
      ) : null}

      <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="text-sm font-medium" htmlFor="email">
                  NUS email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="e1234567@u.nus.edu"
                  className="mt-2 h-[50px] w-full rounded-xl border border-[#cfd8d1] bg-white px-4 text-sm outline-none transition placeholder:text-[#929c95] focus:border-[#175c45] focus:ring-4 focus:ring-[#175c45]/10"
                />
              </div>

              <div>
                <label className="text-sm font-medium" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="mt-2 h-[50px] w-full rounded-xl border border-[#cfd8d1] bg-white px-4 text-sm outline-none transition placeholder:text-[#929c95] focus:border-[#175c45] focus:ring-4 focus:ring-[#175c45]/10"
                />
              </div>

              {errorMessage ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="h-12 w-full cursor-pointer rounded-lg bg-[#d8f06b] text-sm font-semibold text-[#0d3c2d] transition hover:bg-[#cce85b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45] disabled:cursor-wait disabled:opacity-70"
              >
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
      </form>
    </AuthShell>
  )
}
