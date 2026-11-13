import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { createNotificationStore } from '../notificationStore'

export const NOTIFICATION_POPUP_MS = 12_000

export function useNotificationHistory(subject: string | undefined, paused: boolean) {
  const store = useMemo(() => {
    let storage: Storage | undefined
    // A signed-in Relay user already has authentication cookies in this browser.
    if (subject) {
      try {
        storage = window.localStorage
      } catch {
        /* Use memory if unavailable. */
      }
    }
    return createNotificationStore(subject, storage)
  }, [subject])
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const popupId = snapshot.queue[0]
  useEffect(() => {
    if (paused || !popupId) return
    const timer = window.setTimeout(() => store.dismiss(popupId), NOTIFICATION_POPUP_MS)
    return () => window.clearTimeout(timer)
  }, [paused, popupId, store])
  return {
    ...snapshot,
    popup: snapshot.notifications.find((item) => item.eventId === popupId),
    store,
  }
}
