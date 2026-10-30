import { CREDIT_USER_QUEUE, RabbitMQClient } from '@foc/messaging';
import type { CreditService } from '../services/CreditService';
import { consumeUserCreated } from './userCreated';

export async function startUserEventConsumer(
  service: Pick<CreditService, 'initCredits'>,
  url: string,
): Promise<RabbitMQClient> {
  const broker = new RabbitMQClient({
    url, serviceName: 'credit-service', queues: [CREDIT_USER_QUEUE], prefetch: 10,
  });
  try {
    await broker.connect();
    await consumeUserCreated(broker, CREDIT_USER_QUEUE, service);
    console.info('credit user-event listener ready', { queue: CREDIT_USER_QUEUE });
    return broker;
  } catch (error) {
    await broker.close().catch(() => undefined);
    throw error;
  }
}
