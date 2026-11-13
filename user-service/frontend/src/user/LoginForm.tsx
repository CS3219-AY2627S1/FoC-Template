// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { authFetch } from '@relay/user-auth-frontend-fetch'
import { useState, type SubmitEvent } from 'react'
import type { ApiResult, LoginResponse } from '@relay/contracts/user-auth'
import { EmailField } from '../components/base-elements/EmailField'
import { PasswordField } from '../components/base-elements/PasswordField'
import { ErrorMessage, TextButton } from '@relay/ui'

export function LoginForm({
  onLoggedIn,
  switchToRegister,
  onVerificationRequired,
  notice,
}: {
  onLoggedIn: (
    email: string,
    password: string,
    emailVerified: boolean,
    profileCreated: boolean,
  ) => void | Promise<void>
  switchToRegister: () => void
  onVerificationRequired: (email: string, password: string) => void
  notice?: string
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: SubmitEvent) {
    event.preventDefault()

    setLoading(true)
    setErrorMessage('')

    const response = (await authFetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then((result) => result.json())) as ApiResult<LoginResponse>
    if (response.ok) {
      if (!response.data?.user) {
        setErrorMessage('The User Service returned an invalid session response.')
        setLoading(false)
        return
      }
      const profile = await authFetch('/api/user/me', { credentials: 'include' })
      if (!profile.ok && profile.status !== 404) {
        setErrorMessage('Unable to load your profile.')
        setLoading(false)
        return
      }
      await onLoggedIn(email, password, response.data.user.emailVerified, profile.ok)
    } else if (response.error.code === 'EMAIL_NOT_VERIFIED') {
      onVerificationRequired(email, password)
    } else {
      setErrorMessage(response.error.fieldErrors?.email ?? response.error.message)
    }
    setLoading(false)
  }

  return (
    <form className="user-form" onSubmit={submit}>
      <div className="user-form-heading">
        <h1>Login</h1>
        <p>Welcome back!</p>
      </div>
      <EmailField value={email} onChange={setEmail} />
      <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
      <ErrorMessage message={notice ?? ''} variant="success" />
      <ErrorMessage message={errorMessage} />
      <button className="glass-btn-primary user-submit" disabled={loading}>
        {loading ? 'Logging in…' : 'Login'}
      </button>
      <p className="user-switch">
        Need an account?&nbsp;
        <TextButton onClick={switchToRegister}>Register</TextButton>
      </p>
    </form>
  )
}
