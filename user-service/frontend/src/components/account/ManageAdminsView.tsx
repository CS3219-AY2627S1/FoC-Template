// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { authFetch } from '@relay/user-auth-frontend-fetch'
import type { ApiResult, DemoteAdminToUserRequest, PromoteUserToAdminRequest } from '@relay/contracts/user-auth'
import { ErrorMessage, RelayButton } from '@relay/ui'
import { useState, type SubmitEvent } from 'react'
import { EmailField } from '../base-elements/EmailField'

type Action = 'promote' | 'demote'

function AdminRoleForm({ action }: { action: Action }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const promoting = action === 'promote'

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const body: PromoteUserToAdminRequest | DemoteAdminToUserRequest = { email: email.trim() }
      const response = await authFetch(`/api/auth/admin/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (response.status === 204) {
        setSuccess(`${body.email} has been ${promoting ? 'promoted to admin' : 'demoted to user'}.`)
        setEmail('')
      } else {
        const result = (await response.json()) as ApiResult<undefined>
        if (!result.ok) setError(result.error.message)
        else setError('Unexpected response from the server.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update the admin role.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="account-section" onSubmit={submit}>
      <h2>{promoting ? 'Promote a user' : 'Demote an admin'}</h2>
      <EmailField value={email} onChange={setEmail} />
      <ErrorMessage message={error} />
      <ErrorMessage message={success} variant="success" />
      <RelayButton variant="primary" type="submit" disabled={saving}>
        {saving ? 'Saving...' : promoting ? 'Promote to admin' : 'Demote to user'}
      </RelayButton>
    </form>
  )
}

export function ManageAdminsView() {
  return (
    <div className="manage-admins">
      <AdminRoleForm action="promote" />
      <hr className="manage-admins-divider" />
      <AdminRoleForm action="demote" />
    </div>
  )
}
