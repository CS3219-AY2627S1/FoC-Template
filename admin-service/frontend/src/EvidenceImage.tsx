import { useEffect, useState } from 'react'
import { readSession } from './auth/session'

export function EvidenceImage({
  caseId,
  messageId,
  filename,
}: {
  caseId: string
  messageId: string
  filename: string
}) {
  const scope = caseId + '/' + messageId
  const token = readSession()?.accessToken
  const [image, setImage] = useState<{
    token?: string
    scope: string
    url: string
  }>()
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let url: string | undefined
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    void fetch(`/api/admin/cases/${caseId}/messages/${messageId}/attachment`, {
      headers: { Authorization: `Bearer ${token || ''}` },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Image unavailable')
        const blob = await response.blob()
        if (
          !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) ||
          blob.size > 5242880
        )
          throw new Error('Invalid image')
        if (active) {
          url = URL.createObjectURL(blob)
          setImage({ token, scope, url })
          setError(false)
        }
      })
      .catch(() => {
        if (active) {
          setImage(undefined)
          setError(true)
        }
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      active = false
      controller.abort()
      clearTimeout(timeout)
      if (url) URL.revokeObjectURL(url)
    }
  }, [caseId, messageId, token, scope, attempt])
  return image && image.token === token && image.scope === scope ? (
    <img
      src={image.url}
      alt={`Shared image: ${filename}`}
      style={{ maxWidth: '100%', maxHeight: '30rem', objectFit: 'contain' }}
    />
  ) : error ? (
    <p role="alert">
      Image unavailable.{' '}
      <button type="button" onClick={() => setAttempt((n) => n + 1)}>
        Retry image
      </button>
    </p>
  ) : (
    <p role="status">Loading image…</p>
  )
}
