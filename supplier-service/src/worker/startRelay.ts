/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Runs the outbox relay every second with a BullMQ job scheduler (Phase 4 plan Task 12);
 *        interval and scheduler choice are the team's answer of 2026-09-30, the queue name
 *        queue:outbox:relay is the plan's reading 6. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { splitQueueKey } from '../queue/bullQueue.js';

export const OUTBOX_RELAY_QUEUE_KEY = 'queue:outbox:relay';
export const OUTBOX_RELAY_INTERVAL_MS = 1_000;
const SCHEDULER_ID = 'outbox-relay';

export async function startRelay(
  connection: ConnectionOptions,
  relayOnce: () => Promise<number>,
  log: (message: string) => void = console.error,
): Promise<{ close(): Promise<void> }> {
  const { prefix, name } = splitQueueKey(OUTBOX_RELAY_QUEUE_KEY);

  const queue = new Queue(name, { connection, prefix });
  // The scheduler only creates the next tick when the previous one starts, so ticks never pile up.
  try {
    await queue.upsertJobScheduler(
      SCHEDULER_ID,
      { every: OUTBOX_RELAY_INTERVAL_MS },
      { name: 'outbox_relay', opts: { attempts: 1, removeOnComplete: true, removeOnFail: true } },
    );
  } catch (error) {
    await queue.close(); // do not leak the queue's Redis connection when scheduling fails
    throw error;
  }

  const worker = new Worker(
    name,
    async () => {
      await relayOnce();
    },
    { connection, prefix, concurrency: 1 },
  );
  worker.on('error', (error) => log(`[${OUTBOX_RELAY_QUEUE_KEY}] worker error: ${error.message}`));
  worker.on('failed', (_job, error) => log(`[${OUTBOX_RELAY_QUEUE_KEY}] relay tick failed: ${error.message}`));

  return {
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}
