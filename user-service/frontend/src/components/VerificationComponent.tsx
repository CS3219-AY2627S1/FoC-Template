// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { authFetch } from '@relay/user-auth-frontend-fetch'
import { useState, type SubmitEvent } from 'react'
import { ErrorMessage, TextButton } from '@relay/ui'
import { VerificationCodeField } from './VerificationCodeField'
import type {
  ApiResult,
  ResendVerificationRequest,
  SubmitOtpAndLoginResponse,
} from '@relay/contracts/user-auth'

export function VerificationComponent({
  email,
  password,
  onVerified,
  onBack,
  backLabel = 'Back to registration',
}: {
  email: string
  password: string
  onVerified: (profileCreated: boolean) => void | Promise<void>
  onBack?: () => void
  backLabel?: string
}) {
  const [code, setCode] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    setLoading(true)
    setErrorMessage('')

    const response = (await authFetch('/api/auth/verification/confirm-and-login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, code }),
    }).then((result) => result.json())) as ApiResult<SubmitOtpAndLoginResponse>
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
      await onVerified(profile.ok)
    } else {
      setErrorMessage(response.error.message)
    }
    setLoading(false)
  }

  async function resend() {
    setResending(true)
    setErrorMessage('')

    try {
      const response = (await authFetch('/api/auth/verification/resend', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email } satisfies ResendVerificationRequest),
      }).then((result) =>
        result.status === 204 ? { ok: true, data: undefined } : result.json(),
      )) as ApiResult<undefined>
      if (response.ok) {
        setCode('')
      } else {
        setErrorMessage(response.error.message)
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : ((error as { message?: string }).message ?? 'Unable to send a new code.'),
      )
    } finally {
      setResending(false)
    }
  }

  return (
    <form className="verification-component" onSubmit={submit}>
      <VerificationCodeField value={code} onChange={setCode} />
      <ErrorMessage message={errorMessage} />
      <button className="glass-btn-primary user-submit" disabled={loading}>
        {loading ? 'Verifying…' : 'Verify email'}
      </button>
      <TextButton onClick={() => void resend()} disabled={resending}>
        {resending ? 'Sending…' : 'Send a new code'}
      </TextButton>
      {onBack && (
        <button type="button" className="user-secondary" onClick={onBack}>
          {backLabel}
        </button>
      )}
    </form>
  )
}
