// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-11-06 (Asia/Singapore).
// Scope: Corrected lifecycle logs format.
// Author review: I verified that the logs contain the correct details.
// Prompts and key responses: ../ai/usage-log.md, entry 050.

import {
  NonRetryableError,
  userEventSchema,
  type QueueHandler,
  type RabbitMQClient,
} from '@foc/messaging';
import type { CreditService } from '../services/CreditService';
import { InitialAllocationError, RestoreError } from '../services/CreditService';
import { assertUserId } from '../services/validation';

type UserEventService = Pick<CreditService, 'initCredits' | 'markDeleted' | 'restoreCredits'>;

// Handles user.created, user.deleted, user.restored
export function createUserEventHandler(service: UserEventService): QueueHandler<unknown> {
  return async ({ payload, eventId, retryCount }) => {
    let createdEvent = false;
    console.info('credit user-event received', { eventId });
    try {
      const parsed = userEventSchema.safeParse(payload);
      if (!parsed.success) {
        throw new NonRetryableError('Invalid user event', { cause: parsed.error });
      }
      const event = parsed.data;
      createdEvent = event.type === 'user.created';
      if (eventId && eventId !== event.eventId) {
        throw new NonRetryableError('Delivery eventId does not match payload');
      }
      try {
        assertUserId(event.userId);
      } catch (cause) {
        throw new NonRetryableError('Invalid userId', { cause });
      }
      switch (event.type) {
        case 'user.created': {
          const balance = await service.initCredits({ userId: event.userId });
          console.info('credit user.created processed', { eventId: event.eventId, userId: event.userId, ...balance });
          break;
        }
        case 'user.deleted':
          await service.markDeleted({ userId: event.userId });
          console.info('credit user.deleted processed', { eventId: event.eventId });
          break;
        case 'user.restored':
          try { assertUserId(event.previousUserId); }
          catch (cause) { throw new NonRetryableError('Invalid previousUserId', { cause }); }
          await service.restoreCredits({ previousUserId: event.previousUserId, userId: event.userId });
          console.info('credit user.restored processed', { eventId: event.eventId });
          break;
        default:
          throw new NonRetryableError(`Credit does not handle ${(event as { type: string }).type}`);
      }
    } catch (error) {
      console.error('credit user-event failed', createdEvent ? {
        eventId, retryCount,
        error: error instanceof Error ? error.message : String(error),
      } : { eventId });
      if (error instanceof InitialAllocationError || error instanceof RestoreError) {
        throw new NonRetryableError(error.message, { cause: error });
      }
      throw error;
    }
  };
}

export async function consumeUserEvents(
  broker: Pick<RabbitMQClient, 'consumeFromQueue'>,
  queue: string,
  service: UserEventService,
): Promise<boolean> {
  if (!queue.trim()) throw new Error('The user-event queue must be supplied');
  return broker.consumeFromQueue<unknown>(queue, createUserEventHandler(service));
}
