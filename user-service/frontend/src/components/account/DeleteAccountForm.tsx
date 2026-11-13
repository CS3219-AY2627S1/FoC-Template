// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { authFetch } from '@relay/user-auth-frontend-fetch'
import { useState, type SubmitEvent } from 'react'
import { ErrorMessage } from '@relay/ui'
import type { ApiResult } from '@relay/contracts'

export function DeleteAccountForm({
  username,
  onDeleted,
}: {
  username: string | null
  onDeleted: () => void
}) {
  const [confirmation, setConfirmation] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (!username || confirmation !== username) {
      setErrorMessage('Enter your username exactly as shown to continue.')
      return
    }
    setLoading(true)
    setErrorMessage('')
    try {
      const response = (await authFetch('/api/user/me', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      }).then((result) =>
        result.status === 204 ? { ok: true, data: undefined } : result.json(),
      )) as ApiResult<undefined>
      if (response.ok) onDeleted()
      else setErrorMessage(response.error.message)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete your account.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="account-section account-danger-zone" onSubmit={submit}>
      <div>
        <p>This permanently removes your credentials, username, and profile picture.</p>
      </div>
      {username ? (
        <label>
          Enter your username to confirm
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={username}
            autoComplete="off"
            required
          />
        </label>
      ) : (
        <ErrorMessage message="Set a username before deleting your account." variant="warning" />
      )}
      <ErrorMessage message={errorMessage} />
      <button className="glass-btn-red user-submit" disabled={loading || !username}>
        {loading ? 'Deleting account…' : 'Delete account'}
      </button>
    </form>
  )
}
