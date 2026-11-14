/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: BullMQ producer adapter and retry policy (Phase 4 plan Task 2), per the team's decision to
 *        use BullMQ (2026-09-30). Queue keys, attempts and delays are the team-supplied values. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import type { JobQueue } from './jobQueue.js';

/**
 * Team keys look like 'queue:<group>:<name>'. BullMQ forbids ':' in a queue name, so the last
 * segment is the name and the rest is the key prefix; keys stay under e.g. queue:image:cleanup:*.
 */
export function splitQueueKey(queueKey: string): { prefix: string; name: string } {
  const at = queueKey.lastIndexOf(':');
  if (at <= 0 || at === queueKey.length - 1) {
    throw new Error(`Queue key must look like "group:name": ${queueKey}`);
  }
  return { prefix: queueKey.slice(0, at), name: queueKey.slice(at + 1) };
}

export const MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_FACTOR = 5;

/** Delay before the next attempt once `attemptsMade` attempts have failed: 5 s, 25 s, 125 s, 625 s. */
export function backoffStrategy(attemptsMade: number): number {
  return RETRY_BASE_DELAY_MS * RETRY_FACTOR ** (attemptsMade - 1);
}

/** Retries are delayed jobs held in Redis with a timestamp, so no worker sleeps between attempts. */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: MAX_ATTEMPTS,
  backoff: { type: 'custom' },
  removeOnComplete: true,
};

interface QueueLike {
  add(name: string, data: unknown, opts?: JobsOptions): Promise<unknown>;
  close(): Promise<void>;
}

export type QueueFactory = (queueKey: string) => QueueLike;

export function createBullJobQueue(
  connection: ConnectionOptions,
  makeQueue: QueueFactory = (queueKey) => {
    const { prefix, name } = splitQueueKey(queueKey);
    return new Queue(name, { connection, prefix, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  },
): JobQueue & { close(): Promise<void> } {
  const queues = new Map<string, QueueLike>();

  function queueFor(queueKey: string): QueueLike {
    let queue = queues.get(queueKey);
    if (queue === undefined) {
      queue = makeQueue(queueKey);
      queues.set(queueKey, queue);
    }
    return queue;
  }

  return {
    async enqueue(queueKey, job) {
      await queueFor(queueKey).add(job.task_name, job.payload, { jobId: job.id });
    },
    async close() {
      await Promise.all([...queues.values()].map((queue) => queue.close()));
    },
  };
}
