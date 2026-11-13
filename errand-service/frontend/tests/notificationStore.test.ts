import { beforeEach, describe, expect, it } from 'vitest'
import { createNotificationStore, isErrandNotification } from '../src/notificationStore'

export const event = (eventId = 'event-1') => ({
  eventId,
  errandId: 'errand-1',
  type: 'ERRAND_STATUS_CHANGED' as const,
  timestamp: '2026-11-09T10:00:00Z',
  oldStatus: 'ACCEPTED' as const,
  newStatus: 'PICKED_UP' as const,
})

beforeEach(() => window.localStorage.clear())

describe('notification history', () => {
  it('queues in arrival order, stores newest first, and dismisses without deleting', () => {
    const store = createNotificationStore('alice', window.localStorage)
    store.add(event('one'), 'Lunch')
    store.add(event('two'), 'Lunch')
    store.add(event('one'), 'Lunch')
    expect(store.getSnapshot().queue).toEqual(['one', 'two'])
    expect(store.getSnapshot().notifications.map((item) => item.eventId)).toEqual(['two', 'one'])
    store.dismiss('one')
    expect(store.getSnapshot().queue).toEqual(['two'])
    expect(store.getSnapshot().notifications).toHaveLength(2)
  })

  it('restores history without replaying popups and remembers deleted event IDs', () => {
    const store = createNotificationStore('alice', window.localStorage)
    store.add(event('one'), 'Lunch')
    store.add(event('two'), 'Lunch')
    store.remove('one')
    const restored = createNotificationStore('alice', window.localStorage)
    restored.add(event('one'), 'Lunch')
    expect(restored.getSnapshot().queue).toEqual([])
    expect(restored.getSnapshot().notifications.map((item) => item.eventId)).toEqual(['two'])
    expect(createNotificationStore('bob', window.localStorage).getSnapshot().notifications).toEqual(
      [],
    )
  })

  it('keeps history in memory if storage is blocked, full, or corrupted', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
    }
    const store = createNotificationStore('alice', blocked)
    store.add(event(), 'Lunch')
    expect(store.getSnapshot().notifications).toHaveLength(1)
    window.localStorage.setItem('relay:errand-notifications:v1:alice', '{broken')
    expect(
      createNotificationStore('alice', window.localStorage).getSnapshot().notifications,
    ).toEqual([])
    const anonymous = createNotificationStore(undefined, window.localStorage)
    anonymous.add(event(), 'Lunch')
    expect(anonymous.getSnapshot().notifications).toEqual([])
  })

  it('rejects malformed events and unsupported event types', () => {
    expect(isErrandNotification(event())).toBe(true)
    expect(isErrandNotification({ ...event(), timestamp: 'bad' })).toBe(false)
    expect(isErrandNotification({ ...event(), type: 'heartbeat' })).toBe(false)
    expect(isErrandNotification({ ...event(), newStatus: 'unknown' })).toBe(false)
  })
})
