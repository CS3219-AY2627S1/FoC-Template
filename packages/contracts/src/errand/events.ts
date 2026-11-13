import type { ErrandStatus } from './models'

/** Kafka event types for errand lifecycle events. */
export const ErrandEventTypes = {
  ERRAND_CREATED: 'ErrandCreated',
  ERRAND_CREATION_FAILED: 'ErrandCreationFailed',
  ERRAND_STATUS_CHANGED: 'ErrandStatusChanged',
  ERRAND_COMPLETED: 'ErrandCompleted',
  ERRAND_CANCELLED: 'ErrandCancelled',
  ERRAND_EXPIRED: 'ErrandExpired',
  ERRAND_DELETED: 'ErrandDeleted',
  ERRAND_EVENT_INVALID: 'ErrandEventInvalid', // Synthetic DLQ event for malformed input
} as const

export type ErrandEventType = (typeof ErrandEventTypes)[keyof typeof ErrandEventTypes]

/** Kafka event envelope for all errand events. */
export interface ErrandEvent {
  eventId: string // UUID v4 for deduplication
  eventType: ErrandEventType
  timestamp: string // ISO 8601
  version: 1
  payload: ErrandEventPayload
}

/** An errand event rejected by a downstream service. */
export interface ErrandErrorEvent extends ErrandEvent {
  error: { code: string; message: string }
}

/** Common payload for all errand events. */
export interface ErrandEventPayload {
  errandId: string
  errandStatus?: ErrandStatus
  previousStatus?: ErrandStatus
  actorSub?: string // Who triggered the change (user/courier/system)
  actorType?: 'user' | 'system'
  requesterSub?: string
  courierSub?: string
  supplierId?: string
  creditAmount?: number
  expiresAt?: string
  metadata?: Record<string, string>
  // Recipients for this notification
  recipientSubs?: string[]
}

/** Kafka topic names for errand events. */
export const ErrandTopics = {
  ERRAND_EVENTS: 'errand-events',
  ERRAND_DLQ: 'errand-events-dlq',
} as const

export type ErrandTopic = (typeof ErrandTopics)[keyof typeof ErrandTopics]

/** SSE event types for frontend notifications. */
export const ErrandNotificationTypes = {
  ERRAND_CREATED: 'ERRAND_CREATED',
  ERRAND_STATUS_CHANGED: 'ERRAND_STATUS_CHANGED',
  ERRAND_DELETED: 'ERRAND_DELETED',
} as const

export type ErrandNotificationType =
  (typeof ErrandNotificationTypes)[keyof typeof ErrandNotificationTypes]

/** SSE event payload sent to frontend clients. */
export interface ErrandNotification {
  eventId: string
  type: ErrandNotificationType
  errandId: string
  timestamp: string
  oldStatus: ErrandStatus
  newStatus: ErrandStatus
}
