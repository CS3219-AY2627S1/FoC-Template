// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { authFetch } from '@relay/user-auth-frontend-fetch'
import { useState, type SubmitEvent } from 'react'
import type { ApiResult, ImageDataUrl, Session, UpdateUserResponse } from '@relay/contracts'
import { ErrorMessage, RelayButton, RelayFormSurface } from '@relay/ui'
import { ImageUploadField } from '../base-elements/ImageUploadField'
import { UsernameField } from '../base-elements/UsernameField'
import { usernameError } from '../../validation/validation'

export function ProfileSetupForm({
  onComplete,
}: {
  validateSession?: () => Promise<Session>
  onComplete: () => void | Promise<void>
}) {
  const [username, setUsername] = useState('')
  const [picture, setPicture] = useState<ImageDataUrl>()
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const validationError = usernameError(username)
    if (validationError) {
      setErrorMessage(validationError)
      return
    }
    setLoading(true)
    setErrorMessage('')
    try {
      const response = (await authFetch('/api/user/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, profilePicture: picture }),
      }).then((result) => result.json())) as ApiResult<UpdateUserResponse>
      if (!response.ok) {
        setErrorMessage(response.error.message)
        return
      }
      await onComplete()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Profile setup failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <RelayFormSurface
      title="Set up your profile"
      description="Choose how other Relay users will see you."
    >
      <form onSubmit={submit}>
        <UsernameField value={username} onChange={setUsername} />
        <ImageUploadField value={picture} onChange={setPicture} />
        <ErrorMessage message={errorMessage} />
        <RelayButton variant="primary" type="submit" disabled={loading}>
          {loading ? 'Saving profile…' : 'Finish setup'}
        </RelayButton>
      </form>
    </RelayFormSurface>
  )
}
