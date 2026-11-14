/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Starts one BullMQ Worker per task queue (Phase 4 plan Task 13). Queue keys, attempts and
 *        delays are the team-supplied values; BullMQ was chosen by the team (2026-09-30). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { Worker, type ConnectionOptions } from 'bullmq';
import { PHOTO_DELETION_QUEUE_KEY } from '../queue/photoDeletionJob.js';
import { SUSPENSION_QUEUE_KEY } from '../queue/tasks.js';
import { backoffStrategy, splitQueueKey } from '../queue/bullQueue.js';
import type { JobProcessor } from './jobProcessor.js';

export function startWorkers(
  connection: ConnectionOptions,
  processor: JobProcessor,
  log: (message: string) => void = console.error,
): Worker[] {
  return [PHOTO_DELETION_QUEUE_KEY, SUSPENSION_QUEUE_KEY].map((queueKey) => {
    const { prefix, name } = splitQueueKey(queueKey);
    const worker = new Worker(name, processor, {
      connection,
      prefix,
      concurrency: 1, // one job at a time per queue
      settings: { backoffStrategy }, // 5 s, 25 s, 125 s, 625 s via the job's { type: 'custom' } backoff
    });
    worker.on('error', (error) => log(`[${queueKey}] worker error: ${error.message}`));
    worker.on('failed', (job, error) =>
      log(`[${queueKey}] job ${job?.id ?? 'unknown'} attempt ${job?.attemptsMade ?? '?'} failed: ${error.message}`),
    );
    return worker;
  });
}
