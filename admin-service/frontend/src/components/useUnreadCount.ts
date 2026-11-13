// Shared across every frontend's header. Keep the copies identical: notification-service owns it
// (see notification-service/README.md "Header bell").
import { useEffect, useState } from 'react'

const sessionKey = 'foc.user-session'
const sessionChangedEvent = 'foc:session-changed'
const sessionExpiredEvent = 'foc:session-expired'

/** DESIGN.md "Polling": the count only, about every 30 s while visible, backing off after errors. */
export const pollIntervalMs = 30_000
export const maxBackoffMs = 5 * 60_000

/** Fired by the Notifications page after marking one read, so the badge updates at once. */
export const unreadChangedEvent = 'foc:notifications-changed'

type StoredSession = { accessToken?: unknown; tokenType?: unknown; expiresAt?: unknown }

export function readToken(): string | null {
  try {
    const stored = sessionStorage.getItem(sessionKey)
    if (!stored) return null
    const session = JSON.parse(stored) as StoredSession
    if (
      typeof session.accessToken !== 'string' ||
      session.tokenType !== 'Bearer' ||
      typeof session.expiresAt !== 'string' ||
      !(Date.parse(session.expiresAt) > Date.now())
    ) {
      return null
    }
    return session.accessToken
  } catch {
    return null
  }
}

/**
 * The signed-in user's unread count, or null before the first answer. A failed poll keeps the last
 * known count (never a misleading 0); 401 means the session ended, so polling stops.
 */
export function useUnreadCount(): number | null {
  const [token, setToken] = useState(readToken)
  // The count is kept with the token it was fetched for, so a new or ended session never shows
  // the previous user's count.
  const [result, setResult] = useState<{ token: string; count: number | null } | null>(null)

  useEffect(() => {
    const refresh = () => setToken(readToken())
    window.addEventListener(sessionChangedEvent, refresh)
    window.addEventListener(sessionExpiredEvent, refresh)
    return () => {
      window.removeEventListener(sessionChangedEvent, refresh)
      window.removeEventListener(sessionExpiredEvent, refresh)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    const signedIn = token
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let delay = pollIntervalMs
    let controller: AbortController | undefined

    const schedule = (ms: number) => {
      clearTimeout(timer)
      if (!stopped) timer = setTimeout(poll, ms)
    }

    async function poll() {
      if (stopped) return
      if (document.visibilityState !== 'visible') return
      controller?.abort()
      controller = new AbortController()
      try {
        const response = await fetch('/api/notifications/me/unread-count', {
          headers: { Authorization: `Bearer ${signedIn}` },
          signal: controller.signal,
        })
        if (response.status === 401) {
          stopped = true
          setResult({ token: signedIn, count: null })
          return
        }
        if (!response.ok) throw new Error(`Unread count failed: ${response.status}`)
        const body = (await response.json()) as { unreadCount?: unknown }
        if (typeof body.unreadCount !== 'number') throw new Error('Unexpected unread count')
        setResult({ token: signedIn, count: body.unreadCount })
        delay = pollIntervalMs
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        delay = Math.min(delay * 2, maxBackoffMs)
      }
      schedule(delay)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule(0)
      else clearTimeout(timer)
    }
    const onUnreadChanged = () => schedule(0)

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener(unreadChangedEvent, onUnreadChanged)
    schedule(0)
    return () => {
      stopped = true
      clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener(unreadChangedEvent, onUnreadChanged)
    }
  }, [token])

  return token && result?.token === token ? result.count : null
}
