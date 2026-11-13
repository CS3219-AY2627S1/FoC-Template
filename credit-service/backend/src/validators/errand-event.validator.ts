// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-14
// Scope: Generated initial implementation, debugged implementation
// Author review: I validated correctness and edited for style.

import { randomUUID } from 'node:crypto'
import { ErrandEventTypes, type ErrandEvent, type ErrandErrorEvent } from '@relay/contracts'
import { z } from 'zod'

export const errandCreditErrorCodes = {
  INVALID_EVENT: 'ERRAND_EVENT_INVALID',
  RESERVATION_NOT_FOUND: 'ERRAND_RESERVATION_NOT_FOUND',
  REQUESTER_MISMATCH: 'ERRAND_REQUESTER_MISMATCH',
  COURIER_MISSING: 'ERRAND_COURIER_MISSING',
  COURIER_MISMATCH: 'ERRAND_COURIER_MISMATCH',
  OUTCOME_CONFLICT: 'ERRAND_CREDIT_OUTCOME_CONFLICT',
  INSUFFICIENT_RESERVED_CREDIT: 'ERRAND_INSUFFICIENT_RESERVED_CREDIT',
  CREDIT_OPERATION_FAILED: 'ERRAND_CREDIT_OPERATION_FAILED',
} as const
type ErrorCode = (typeof errandCreditErrorCodes)[keyof typeof errandCreditErrorCodes]

export class ErrandEventError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

const eventSchema = z.object({
  eventId: z.string().uuid(),
  timestamp: z.iso.datetime(),
  version: z.literal(1),
  eventType: z.enum([
    ErrandEventTypes.ERRAND_CREATED,
    ErrandEventTypes.ERRAND_CREATION_FAILED,
    ErrandEventTypes.ERRAND_STATUS_CHANGED,
    ErrandEventTypes.ERRAND_COMPLETED,
    ErrandEventTypes.ERRAND_CANCELLED,
    ErrandEventTypes.ERRAND_EXPIRED,
    ErrandEventTypes.ERRAND_DELETED,
  ]),
  payload: z
    .object({
      errandId: z.string().min(1),
      requesterSub: z.string().min(1).optional(),
      courierSub: z.string().min(1).optional(),
    })
    .passthrough(),
})

export function classifyErrandEventError(error: unknown): ErrandEventError {
  if (error instanceof ErrandEventError) return error
  if (error instanceof SyntaxError || error instanceof z.ZodError) {
    return new ErrandEventError(
      errandCreditErrorCodes.INVALID_EVENT,
      'The event is not a valid errand event.',
    )
  }
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('Reservation requester mismatch')) {
    return new ErrandEventError(
      errandCreditErrorCodes.REQUESTER_MISMATCH,
      'The requester does not match the credit reservation.',
    )
  }
  if (message.startsWith('No prior credit reservation')) {
    return new ErrandEventError(
      errandCreditErrorCodes.RESERVATION_NOT_FOUND,
      'No prior credit reservation exists.',
    )
  }
  if (message.startsWith('Cannot release credit') || message.startsWith('Cannot transfer credit')) {
    return new ErrandEventError(
      errandCreditErrorCodes.OUTCOME_CONFLICT,
      'A conflicting credit outcome was already recorded.',
    )
  }
  if (message.startsWith('Insufficient reserved credit')) {
    return new ErrandEventError(
      errandCreditErrorCodes.INSUFFICIENT_RESERVED_CREDIT,
      'The reserved credit is insufficient.',
    )
  }
  return new ErrandEventError(
    errandCreditErrorCodes.CREDIT_OPERATION_FAILED,
    'The credit operation could not be completed.',
  )
}

function dlqEvent(value: unknown, key: string | undefined): ErrandEvent {
  const valid = eventSchema.safeParse(value)
  if (valid.success) return valid.data as ErrandEvent
  const envelope = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const payload =
    envelope.payload && typeof envelope.payload === 'object'
      ? (envelope.payload as Record<string, unknown>)
      : {}
  return {
    eventId:
      typeof envelope.eventId === 'string' && z.uuid().safeParse(envelope.eventId).success
        ? envelope.eventId
        : randomUUID(),
    eventType: ErrandEventTypes.ERRAND_EVENT_INVALID,
    timestamp: new Date().toISOString(),
    version: 1,
    payload: {
      errandId:
        typeof payload.errandId === 'string' && payload.errandId
          ? payload.errandId
          : key || 'unknown',
      metadata: { rawEvent: JSON.stringify(value) ?? 'null' },
    },
  }
}

export function parseErrandEvent(value: unknown, key: string | undefined): ErrandEvent {
  const event = eventSchema.parse(value) as ErrandEvent
  if (key !== event.payload.errandId) {
    throw new ErrandEventError(
      errandCreditErrorCodes.INVALID_EVENT,
      'The Kafka key does not match the errand ID.',
    )
  }
  return event
}

export function rejectedErrandEvent(
  event: ErrandEvent | undefined,
  value: unknown,
  key: string | undefined,
  rejection: ErrandEventError,
): ErrandErrorEvent {
  return {
    ...(event ?? dlqEvent(value, key)),
    error: { code: rejection.code, message: rejection.message },
  }
}

export function requireRequester(requesterSub: string | undefined): string {
  if (!requesterSub)
    throw new ErrandEventError(errandCreditErrorCodes.INVALID_EVENT, 'The requester is missing.')
  return requesterSub
}

export function validateReservation<T extends { userId: string }>(
  reservation: T | null,
  requesterSub: string | undefined,
): T {
  if (!reservation)
    throw new ErrandEventError(
      errandCreditErrorCodes.RESERVATION_NOT_FOUND,
      'No prior credit reservation exists.',
    )
  if (requesterSub && requesterSub !== reservation.userId) {
    throw new ErrandEventError(
      errandCreditErrorCodes.REQUESTER_MISMATCH,
      'The requester does not match the credit reservation.',
    )
  }
  return reservation
}

export function requireCourier(courierSub: string | undefined, requesterSub: string): string {
  if (!courierSub)
    throw new ErrandEventError(errandCreditErrorCodes.COURIER_MISSING, 'The courier is missing.')
  if (courierSub === requesterSub) {
    throw new ErrandEventError(
      errandCreditErrorCodes.COURIER_MISMATCH,
      'The courier and requester must differ.',
    )
  }
  return courierSub
}
