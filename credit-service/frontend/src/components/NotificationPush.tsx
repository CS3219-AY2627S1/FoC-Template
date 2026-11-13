// Shared across participant frontends. Keep every copy identical; Notification Service owns it.
import { Bell, MessageCircle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { readSession } from '../auth/session'
import './NotificationPush.css'

type PushItem = {
  id: string
  type: string
  orderId: string | null
  message: string
  occurredAt: string
}

type PushBatch = { items: PushItem[]; cursor: string }

const pollIntervalMs = 2_000
const visibleForMs = 5_000
const cursorPrefix = 'foc.notification-push-cursor.'

function isCurrentChat(item: PushItem) {
  if (item.type !== 'CHAT_MESSAGE_RECEIVED' || !item.orderId) return false
  const path = window.location.pathname.replace(/\/+$/, '')
  return path === `/errands/${item.orderId}/chat`
}

export function NotificationPush({ role }: { role?: string }) {
  const [items, setItems] = useState<PushItem[]>([])
  const timers = useRef(new Map<string, number>())

  useEffect(() => {
    if (!role || role === 'ADMIN') return
    const session = readSession()
    if (!session || session.role === 'ADMIN') return
    const signedIn = session
    const activeTimers = timers.current
    const cursorKey = `${cursorPrefix}${session.userId}`
    let cursor = sessionStorage.getItem(cursorKey)
    let stopped = false
    let pollTimer: number | undefined
    let request: AbortController | undefined

    const dismiss = (id: string) => {
      const timer = activeTimers.get(id)
      if (timer !== undefined) window.clearTimeout(timer)
      activeTimers.delete(id)
      setItems((current) => current.filter((item) => item.id !== id))
    }

    const show = (incoming: PushItem[]) => {
      const relevant = incoming.filter((item) => !isCurrentChat(item))
      setItems((current) => {
        const known = new Set(current.map((item) => item.id))
        return [...current, ...relevant.filter((item) => !known.has(item.id))].slice(-3)
      })
      for (const item of relevant) {
        if (activeTimers.has(item.id)) continue
        activeTimers.set(item.id, window.setTimeout(() => dismiss(item.id), visibleForMs))
      }
    }

    async function poll() {
      if (stopped || document.visibilityState !== 'visible') return
      request?.abort()
      request = new AbortController()
      const query = cursor ? `?after=${encodeURIComponent(cursor)}` : ''
      try {
        const response = await fetch(`/api/notifications/me/push${query}`, {
          headers: { Authorization: `${signedIn.tokenType} ${signedIn.accessToken}` },
          signal: request.signal,
        })
        if (response.status === 401) {
          stopped = true
          return
        }
        if (!response.ok) throw new Error(`Push poll failed: ${response.status}`)
        const batch = (await response.json()) as PushBatch
        if (!Array.isArray(batch.items) || typeof batch.cursor !== 'string') {
          throw new Error('Unexpected push response')
        }
        cursor = batch.cursor
        sessionStorage.setItem(cursorKey, cursor)
        show(batch.items)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
      if (!stopped) pollTimer = window.setTimeout(poll, pollIntervalMs)
    }

    const onVisibilityChange = () => {
      window.clearTimeout(pollTimer)
      if (document.visibilityState === 'visible') void poll()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    void poll()
    return () => {
      stopped = true
      request?.abort()
      window.clearTimeout(pollTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      for (const timer of activeTimers.values()) window.clearTimeout(timer)
      activeTimers.clear()
      setItems([])
    }
  }, [role])

  if (role === 'ADMIN' || items.length === 0) return null
  return (
    <section aria-label="Recent updates" aria-live="polite" className="push-notification-region">
      {items.map((item) => {
        const chat = item.type === 'CHAT_MESSAGE_RECEIVED'
        const Icon = chat ? MessageCircle : Bell
        const destination = item.orderId
          ? chat ? `/errands/${item.orderId}/chat` : `/errands/${item.orderId}`
          : null
        return (
          <article className="push-notification" key={item.id}>
            <span aria-hidden="true" className="push-notification-icon"><Icon /></span>
            <a
              aria-label={destination ? `${chat ? 'Open chat' : 'Open errand'}: ${item.message}` : undefined}
              aria-disabled={!destination || undefined}
              className="push-notification-content"
              href={destination ?? undefined}
            >
              <strong>{chat ? 'New chat message' : 'Errand update'}</strong>
              <span>{item.message}</span>
              {destination && <small>Click to view</small>}
            </a>
            <button
              aria-label="Dismiss notification"
              className="push-notification-close"
              onClick={() => {
                const timer = timers.current.get(item.id)
                if (timer !== undefined) window.clearTimeout(timer)
                timers.current.delete(item.id)
                setItems((current) => current.filter((candidate) => candidate.id !== item.id))
              }}
              type="button"
            ><X aria-hidden="true" /></button>
          </article>
        )
      })}
    </section>
  )
}
