/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-14
 * Scope (AI-15): Implemented and tested the requested create-account UI.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import { useState, type SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { AuthShell } from '../components/auth/AuthShell'
import { register } from '../features/auth/auth.api'

const NUS_EMAIL_PATTERN = String.raw`^[A-Za-z0-9._%+\-]+@(?:.+\.|yale-|duke-)?nus\.edu(?:\.sg)?$`
const PASSWORD_PATTERN = String.raw`^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{16,128}$`

export function RegisterPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    try {
      await register({ name: name.trim(), email: email.trim(), password })
      navigate('/login', { replace: true, state: { registrationComplete: true } })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create your account.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="JOIN THE COMMUNITY"
      title="Create your account"
      description="Register with your NUS email to start requesting and completing campus errands."
      footer={
        <>
          Already have an account?{' '}
          <Link className="font-semibold text-[#175c45] hover:underline" to="/login">
            Back to sign in
          </Link>
        </>
      }
    >
      <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={50}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your full name"
            className="mt-2 h-[50px] w-full rounded-xl border border-[#cfd8d1] bg-white px-4 text-sm outline-none transition placeholder:text-[#929c95] focus:border-[#175c45] focus:ring-4 focus:ring-[#175c45]/10"
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="register-email">
            NUS email
          </label>
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            pattern={NUS_EMAIL_PATTERN}
            title="Enter a valid NUS email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="e1234567@u.nus.edu"
            className="mt-2 h-[50px] w-full rounded-xl border border-[#cfd8d1] bg-white px-4 text-sm outline-none transition placeholder:text-[#929c95] focus:border-[#175c45] focus:ring-4 focus:ring-[#175c45]/10"
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="register-password">
            Password
          </label>
          <input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={16}
            maxLength={128}
            pattern={PASSWORD_PATTERN}
            title="Use 16 or more characters with uppercase, lowercase, a number, and a special character"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a secure password"
            aria-describedby="password-requirements"
            className="mt-2 h-[50px] w-full rounded-xl border border-[#cfd8d1] bg-white px-4 text-sm outline-none transition placeholder:text-[#929c95] focus:border-[#175c45] focus:ring-4 focus:ring-[#175c45]/10"
          />
          <p id="password-requirements" className="mt-2 text-xs leading-5 text-[#68736c]">
            Use 16–128 characters with uppercase, lowercase, a number, and a special character.
          </p>
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
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  )
}
