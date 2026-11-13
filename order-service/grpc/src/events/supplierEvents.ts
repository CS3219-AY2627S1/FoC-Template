// AI Assistance Disclosure: Claude Opus (Cursor), 2026-11-05.
// Prompt: improve index.ts to ensure supplier/order pub-sub works for the supplier cache.
// Scope: generated supplier event consumer that invalidates and refetches cache entries.
// Author review: Good, handles parsing mishap reviewed by @sunpterodactyl.
import { status as rpcStatus } from '@grpc/grpc-js';
import { NonRetryableError, QUEUES, supplierEventSchema, type QueueHandler, type RabbitMQClient } from '@foc/messaging';
import type { SupplierCache, SupplierRecord } from '../dependencies/supplierCache';
import { InvalidSupplierError } from '../grpc/error';

export type SupplierEventDependencies = {
  // Undefined when REDIS_URL is not configured: events are acknowledged and ignored.
  cache: SupplierCache | undefined;
  fetchSupplier: (supplierId: string) => Promise<SupplierRecord>;
};

export function createSupplierEventHandler({ cache, fetchSupplier }: SupplierEventDependencies): QueueHandler<unknown> {
  return async ({ payload, eventId }) => {
    const parsed = supplierEventSchema.safeParse(payload);
    if (!parsed.success) throw new NonRetryableError('Invalid supplier event');
    const event = parsed.data;
    if (eventId && eventId !== event.eventId) throw new NonRetryableError('Delivery eventId does not match payload');
    // Opening hours are not cached; Order no longer checks them.
    if (event.type === 'supplier.status_changed' || !cache) return;

    const version = Date.parse(event.updatedAt);
    // Stop serving the old copy before refetching; reads fall through to gRPC meanwhile.
    await cache.invalidate(event.supplierId, version);
    if (event.type === 'supplier.deleted') return;

    let supplier: SupplierRecord;
    try {
      supplier = await fetchSupplier(event.supplierId);
    } catch (error) {
      // Deleted after this update was published; the stale marker already covers it.
      if ((error as { code?: number } | null)?.code === rpcStatus.NOT_FOUND) return;
      if (error instanceof InvalidSupplierError) throw new NonRetryableError(error.message);
      throw error;
    }
    if (supplier.supplierId !== event.supplierId) throw new Error('Supplier gRPC returned a different supplierId');
    await cache.store(supplier, version);
  };
}

export async function subscribeSupplierEvents(broker: Pick<RabbitMQClient, 'consumeFromQueue'>, dependencies: SupplierEventDependencies) {
  await broker.consumeFromQueue(QUEUES.orderSupplier, createSupplierEventHandler(dependencies));
  if (!dependencies.cache) console.info('Order supplier cache disabled: REDIS_URL not configured; supplier events are ignored');
  console.info('Order supplier-event subscription ready', { queue: QUEUES.orderSupplier });
}
