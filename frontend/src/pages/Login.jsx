/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Created the /login page, per instructions.md Stage 16b, replacing LoginModal. Reuses
 *        LoginModal's fields and copy. Shows a success banner from router state (for 16c/16d)
 *        and, as a small addition beyond the spec, an informational banner for the `reason`
 *        AuthContext.requireAuth passes along when it redirects here (the old modal showed
 *        this reason text too; dropping it entirely felt like a regression, and the spec
 *        doesn't forbid showing it).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Also shows AuthContext.forceReauth's message (Stage 16e, after a password change) via
 *        consumePendingAuthMessage — see AuthContext.jsx for why that message travels outside
 *        router state. Read once with a lazy useState initializer (so it survives whichever
 *        redirect actually lands on this page) and cleared by its own effect.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Replaced the raw password input with PasswordInput (Stage 21b) for a show/hide toggle.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Bug fix: ignore location.state.from as a post-login redirect target when it points at
 *        /login or /register, so logging in while sitting on the register page (e.g. via the
 *        nav's "Log in" button, which captures the current page as `from`) no longer bounces
 *        the user back to the register/create-account page after a successful login.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import FormBanner from '../components/FormBanner'
import Logo from '../components/Logo'
import PasswordInput from '../components/PasswordInput'
import { clearPendingAuthMessage, consumePendingAuthMessage, useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [forcedMessage] = useState(consumePendingAuthMessage)

  useEffect(() => {
    clearPendingAuthMessage()
  }, [])

  const successMessage = location.state?.successMessage ?? forcedMessage
  const reason = location.state?.reason

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(identifier, password)
      const from = location.state?.from
      const fromPath = typeof from === 'string' ? from : from?.pathname
      const isAuthPage = fromPath === '/login' || fromPath === '/register'
      navigate(isAuthPage ? '/' : from ?? '/', { replace: true })
    } catch (err) {
      if (err.code === 'ACCOUNT_NOT_VERIFIED') {
        navigate('/register', {
          state: { step: 'otp', email: identifier.includes('@') ? identifier : null },
        })
        return
      }
      setError(
        err.code === 'INVALID_CREDENTIALS'
          ? 'Wrong username/email or password.'
          : err.code === 'ACCOUNT_SUSPENDED'
            ? 'This account has been suspended.'
            : err.message,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-width page-gutter flex min-h-[calc(100vh-4rem)] items-center justify-center py-10">
      <div className="w-full max-w-[440px]">
        <Logo asLink={false} />
        <h1 className="font-display mt-5 text-2xl font-bold text-ink">Log in to continue</h1>

        <div className="mt-4">
          <FormBanner type="success" message={successMessage} />
          <FormBanner type="info" message={!successMessage ? reason : null} />
          <FormBanner type="error" message={error} />
        </div>

        <form className="mt-2 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-ink">Email or username</span>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-surface-alt px-3 text-base text-ink"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Password</span>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-surface-alt px-3 text-base text-ink"
            />
          </label>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </Button>
          <div className="text-center">
            <Link to="/forgot-password" className="text-sm font-medium text-blue hover:underline">
              Forgot password?
            </Link>
          </div>
        </form>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-ink-40">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <Button as={Link} to="/register" variant="secondary" size="lg" className="w-full">
          Create an account
        </Button>
      </div>
    </div>
  )
}
