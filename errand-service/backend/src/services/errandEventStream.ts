// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-17
// Scope: Implemented the earlier author-designed Errand SSE stream behavior.
// Author review: Reviewed every output, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements. All design decisions remained author-authored.

import { type ServerResponse } from 'node:http'

export interface ErrandEvent {
  errandId: string
  newStatus: string
  previousStatus: string
  timestamp: string
}

export type ErrandEventSubscriber = 'requester' | 'courier'

export class ErrandEventStream {
  // errandId -> Map<userId, { response, role: 'requester' | 'courier' }>
  private subscribers: Map<
    string,
    Map<string, { response: ServerResponse; role: ErrandEventSubscriber }>
  > = new Map()

  subscribe(
    errandId: string,
    userId: string,
    res: ServerResponse,
    role: ErrandEventSubscriber,
  ): void {
    if (!this.subscribers.has(errandId)) {
      this.subscribers.set(errandId, new Map())
    }
    this.subscribers.get(errandId)!.set(userId, { response: res, role })
  }

  unsubscribe(errandId: string, userId: string): void {
    const users = this.subscribers.get(errandId)
    if (users) {
      users.delete(userId)
      if (users.size === 0) {
        this.subscribers.delete(errandId)
      }
    }
  }

  /**
   * Publish event to specific subscribers
   */
  publish(
    errandId: string,
    event: Omit<ErrandEvent, 'errandId'>,
    subscribers: ErrandEventSubscriber[],
  ): void {
    const users = this.subscribers.get(errandId)
    if (!users) return

    const payload = JSON.stringify({
      type: 'STATUS_CHANGED',
      errandId,
      newStatus: event.newStatus,
      previousStatus: event.previousStatus,
      timestamp: event.timestamp,
    })

    // Notify only the specified subscribers
    for (const [userId, user] of users.entries()) {
      if (subscribers.includes(user.role)) {
        user.response.write(`data: ${payload}\n\n`)
      }
    }
  }

  /**
   * Get all subscribers for an errand
   */
  getSubscribers(
    errandId: string,
  ): Map<string, { response: ServerResponse; role: ErrandEventSubscriber }> | undefined {
    return this.subscribers.get(errandId)
  }
}
