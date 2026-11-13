// AI Assistance Disclosure: Claude Opus (Cursor), 2026-11-05.
// Prompt: improve index.ts to ensure supplier/order pub-sub works for the supplier cache.
// Scope: generated single RabbitMQ connection for all Order subscriptions.
// Author review: Reviewed by @sunpterodactyl for proposed changes to order, will ask order owner to verify.
import { QUEUES, RabbitMQClient } from '@foc/messaging';
import type { PrismaClient } from '../generated/prisma';
import { subscribeUserDeleted } from './userDeleted';
import { subscribeSupplierEvents, type SupplierEventDependencies } from './supplierEvents';

// One connection and channel for every Order subscription.
export async function startOrderSubscriptions(db: PrismaClient, url: string, supplierEvents: SupplierEventDependencies) {
  const broker = new RabbitMQClient({
    url, serviceName: 'order-service', queues: [QUEUES.orderUser, QUEUES.orderSupplier], prefetch: 10,
  });
  try {
    await broker.connect();
    await subscribeUserDeleted(db, broker);
    await subscribeSupplierEvents(broker, supplierEvents);
    return broker;
  } catch (error) {
    await broker.close().catch(() => undefined);
    throw error;
  }
}
