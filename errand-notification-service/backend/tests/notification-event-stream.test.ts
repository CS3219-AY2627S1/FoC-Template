// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next), ChatGPT (model: GPT-6 Sol)
// Date: 2026-11-02, 2026-11-05
// Scope: Generated tests for SSE subscription, publication, timeout, and cleanup behavior.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly, generated tests for notification stream shutdown and subscriber cleanup
// tested the intended behavior. Corrected tests where necessary.

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { type ServerResponse } from 'node:http'
import type { ErrandNotification, ErrandNotificationType } from '@relay/contracts'
import { ErrandNotificationEventStream } from '../src/services/notificationEventStream.js'
import { ErrandNotificationTypes } from '@relay/contracts'

// Mock types
type MockServerResponse = Partial<ServerResponse> & {
  write: vi.Mock<ServerResponse, [string, () => void]>
}

describe('ErrandNotificationEventStream', () => {
  let stream: ErrandNotificationEventStream
  let mockResponse1: MockServerResponse
  let mockResponse2: MockServerResponse

  beforeEach(() => {
    stream = new ErrandNotificationEventStream()
    mockResponse1 = {
      write: vi.fn((data, cb) => cb()),
      end: vi.fn(),
    }
    mockResponse2 = {
      write: vi.fn((data, cb) => cb()),
      end: vi.fn(),
    }
  })

  // Helper to access private subscribers map for testing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getSubscribersMap = (
    s: ErrandNotificationEventStream,
  ): Map<string, Map<string, unknown>> | undefined => {
    return (s as any).subscribers
  }

  describe('subscribe', () => {
    it('should subscribe a user and store their response', () => {
      const subscriptionId = stream.subscribe('user1', mockResponse1 as ServerResponse)

      const subs = getSubscribersMap(stream)
      expect(subs).toBeDefined()
      expect(subs?.get('user1')).toBeDefined()
      expect(subs?.get('user1')?.size).toBe(1)

      // Check that the Map has the subscription
      const subscribersMap = subs?.get('user1')
      const hasSubscription =
        subscribersMap &&
        Array.from(subscribersMap.values()).some(
          (s: unknown) => (s as { response: ServerResponse }).response === mockResponse1,
        )
      expect(hasSubscription).toBe(true)
    })

    it('should handle multiple users subscribing', () => {
      stream.subscribe('user1', mockResponse1 as ServerResponse)
      stream.subscribe('user2', mockResponse2 as ServerResponse)

      expect(getSubscribersMap(stream)?.get('user1')?.size).toBe(1)
      expect(getSubscribersMap(stream)?.get('user2')?.size).toBe(1)
    })

    it('should handle multiple subscriptions for the same user', () => {
      const mockResponse3 = { write: vi.fn((data, cb) => cb()), end: vi.fn() } as MockServerResponse
      stream.subscribe('user1', mockResponse1 as ServerResponse)
      stream.subscribe('user1', mockResponse2 as ServerResponse)
      stream.subscribe('user1', mockResponse3 as MockServerResponse as ServerResponse)

      const subs = getSubscribersMap(stream)?.get('user1')
      expect(subs?.size).toBe(3)
    })

    it('should return subscriptionId for unsubscribe calls', () => {
      const subscriptionId = stream.subscribe('user1', mockResponse1 as ServerResponse)
      expect(subscriptionId).toBeDefined()
      expect(typeof subscriptionId).toBe('string')

      // After unsubscribe with this ID, the subscription should be removed
      stream.unsubscribe('user1', subscriptionId)
      // After removing the only subscription, the user entry is cleaned up
      expect(getSubscribersMap(stream)?.has('user1')).toBe(false)

      // Verify we can create a new subscription for the same user
      const newSubId = stream.subscribe('user1', mockResponse1 as ServerResponse)
      expect(newSubId).not.toBe(subscriptionId)
      expect(getSubscribersMap(stream)?.get('user1')?.size).toBe(1)
    })
  })

  describe('unsubscribe', () => {
    it('should unsubscribe a user and remove their response', () => {
      stream.subscribe('user1', mockResponse1 as ServerResponse)
      stream.unsubscribe('user1')

      expect(getSubscribersMap(stream)?.has('user1')).toBe(false)
    })

    it('should handle unsubscribe for non-existent user', () => {
      expect(() => stream.unsubscribe('nonexistent')).not.toThrow()
    })

    it('should keep other users when one unsubscribes', () => {
      stream.subscribe('user1', mockResponse1 as ServerResponse)
      stream.subscribe('user2', mockResponse2 as ServerResponse)
      stream.unsubscribe('user1')

      expect(getSubscribersMap(stream)?.has('user1')).toBe(false)
      expect(getSubscribersMap(stream)?.get('user2')?.size).toBe(1)
    })

    it('should unsubscribe specific subscription when subscriptionId provided', () => {
      const sub1 = stream.subscribe('user1', mockResponse1 as ServerResponse)
      const sub2 = stream.subscribe('user1', mockResponse2 as ServerResponse)

      expect(getSubscribersMap(stream)?.get('user1')?.size).toBe(2)

      // Unsubscribe only the first subscription
      stream.unsubscribe('user1', sub1)
      expect(getSubscribersMap(stream)?.get('user1')?.size).toBe(1)

      // Unsubscribe the second subscription - after this, the user entry is cleaned up
      stream.unsubscribe('user1', sub2)
      // User entry should be removed after last subscription is unsubscribed
      expect(getSubscribersMap(stream)?.has('user1')).toBe(false)
    })
  })

  describe('closeAll', () => {
    it('ends active responses and clears subscriptions during shutdown', () => {
      stream.subscribe('user1', mockResponse1 as ServerResponse)
      stream.subscribe('user2', mockResponse2 as ServerResponse)

      stream.closeAll()

      expect(mockResponse1.end).toHaveBeenCalledOnce()
      expect(mockResponse2.end).toHaveBeenCalledOnce()
      expect(stream.getSubscriberCount()).toBe(0)
    })
  })

  describe('publish', () => {
    it('should push notification to all subscribers of specified users', async () => {
      const notification: ErrandNotification = {
        eventId: 'evt-123',
        type: 'ERRAND_STATUS_CHANGED' as ErrandNotificationType,
        errandId: 'errand-456',
        timestamp: '2024-01-01T00:00:00.000Z',
        oldStatus: 'OPEN',
        newStatus: 'ACCEPTED',
      }

      stream.subscribe('user1', mockResponse1 as ServerResponse)
      stream.subscribe('user2', mockResponse2 as ServerResponse)

      await stream.publish(['user1', 'user2'], notification)

      expect(mockResponse1.write).toHaveBeenCalledOnce()
      expect(mockResponse2.write).toHaveBeenCalledOnce()

      const writtenData1 = mockResponse1.write.mock.calls[0][0]
      const writtenData2 = mockResponse2.write.mock.calls[0][0]

      // Remove "data: " prefix and "\n\n" suffix to get JSON
      const payload1 = JSON.parse(writtenData1.slice(5, -2))
      const payload2 = JSON.parse(writtenData2.slice(5, -2))

      expect(payload1).toMatchObject(notification)
      expect(payload2).toMatchObject(notification)
    }, 10_000)

    it('should only push to specified users, not all subscribers', async () => {
      const notification: ErrandNotification = {
        eventId: 'evt-123',
        type: 'ERRAND_STATUS_CHANGED' as ErrandNotificationType,
        errandId: 'errand-456',
        timestamp: '2024-01-01T00:00:00.000Z',
        oldStatus: 'OPEN',
        newStatus: 'ACCEPTED',
      }

      stream.subscribe('user1', mockResponse1 as ServerResponse)
      stream.subscribe('user2', mockResponse2 as ServerResponse)

      // Only notify user1
      await stream.publish(['user1'], notification)

      expect(mockResponse1.write).toHaveBeenCalledOnce()
      expect(mockResponse2.write).not.toHaveBeenCalled()
    }, 10_000)

    it('should skip non-existent users without error', async () => {
      const notification: ErrandNotification = {
        eventId: 'evt-123',
        type: 'ERRAND_STATUS_CHANGED' as ErrandNotificationType,
        errandId: 'errand-456',
        timestamp: '2024-01-01T00:00:00.000Z',
        oldStatus: 'OPEN',
        newStatus: 'ACCEPTED',
      }

      stream.subscribe('user1', mockResponse1 as ServerResponse)
      // user2 is not subscribed

      await stream.publish(['user1', 'user2', 'user3'], notification)

      expect(mockResponse1.write).toHaveBeenCalledOnce()
      // Should not throw for non-existent users
    }, 10_000)

    it('should send correct data format', async () => {
      const notification: ErrandNotification = {
        eventId: 'evt-123',
        type: 'ERRAND_STATUS_CHANGED' as ErrandNotificationType,
        errandId: 'errand-456',
        timestamp: '2024-01-01T00:00:00.000Z',
        oldStatus: 'OPEN',
        newStatus: 'ACCEPTED',
      }

      stream.subscribe('user1', mockResponse1 as ServerResponse)
      await stream.publish(['user1'], notification)

      const writtenData = mockResponse1.write.mock.calls[0][0]
      expect(writtenData).toBe(`data: ${JSON.stringify(notification)}\n\n`)
    }, 10_000)

    it('should send to all subscribed responses for a user', async () => {
      const notification: ErrandNotification = {
        eventId: 'evt-123',
        type: 'ERRAND_STATUS_CHANGED' as ErrandNotificationType,
        errandId: 'errand-456',
        timestamp: '2024-01-01T00:00:00.000Z',
        oldStatus: 'OPEN',
        newStatus: 'ACCEPTED',
      }

      const mockResponse3 = { write: vi.fn((data, cb) => cb()), end: vi.fn() } as MockServerResponse

      // Subscribe same user twice (multiple SSE connections)
      stream.subscribe('user1', mockResponse1 as ServerResponse)
      stream.subscribe('user1', mockResponse2 as ServerResponse)
      stream.subscribe('user1', mockResponse3 as ServerResponse)

      await stream.publish(['user1'], notification)

      expect(mockResponse1.write).toHaveBeenCalledOnce()
      expect(mockResponse2.write).toHaveBeenCalledOnce()
      expect(mockResponse3.write).toHaveBeenCalledOnce()
    }, 10_000)

    it('should reset failure counter on successful write', async () => {
      const notification: ErrandNotification = {
        eventId: 'evt-123',
        type: 'ERRAND_STATUS_CHANGED' as ErrandNotificationType,
        errandId: 'errand-456',
        timestamp: '2024-01-01T00:00:00.000Z',
        oldStatus: 'OPEN',
        newStatus: 'ACCEPTED',
      }

      let writeCount = 0
      mockResponse1.write = vi.fn((data, cb) => {
        writeCount++
        if (writeCount === 1) {
          cb(new Error('First write failed'))
        } else {
          cb()
        }
      })

      stream.subscribe('user1', mockResponse1 as ServerResponse)

      // First write fails
      await stream.publish(['user1'], notification)

      // Second write succeeds
      await stream.publish(['user1'], notification)

      // Check that consecutiveFailures was reset
      const subs = getSubscribersMap(stream)?.get('user1')
      expect(subs).toBeDefined()
      const subscriber = subs ? Array.from(subs.values())[0] : undefined
      expect(
        subscriber && (subscriber as { consecutiveFailures: number }).consecutiveFailures,
      ).toBe(0)
    })
  })

  describe('getSubscriberCount', () => {
    it('should return correct count of subscribers', () => {
      expect(stream.getSubscriberCount()).toBe(0)

      stream.subscribe('user1', mockResponse1 as ServerResponse)
      expect(stream.getSubscriberCount()).toBe(1)

      stream.subscribe('user2', mockResponse2 as ServerResponse)
      expect(stream.getSubscriberCount()).toBe(2)

      stream.subscribe('user1', mockResponse2 as ServerResponse)
      expect(stream.getSubscriberCount()).toBe(3)
    })
  })

  describe('getSubscriberStats', () => {
    it('should return correct statistics', () => {
      const stats = stream.getSubscriberStats()
      expect(stats).toEqual({
        totalUsers: 0,
        totalSubscriptions: 0,
        usersWithMultipleSubs: 0,
      })

      stream.subscribe('user1', mockResponse1 as ServerResponse)
      const stats1 = stream.getSubscriberStats()
      expect(stats1.totalUsers).toBe(1)
      expect(stats1.totalSubscriptions).toBe(1)
      expect(stats1.usersWithMultipleSubs).toBe(0)

      stream.subscribe('user1', mockResponse2 as ServerResponse)
      const stats2 = stream.getSubscriberStats()
      expect(stats2.totalUsers).toBe(1)
      expect(stats2.totalSubscriptions).toBe(2)
      expect(stats2.usersWithMultipleSubs).toBe(1)
    })
  })
})
