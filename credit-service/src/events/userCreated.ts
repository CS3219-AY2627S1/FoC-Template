import {
  NonRetryableError,
  userEventSchema,
  type QueueHandler,
  type RabbitMQClient,
} from '@foc/messaging';
import type { CreditService } from '../services/CreditService';
import { InitialAllocationError } from '../services/CreditService';
import { assertUserId } from '../services/validation';

type Initializer = Pick<CreditService, 'initCredits'>;

// One handler for the user-event queue. Add lifecycle cases as they are implemented.
export function createUserCreatedHandler(service: Initializer): QueueHandler<unknown> {
  return async ({ payload, eventId, retryCount }) => {
    console.info('credit user-event received', { eventId, retryCount });
    try {
      const parsed = userEventSchema.safeParse(payload);
      if (!parsed.success) {
        throw new NonRetryableError('Invalid user event', { cause: parsed.error });
      }
      const event = parsed.data;
      if (eventId && eventId !== event.eventId) {
        throw new NonRetryableError('Delivery eventId does not match payload');
      }
      try {
        assertUserId(event.userId);
      } catch (cause) {
        throw new NonRetryableError('Invalid userId', { cause });
      }
      if (event.type !== 'user.created') {
        throw new NonRetryableError(`Credit handler not implemented for ${event.type}`);
      }
      // initCredits commits a single initial grant, or verifies a previous grant.
      const balance = await service.initCredits({ userId: event.userId });
      console.info('credit user.created processed', {
        eventId: event.eventId, userId: event.userId, ...balance,
      });
    } catch (error) {
      console.error('credit user-event failed', {
        eventId, retryCount,
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof InitialAllocationError) {
        throw new NonRetryableError(error.message, { cause: error });
      }
      throw error;
    }
  };
}

export async function consumeUserCreated(
  broker: Pick<RabbitMQClient, 'consumeFromQueue'>,
  queue: string,
  service: Initializer,
): Promise<boolean> {
  if (!queue.trim()) throw new Error('The user-event queue must be supplied');
  return broker.consumeFromQueue<unknown>(queue, createUserCreatedHandler(service));
}
