// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-02
// Scope: Implemented the author-designed SSE subscription flow, timeout, failure, and cleanup behavior defined at a high level.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import { type ServerResponse } from 'node:http'
import type { ErrandNotification } from '@relay/contracts'

export type ErrandNotificationSubscriber = 'requester' | 'courier'

type Subscriber = {
  response: ServerResponse
  lastWrite: number
  consecutiveFailures: number
}

export const MAX_CONSECUTIVE_FAILURES = 3
export const SSE_WRITE_TIMEOUT_MS = 5_000

export class ErrandNotificationEventStream {
  private subscribers: Map<string, Map<string, Subscriber>> = new Map()

  /**
   * Subscribe a user to notifications
   * @returns subscriptionId for later unsubscribe calls
   */
  subscribe(userId: string, res: ServerResponse): string {
    const subscriptionId = crypto.randomUUID()

    if (!this.subscribers.has(userId)) {
      this.subscribers.set(userId, new Map())
    }

    this.subscribers.get(userId)!.set(subscriptionId, {
      response: res,
      lastWrite: Date.now(),
      consecutiveFailures: 0,
    })

    return subscriptionId
  }

  /**
   * Unsubscribe a user from notifications
   * @param userId User ID
   * @param subscriptionId Optional specific subscription ID. If not provided, unsubscribes all.
   */
  unsubscribe(userId: string, subscriptionId?: string): void {
    const subs = this.subscribers.get(userId)
    if (!subs) return

    if (subscriptionId) {
      subs.delete(subscriptionId)
    } else {
      this.subscribers.delete(userId)
      return
    }

    // Clean up empty user entries
    if (subs.size === 0) {
      this.subscribers.delete(userId)
    }
  }

  /** End active SSE responses so clients can reconnect during pod shutdown. */
  closeAll(): void {
    for (const subs of this.subscribers.values()) {
      for (const { response } of subs.values()) {
        if (!response.writableEnded && !response.destroyed) {
          response.end()
        }
      }
    }
    this.subscribers.clear()
  }

  /**
   * Publish notification to multiple users
   * - Handles write errors gracefully
   * - Tracks consecutive failures and unsubscribes after threshold
   * - Best-effort delivery to active in-memory subscribers
   */
  async publish(userSubs: string[], notification: ErrandNotification): Promise<void> {
    const start = Date.now()
    let successCount = 0
    let failureCount = 0

    for (const userSub of userSubs) {
      const subs = this.subscribers.get(userSub)
      if (!subs) continue

      for (const [subscriptionId, { response, consecutiveFailures }] of subs.entries()) {
        try {
          // Set timeout for write operation
          const writePromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error('SSE write timeout')),
              SSE_WRITE_TIMEOUT_MS,
            )

            response.write(`data: ${JSON.stringify(notification)}\n\n`, (err) => {
              clearTimeout(timeout)
              if (err) reject(err)
              else resolve()
            })
          })

          await writePromise
          successCount++

          // Reset failure counter on success
          const sub = subs.get(subscriptionId)!
          sub.consecutiveFailures = 0
          sub.lastWrite = Date.now()
        } catch (error) {
          failureCount++

          const sub = subs.get(subscriptionId)!
          sub.consecutiveFailures++

          console.error(`SSE write failed for ${userSub} (${subscriptionId}):`, error)

          // Unsubscribe after consecutive failures
          if (sub.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.warn(`Unsubscribing ${userSub} after ${sub.consecutiveFailures} failures`)
            subs.delete(subscriptionId)
          }
        }
      }
    }

    // Cleanup empty user entries
    for (const [userId, subs] of this.subscribers.entries()) {
      if (subs.size === 0) {
        this.subscribers.delete(userId)
      }
    }

    console.info(
      `SSE publish: ${notification.type} to ${successCount} recipients (${failureCount} failures) in ${Date.now() - start}ms`,
    )
  }

  /**
   * Get subscriber count for health monitoring
   */
  getSubscriberCount(): number {
    let count = 0
    for (const subs of this.subscribers.values()) {
      count += subs.size
    }
    return count
  }

  /**
   * Get detailed subscriber statistics
   */
  getSubscriberStats(): {
    totalUsers: number
    totalSubscriptions: number
    usersWithMultipleSubs: number
  } {
    let totalUsers = 0
    let totalSubs = 0
    let usersWithMultiple = 0

    for (const [userId, subs] of this.subscribers.entries()) {
      totalUsers++
      totalSubs += subs.size
      if (subs.size > 1) usersWithMultiple++
    }

    return {
      totalUsers,
      totalSubscriptions: totalSubs,
      usersWithMultipleSubs: usersWithMultiple,
    }
  }
}
