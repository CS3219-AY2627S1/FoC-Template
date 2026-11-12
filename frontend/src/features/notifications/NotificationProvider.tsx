/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-08
 * Scope (AI-07): Implemented and tested mark-as-read on notification clicks.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-09
 * Scope: Implementation and test assistance for live notification state.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  notificationHistoryLimit,
  openNotificationStream,
} from './notification.api'
import { NotificationContext, type NotificationContextValue } from './notification.context'
import type { NotificationConnection, NotificationItem, NotificationListener } from './notification.types'

function mergeItems(previous: NotificationItem[], incoming: NotificationItem[]) {
  const items = new Map(previous.map((item) => [item.id, item]))
  for (const item of incoming) {
    items.set(item.id, { ...item, readAt: item.readAt ?? items.get(item.id)?.readAt ?? null })
  }
  return [...items.values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, notificationHistoryLimit)
}

function loadHiddenIds(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

export function NotificationProvider({ children }: PropsWithChildren) {
  const { status, currentUserId } = useAuth()
  if (status !== 'authenticated' || !currentUserId) return <>{children}</>
  return <NotificationSession key={currentUserId} userId={currentUserId}>{children}</NotificationSession>
}

function NotificationSession({ children, userId }: PropsWithChildren<{ userId: string }>) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [historyStatus, setHistoryStatus] = useState<NotificationContextValue['historyStatus']>('loading')
  const [connection, setConnection] = useState<NotificationConnection>('connecting')
  const sessionRef = useRef<AbortController | null>(null)
  const historyRequest = useRef<AbortController | null>(null)
  const countRequest = useRef<AbortController | null>(null)
  const listeners = useRef(new Set<NotificationListener>())
  const hiddenStorageKey = `hidden-chat-notifications:${userId}`
  const hiddenIds = useRef(loadHiddenIds(hiddenStorageKey))

  const subscribe = useCallback((listener: NotificationListener) => {
    const subscribers = listeners.current
    subscribers.add(listener)
    return () => { subscribers.delete(listener) }
  }, [])

  const refreshUnreadCount = useCallback(async () => {
    const session = sessionRef.current
    if (!session || session.signal.aborted) return
    countRequest.current?.abort()
    const request = new AbortController()
    countRequest.current = request
    const signal = AbortSignal.any([session.signal, request.signal])
    try {
      const count = await getUnreadCount(signal)
      if (!signal.aborted) setUnreadCount(count)
    } catch {
      // Keep the last confirmed count until a refresh succeeds.
    }
  }, [])

  const refreshHistory = useCallback(async () => {
    const session = sessionRef.current
    if (!session || session.signal.aborted) return
    historyRequest.current?.abort()
    const request = new AbortController()
    historyRequest.current = request
    const signal = AbortSignal.any([session.signal, request.signal])
    try {
      const history = await getNotifications(signal)
      if (signal.aborted) return
      setItems((previous) => mergeItems(previous, history.filter((item) => !hiddenIds.current.has(item.id))))
      setHistoryStatus('ready')
    } catch {
      if (!signal.aborted) setHistoryStatus('error')
    }
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([refreshHistory(), refreshUnreadCount()])
  }, [refreshHistory, refreshUnreadCount])

  const markRead = useCallback(async (ids: readonly string[]) => {
    const signal = sessionRef.current?.signal
    if (!signal || signal.aborted) return
    const results = await Promise.allSettled(ids.map((id) => markNotificationRead(id, signal)))
    if (signal.aborted) return
    await refresh()
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('Could not update all selected notifications.')
    }
  }, [refresh])

  const markAllRead = useCallback(async () => {
    const signal = sessionRef.current?.signal
    if (!signal || signal.aborted) return
    await markAllNotificationsRead(signal)
    if (!signal.aborted) await refresh()
  }, [refresh])

  const hide = useCallback((ids: readonly string[]) => {
    ids.forEach((id) => hiddenIds.current.add(id))
    localStorage.setItem(hiddenStorageKey, JSON.stringify([...hiddenIds.current].slice(-500)))
    setItems((current) => current.filter((item) => !ids.includes(item.id)))
  }, [hiddenStorageKey])

  useEffect(() => {
    const session = new AbortController()
    sessionRef.current = session
    // Defer startup so React's development cleanup can cancel the first mount.
    queueMicrotask(() => {
      if (session.signal.aborted) return
      void refresh()
      void openNotificationStream({
        signal: session.signal,
        onConnected() {
          if (session.signal.aborted) return
          setConnection('connected')
          void refresh()
          listeners.current.forEach((listener) => listener({ type: 'connected' }))
        },
        onNotification(item) {
          if (session.signal.aborted) return
          setItems((previous) => mergeItems(previous, [item]))
          void refreshUnreadCount()
          listeners.current.forEach((listener) => listener({ type: 'notification', item }))
        },
        onReconnect() {
          if (!session.signal.aborted) setConnection('reconnecting')
        },
      }).catch(() => {
        if (!session.signal.aborted) setConnection('unavailable')
      })
    })
    return () => {
      session.abort()
      sessionRef.current = null
    }
  }, [refresh, refreshUnreadCount])

  const value = useMemo<NotificationContextValue>(
    () => ({ items, unreadCount, historyStatus, connection, refresh, markRead, markAllRead, hide, subscribe }),
    [items, unreadCount, historyStatus, connection, refresh, markRead, markAllRead, hide, subscribe],
  )
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
