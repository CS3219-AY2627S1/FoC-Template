/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #4 - BullMQ producer adapter and retry policy, mirroring
 *        supplier-service's src/queue/bullQueue.ts. Retry policy per George
 *        (2026-10-19): 5 attempts, exponential backoff at powers of 2. The 1 s base
 *        delay (1/2/4/8 s) is BullMQ's built-in `exponential` type and was picked by
 *        convention, not decided.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-21): Credit transfer - per-queue job options: the transfer
 *        queue gets attempts 5 with a custom backoff (the consumer supplies the powers-of-5
 *        delays), following supplier-service's split.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */

import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import { CREDIT_TRANSFER_QUEUE_KEY } from './tasks.js';

/**
 * Keys look like 'queue:<group>:<name>'. BullMQ forbids ':' in a queue name, so the
 * last segment is the name and the rest is the key prefix.
 */
export function splitQueueKey(queueKey: string): {
  prefix: string;
  name: string;
} {
  const at = queueKey.lastIndexOf(':');
  if (at <= 0 || at === queueKey.length - 1) {
    throw new Error(`Queue key must look like "group:name": ${queueKey}`);
  }
  return { prefix: queueKey.slice(0, at), name: queueKey.slice(at + 1) };
}

export const MAX_ATTEMPTS = 5;
export const RETRY_BASE_DELAY_MS = 1_000;

/** Retries are delayed jobs held in Redis, so no worker sleeps between attempts. */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: MAX_ATTEMPTS,
  // BullMQ exponential: delay * 2^(attemptsMade - 1) -> 1 s, 2 s, 4 s, 8 s.
  backoff: { type: 'exponential', delay: RETRY_BASE_DELAY_MS },
  removeOnComplete: true,
};

/**
 * Jobs for credit-service's transfer queue: 5 attempts, with the powers-of-5 delays
 * (5/25/125/625 s) supplied by the consumer's custom backoff strategy, then its dead letter
 * (transfer contract, 2026-10-20). Same split as supplier-service's queues.
 */
export const TRANSFER_JOB_OPTIONS: JobsOptions = {
  attempts: MAX_ATTEMPTS,
  backoff: { type: 'custom' },
  removeOnComplete: true,
};

const JOB_OPTIONS_BY_QUEUE = new Map<string, JobsOptions>([
  [CREDIT_TRANSFER_QUEUE_KEY, TRANSFER_JOB_OPTIONS],
]);

/** Job options for a queue: the transfer queue's contract options, else the defaults. */
export function jobOptionsFor(queueKey: string): JobsOptions {
  return JOB_OPTIONS_BY_QUEUE.get(queueKey) ?? DEFAULT_JOB_OPTIONS;
}

export interface QueuedJob {
  id: string;
  taskName: string;
  payload: unknown;
}

export interface JobQueue {
  enqueue(queueKey: string, job: QueuedJob): Promise<void>;
  close(): Promise<void>;
}

interface QueueLike {
  add(name: string, data: unknown, opts?: JobsOptions): Promise<unknown>;
  close(): Promise<void>;
}

export type QueueFactory = (queueKey: string) => QueueLike;

export function createBullJobQueue(
  connection: ConnectionOptions,
  makeQueue: QueueFactory = (queueKey) => {
    const { prefix, name } = splitQueueKey(queueKey);
    return new Queue(name, {
      connection,
      prefix,
      defaultJobOptions: jobOptionsFor(queueKey),
    });
  },
): JobQueue {
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
      // An explicit jobId makes a re-add of the same outbox row a no-op in BullMQ.
      await queueFor(queueKey).add(job.taskName, job.payload, {
        jobId: job.id,
      });
    },
    async close() {
      await Promise.all([...queues.values()].map((queue) => queue.close()));
    },
  };
}
