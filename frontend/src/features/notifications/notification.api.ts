/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-09
 * Scope: Implementation and test assistance for chat notification integration.
 */
import { EventStreamContentType, fetchEventSource } from '@microsoft/fetch-event-source'
import { authenticatedFetch } from '../auth/auth.fetch'
import type { NotificationItem } from './notification.types'

const baseUrl = (
  import.meta.env.VITE_NOTIFICATION_API_URL ??
  (import.meta.env.DEV ? 'http://localhost:8004' : '')
).trim().replace(/\/+$/, '')

export const notificationHistoryLimit = 20

function isNotification(value: unknown): value is NotificationItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<NotificationItem>
  const data = item.data as Partial<NotificationItem['data']> | undefined
  return typeof item.id === 'string' && item.id.length > 0
    && typeof item.type === 'string'
    && Boolean(data) && typeof data?.errandId === 'string' && data.errandId.length > 0
    && (item.type !== 'CHAT_MESSAGE' || (
      typeof data.conversationId === 'string' && data.conversationId.length > 0
      && typeof data.messageId === 'string' && data.messageId.length > 0
    ))
    && typeof item.message === 'string'
    && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt))
    && (item.readAt === null || typeof item.readAt === 'string')
}

export async function getNotifications(signal: AbortSignal): Promise<NotificationItem[]> {
  const response = await authenticatedFetch(`${baseUrl}/notifications?limit=${notificationHistoryLimit}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error('Could not load your notifications.')

  const { items } = await response.json() as { items?: unknown }
  if (!Array.isArray(items) || !items.every(isNotification)) {
    throw new Error('Could not load your notifications.')
  }
  return items
}

export async function getUnreadCount(signal: AbortSignal): Promise<number> {
  const response = await authenticatedFetch(`${baseUrl}/notifications/unread-count`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error('Could not load your unread count.')

  const { count } = await response.json() as { count?: unknown }
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new Error('Could not load your unread count.')
  }
  return count
}

export async function markNotificationRead(id: string, signal: AbortSignal): Promise<void> {
  const response = await authenticatedFetch(`${baseUrl}/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PATCH',
    signal,
  })
  if (!response.ok) throw new Error('Could not mark the notification as read.')
}

export async function markAllNotificationsRead(signal: AbortSignal): Promise<void> {
  const response = await authenticatedFetch(`${baseUrl}/notifications/read-all`, {
    method: 'POST',
    signal,
  })
  if (!response.ok) throw new Error('Could not mark all notifications as read.')
}

class StreamAccessError extends Error {}

export function openNotificationStream({
  signal, onConnected, onNotification, onReconnect,
}: {
  signal: AbortSignal
  onConnected: () => void
  onNotification: (item: NotificationItem) => void
  onReconnect: () => void
}) {
  let retryDelay = 1000

  return fetchEventSource(`${baseUrl}/notifications/stream`, {
    fetch: authenticatedFetch,
    signal,
    openWhenHidden: true,
    async onopen(response) {
      if (signal.aborted) return
      if (response.status === 401 || response.status === 403) throw new StreamAccessError()
      if (!response.ok || !response.headers.get('content-type')?.startsWith(EventStreamContentType)) {
        throw new Error('Notification stream is unavailable.')
      }
    },
    onmessage(event) {
      if (signal.aborted) return
      if (event.event === 'connected') {
        retryDelay = 1000
        onConnected()
      }
      if (event.event === 'notification') {
        let value: unknown
        try {
          value = JSON.parse(event.data)
        } catch {
          return
        }
        if (isNotification(value)) onNotification(value)
      }
    },
    onclose() {
      throw new Error('Notification stream closed.')
    },
    onerror(error) {
      if (signal.aborted || error instanceof StreamAccessError) throw error
      onReconnect()
      const delay = retryDelay
      retryDelay = Math.min(retryDelay * 2, 30_000)
      return delay
    },
  })
}
