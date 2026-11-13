// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-14
// Scope: Generated initial implementation, debugged implementation
// Author review: I validated correctness and edited for style.

import { randomUUID } from 'node:crypto'
import {
  UserEventTypes,
  type UserEvent,
  type UserEventDlqErrorCode,
  type UserEventDlqMessage,
} from '@relay/contracts'
import { z } from 'zod'

const schema = z.object({
  eventId: z.string().uuid(),
  timestamp: z.iso.datetime(),
  version: z.literal(1),
  eventType: z.enum([UserEventTypes.USER_REGISTERED, UserEventTypes.USER_DELETED]),
  payload: z.object({
    cognitoSub: z
      .string()
      .trim()
      .min(1)
      .refine((value) => !value.includes(':')),
    profilePictureKey: z.string().trim().min(1).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  }),
})

export class UserEventRejection extends Error {
  constructor(
    readonly code: UserEventDlqErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export function parseUserEvent(raw: string, key: string | undefined): UserEvent {
  const event = schema.parse(JSON.parse(raw)) as UserEvent
  if (key !== event.payload.cognitoSub) {
    throw new UserEventRejection(
      'USER_EVENT_INVALID',
      'The Kafka key does not match the user subject.',
    )
  }
  return event
}

export function classifyUserEventError(error: unknown): UserEventRejection {
  if (error instanceof UserEventRejection) return error
  if (error instanceof SyntaxError || error instanceof z.ZodError) {
    return new UserEventRejection('USER_EVENT_INVALID', 'The message is not a valid user event.')
  }
  return new UserEventRejection(
    'USER_CREDIT_OPERATION_FAILED',
    'The credit operation could not be completed.',
  )
}

export function rejectedUserEvent(
  event: UserEvent | undefined,
  raw: string,
  key: string | undefined,
  rejection: UserEventRejection,
): UserEventDlqMessage {
  if (event) return { ...event, error: { code: rejection.code, message: rejection.message } }
  return {
    eventId: randomUUID(),
    eventType: 'UserEventInvalid',
    timestamp: new Date().toISOString(),
    version: 1,
    payload: { cognitoSub: key || 'unknown', metadata: { rawEvent: raw } },
    error: { code: rejection.code, message: rejection.message },
  }
}

export function validateUserCreditOutcome(
  outcome: string,
  eventType: UserEvent['eventType'],
): void {
  if (outcome === 'duplicate') {
    throw new UserEventRejection(
      'USER_EVENT_DUPLICATE',
      eventType === UserEventTypes.USER_REGISTERED
        ? 'Initial credit was already allocated for this user.'
        : 'User credit was already deleted.',
    )
  }
  if (outcome === 'out-of-order') {
    throw new UserEventRejection(
      'USER_EVENT_OUT_OF_ORDER',
      eventType === UserEventTypes.USER_REGISTERED
        ? 'Registration arrived after user deletion.'
        : 'User deletion could not be applied in order.',
    )
  }
}
