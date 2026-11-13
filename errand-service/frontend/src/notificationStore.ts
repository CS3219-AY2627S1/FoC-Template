import type { ErrandNotification } from '@relay/contracts'

export type SavedNotification = ErrandNotification & { errandName: string }
type Snapshot = { notifications: SavedNotification[]; queue: string[] }
type NotificationStorage = Pick<Storage, 'getItem' | 'setItem'>

export function isErrandNotification(value: unknown): value is ErrandNotification {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  const statuses = [
    'OPEN',
    'ACCEPTED',
    'PICKED_UP',
    'DELIVERED',
    'CONFIRMED',
    'CANCELLED',
    'EXPIRED',
    'DELETED',
  ]
  return (
    typeof event.eventId === 'string' &&
    event.eventId.length > 0 &&
    typeof event.errandId === 'string' &&
    event.errandId.length > 0 &&
    typeof event.timestamp === 'string' &&
    Number.isFinite(Date.parse(event.timestamp)) &&
    ['ERRAND_CREATED', 'ERRAND_STATUS_CHANGED', 'ERRAND_DELETED'].includes(event.type as string) &&
    statuses.includes(event.newStatus as string) &&
    statuses.includes(event.oldStatus as string)
  )
}

/** Account-scoped history. Only live arrivals enter the transient popup queue. */
export function createNotificationStore(subject?: string, storage?: NotificationStorage) {
  const key = subject ? `relay:errand-notifications:v1:${subject}` : undefined
  const seen = new Set<string>()
  let snapshot: Snapshot = { notifications: [], queue: [] }
  const listeners = new Set<() => void>()
  if (key && storage) {
    try {
      const saved = JSON.parse(storage.getItem(key) ?? 'null')
      if (Array.isArray(saved?.notifications)) {
        snapshot.notifications = saved.notifications.filter(
          (item: unknown) =>
            isErrandNotification(item) &&
            typeof (item as SavedNotification).errandName === 'string',
        )
      }
      if (Array.isArray(saved?.seen)) {
        saved.seen.forEach((id: unknown) => {
          if (typeof id === 'string') seen.add(id)
        })
      }
      snapshot.notifications.forEach((item) => seen.add(item.eventId))
    } catch {
      /* Unavailable or invalid browser storage falls back to memory. */
    }
  }
  const publish = () => {
    if (key && storage) {
      try {
        storage.setItem(
          key,
          JSON.stringify({ notifications: snapshot.notifications, seen: [...seen] }),
        )
      } catch {
        /* Keep the complete in-memory history if storage is blocked or full. */
      }
    }
    listeners.forEach((listener) => listener())
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    add(event: ErrandNotification, errandName: string) {
      if (!subject || seen.has(event.eventId)) return
      seen.add(event.eventId)
      snapshot = {
        notifications: [{ ...event, errandName }, ...snapshot.notifications],
        queue: [...snapshot.queue, event.eventId],
      }
      publish()
    },
    nameErrand(errandId: string, name: string) {
      snapshot = {
        ...snapshot,
        notifications: snapshot.notifications.map((item) =>
          item.errandId === errandId ? { ...item, errandName: name } : item,
        ),
      }
      publish()
    },
    dismiss(eventId: string) {
      snapshot = { ...snapshot, queue: snapshot.queue.filter((id) => id !== eventId) }
      listeners.forEach((listener) => listener())
    },
    remove(eventId: string) {
      snapshot = {
        notifications: snapshot.notifications.filter((item) => item.eventId !== eventId),
        queue: snapshot.queue.filter((id) => id !== eventId),
      }
      publish()
    },
  }
}
