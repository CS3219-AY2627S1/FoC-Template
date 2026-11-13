// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-30 (Asia/Singapore).
// Scope: Separated existing client construction and consumer registration for the human-specified reusable-client startup loop.
// Review: I verified and tested that the broker setup works after implementing the entire user credit lifecycle.
// Prompts/key responses: ../../ai/usage-log.md, entry 047.

import { CREDIT_USER_QUEUE, RabbitMQClient } from '@foc/messaging';
import type { CreditService } from '../services/CreditService';
import { consumeUserEvents } from './userEvents';

export function createUserEventClient(url: string): RabbitMQClient {
  return new RabbitMQClient({
    url, serviceName: 'credit-service', queues: [CREDIT_USER_QUEUE], prefetch: 10,
  });
}

export async function startUserEventConsumer(
  service: Pick<CreditService, 'initCredits' | 'markDeleted' | 'restoreCredits'>,
  broker: RabbitMQClient,
): Promise<void> {
  await consumeUserEvents(broker, CREDIT_USER_QUEUE, service);
  console.info('credit user-event listener ready', { queue: CREDIT_USER_QUEUE });
}
