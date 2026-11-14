/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #4 - one tick of the transactional-outbox relay and its 1 s BullMQ job
 *        scheduler, mirroring supplier-service's src/worker/outboxRelay.ts and
 *        startRelay.ts (outbox + relay, George 2026-10-19; same as supplier-service):
 *        read the outbox, enqueue each row as job `outbox-<id>`, delete the row only
 *        after a successful enqueue, dead-letter rows with no queue, stop the tick if
 *        Redis refuses so order is kept.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): startRelay now delegates to the shared startScheduledTask.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import type { ConnectionOptions } from 'bullmq';
import type { DeadLetterRepository } from '../db/dead-letter.repository.js';
import type { OutboxRepository } from '../db/outbox.repository.js';
import type { JobQueue } from '../queue/bull-queue.js';
import { startScheduledTask } from '../queue/scheduled-task.js';
import { queueKeyForTask } from '../queue/tasks.js';

const BATCH_SIZE = 100;

export const OUTBOX_RELAY_QUEUE_KEY = 'queue:outbox:relay';
export const OUTBOX_RELAY_INTERVAL_MS = 1_000;
const SCHEDULER_ID = 'outbox-relay';

interface RelayDeps {
  outbox: OutboxRepository;
  queue: JobQueue;
  deadLetters: DeadLetterRepository;
  log?: (message: string) => void;
  clock?: () => Date;
}

/** Returns a function that runs one relay tick and resolves to the number of rows enqueued. */
export function createOutboxRelay({
  outbox,
  queue,
  deadLetters,
  log = console.error,
  clock = () => new Date(),
}: RelayDeps) {
  return async function relayOnce(): Promise<number> {
    const rows = await outbox.fetchBatch(BATCH_SIZE); // lowest order version first, then id
    let relayed = 0;

    for (const row of rows) {
      // Outbox ids are never reused, so a re-enqueue after a crash is ignored by BullMQ.
      const jobId = `outbox-${row.id}`;
      const queueKey = queueKeyForTask(row.taskName);

      if (queueKey === undefined) {
        // A bad row goes straight to the dead letter; leaving it would block later rows.
        await deadLetters.insert({
          jobId,
          taskName: row.taskName,
          payload: row.payload,
          errorTrace: `No queue is registered for task_name "${row.taskName}".`,
          failedAt: clock(),
        });
        await outbox.delete(row.id);
        continue;
      }

      try {
        await queue.enqueue(queueKey, {
          id: jobId,
          taskName: row.taskName,
          payload: row.payload,
        });
      } catch (error) {
        // Redis unreachable or refused: keep the row and stop, so order is kept and
        // the next tick retries.
        log(
          `Outbox relay could not enqueue ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        break;
      }
      await outbox.delete(row.id); // only after a successful enqueue
      relayed += 1;
    }

    return relayed;
  };
}

/** Runs `relayOnce` every second with a BullMQ job scheduler (ticks never pile up). */
export function startRelay(
  connection: ConnectionOptions,
  relayOnce: () => Promise<number>,
  log: (message: string) => void = console.error,
): Promise<{ close(): Promise<void> }> {
  return startScheduledTask(
    connection,
    {
      queueKey: OUTBOX_RELAY_QUEUE_KEY,
      schedulerId: SCHEDULER_ID,
      jobName: 'outbox_relay',
      everyMs: OUTBOX_RELAY_INTERVAL_MS,
    },
    relayOnce,
    log,
  );
}
