import type { UnpublishedOutboxRow } from './outboxStore';

export type OutboxBroker = {
  publishToQueue(queue: string, message: object, eventId?: string): Promise<boolean>;
};

export type OutboxStorePort = {
  findUnpublished(limit: number): Promise<UnpublishedOutboxRow[]>;
  markPublished(eventId: string): Promise<void>;
  recordFailure(eventId: string, message: string): Promise<void>;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function recordFailureSafe(
  store: OutboxStorePort,
  eventId: string,
  message: string,
): Promise<void> {
  try {
    await store.recordFailure(eventId, message);
  } catch (err) {
    console.error('outbox recordFailure failed', { eventId, message: errorMessage(err) });
  }
}

export async function dispatchPending(
  store: OutboxStorePort,
  broker: OutboxBroker,
  limit: number,
): Promise<void> {
  const rows = await store.findUnpublished(limit);

  for (const row of rows) {
    try {
      const body: unknown = JSON.parse(row.body);
      if (body === null || typeof body !== 'object') {
        throw new Error('outbox body is not a JSON object');
      }
      const sent = await broker.publishToQueue(row.queue, body, row.eventId);
      if (!sent) {
        throw new Error('publish-rejected');
      }
      await store.markPublished(row.eventId);
    } catch (err) {
      await recordFailureSafe(store, row.eventId, errorMessage(err));
    }
  }
}

export function startDispatcher(options: {
  store: OutboxStorePort;
  broker: OutboxBroker;
  intervalMs: number;
  batchSize: number;
}): () => void {
  let inFlight = false;

  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    void dispatchPending(options.store, options.broker, options.batchSize)
      .catch((err) => {
        console.error('outbox dispatch tick failed', errorMessage(err));
      })
      .finally(() => {
        inFlight = false;
      });
  }, options.intervalMs);

  return () => clearInterval(timer);
}
