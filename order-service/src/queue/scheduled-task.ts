/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #4 - generic "run this every N ms" on a BullMQ job scheduler, factored
 *        out of the outbox relay's startRelay (which mirrors supplier-service's
 *        startRelay.ts) so the release re-drive can reuse it.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { splitQueueKey } from './bull-queue.js';

export interface ScheduledTaskOptions {
  queueKey: string;
  schedulerId: string;
  jobName: string;
  everyMs: number;
}

/**
 * Runs `task` every `everyMs` with a BullMQ job scheduler. The scheduler only creates
 * the next tick when the previous one starts, and concurrency 1 means ticks never
 * overlap or pile up.
 */
export async function startScheduledTask(
  connection: ConnectionOptions,
  { queueKey, schedulerId, jobName, everyMs }: ScheduledTaskOptions,
  task: () => Promise<unknown>,
  log: (message: string) => void = console.error,
): Promise<{ close(): Promise<void> }> {
  const { prefix, name } = splitQueueKey(queueKey);

  const queue = new Queue(name, { connection, prefix });
  try {
    await queue.upsertJobScheduler(
      schedulerId,
      { every: everyMs },
      {
        name: jobName,
        opts: { attempts: 1, removeOnComplete: true, removeOnFail: true },
      },
    );
  } catch (error) {
    await queue.close(); // do not leak the queue's Redis connection
    throw error;
  }

  const worker = new Worker(
    name,
    async () => {
      await task();
    },
    { connection, prefix, concurrency: 1 },
  );
  worker.on('error', (error) =>
    log(`[${queueKey}] worker error: ${error.message}`),
  );
  worker.on('failed', (_job, error) =>
    log(`[${queueKey}] ${jobName} tick failed: ${error.message}`),
  );

  return {
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}
