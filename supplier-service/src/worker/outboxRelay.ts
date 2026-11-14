/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: One tick of the transactional-outbox relay (Phase 4 plan Task 12): read the outbox, enqueue
 *        each package into BullMQ, delete the row once it is enqueued (team answer, 2026-09-30).
 *        Batch size, job-id scheme and unroutable-row handling are the plan's readings 3-5. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { DeadLetterRepository } from '../persistence/deadLetterRepository.js';
import type { OutboxRepository } from '../persistence/outboxRepository.js';
import type { JobQueue } from '../queue/jobQueue.js';
import { queueKeyForTask } from '../queue/tasks.js';
import { sgtDatetime } from '../utils/time.js';

const BATCH_SIZE = 100;

interface Dependencies {
  outbox: OutboxRepository;
  queue: JobQueue;
  deadLetters: DeadLetterRepository;
  log?: (message: string) => void;
  clock?: () => Date;
}

/** Returns a function that runs one relay tick and resolves to the number of rows enqueued. */
export function createOutboxRelay({ outbox, queue, deadLetters, log = console.error, clock = () => new Date() }: Dependencies) {
  return async function relayOnce(): Promise<number> {
    const rows = await outbox.fetchBatch(BATCH_SIZE); // lowest supplier version first, then id
    let relayed = 0;

    for (const row of rows) {
      const jobId = `outbox-${row.id}`; // outbox ids are never reused, so a re-enqueue after a crash is ignored by BullMQ
      const queueKey = queueKeyForTask(row.taskName);

      if (queueKey === undefined) {
        // A bad job goes straight to the dead letter; leaving it would block every later row.
        await deadLetters.insert({
          jobId,
          taskName: row.taskName,
          payload: row.payload,
          errorTrace: `No queue is registered for task_name "${row.taskName}".`,
          failedAt: sgtDatetime(clock()),
        });
        // If the insert succeeds and this delete then fails, the next tick writes a second dead-letter row
        // for the same outbox-<id>: harmless and self-healing.
        await outbox.delete(row.id);
        continue;
      }

      try {
        await queue.enqueue(queueKey, { id: jobId, task_name: row.taskName, payload: row.payload });
      } catch (error) {
        // Redis is unreachable or refused the job: keep the row and stop, so order is preserved and the next tick retries.
        log(`Outbox relay could not enqueue ${jobId}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
      await outbox.delete(row.id); // only after a successful enqueue
      relayed += 1;
    }

    return relayed;
  };
}

export type OutboxRelay = ReturnType<typeof createOutboxRelay>;
