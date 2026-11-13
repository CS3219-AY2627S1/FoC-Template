/** Kafka event types for user lifecycle events. */
export const UserEventTypes = {
  USER_REGISTERED: 'UserRegistered',
  USER_DELETED: 'UserDeleted',
} as const

export type UserEventType = (typeof UserEventTypes)[keyof typeof UserEventTypes]

/**
 * Shared user-event payload. Fields beyond the Cognito subject are optional so
 * older producers and consumers remain compatible during a rolling deployment.
 */
export type UserEventPayload = {
  cognitoSub: string
  profilePictureKey?: string
  metadata?: Record<string, string>
}

/** Envelope shared by all user events. */
export interface UserEvent {
  eventId: string
  eventType: UserEventType
  timestamp: string
  version: 1
  payload: UserEventPayload
}

export type UserRegisteredEvent = UserEvent & {
  eventType: typeof UserEventTypes.USER_REGISTERED
}

export type UserDeletedEvent = UserEvent & {
  eventType: typeof UserEventTypes.USER_DELETED
}

export const UserTopics = {
  USER_EVENTS: 'user-events',
  USER_DLQ: 'user-events-dlq',
} as const

export type UserTopic = (typeof UserTopics)[keyof typeof UserTopics]

/** Rejected user event written by Credit Service to the user DLQ. */
export type UserEventDlqErrorCode =
  | 'USER_EVENT_INVALID'
  | 'USER_EVENT_DUPLICATE'
  | 'USER_EVENT_OUT_OF_ORDER'
  | 'USER_CREDIT_OPERATION_FAILED'
  | 'USER_AUTH_DELETE_FAILED'
  | 'USER_PROFILE_IMAGE_DELETE_FAILED'
  | 'ERRAND_USER_DELETION_FAILED'

export type UserEventDlqMessage = {
  eventId: string
  eventType: UserEventType | 'UserEventInvalid'
  timestamp: string
  version: 1
  payload: UserEventPayload
  error: { code: UserEventDlqErrorCode; message: string }
}
