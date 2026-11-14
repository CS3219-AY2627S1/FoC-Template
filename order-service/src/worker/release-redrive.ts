/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #4 - automatic re-drive of dead-lettered credit releases, per George's
 *        decisions (2026-10-20): credit_release only; transient failures only; every
 *        minute; no limit. Each re-drive marks the dead-letter row REDRIVEN and inserts a
 *        fresh credit_release outbox row in one transaction, so the relay enqueues it as
 *        a new job with a full set of retries. The REDRIVEN status value and the
 *        `queue:order:release-redrive` key are named by convention.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import type { ConnectionOptions } from 'bullmq';
import { insertOutboxRows } from '../db/outbox.repository.js';
import type { PrismaClient } from '../db/prisma.js';
import { startScheduledTask } from '../queue/scheduled-task.js';
import {
  buildReleaseTask,
  CREDIT_RELEASE_TASK,
  isReleasePayload,
} from '../queue/tasks.js';
import { TRANSIENT_RELEASE_FAILURE } from './credit-jobs.js';

export const RELEASE_REDRIVE_QUEUE_KEY = 'queue:order:release-redrive';
export const RELEASE_REDRIVE_INTERVAL_MS = 60_000;
export const REDRIVEN_STATUS = 'REDRIVEN';
const UNRESOLVED_STATUS = 'UNRESOLVED';
const BATCH_SIZE = 100;

interface RedriveDeps {
  prisma: PrismaClient;
  log?: (message: string) => void;
}

/** Returns a function that runs one re-drive pass and resolves to the number re-driven. */
export function createReleaseRedrive({
  prisma,
  log = console.error,
}: RedriveDeps) {
  return async function redriveOnce(): Promise<number> {
    const candidates = await prisma.deadLetterJob.findMany({
      where: {
        taskName: CREDIT_RELEASE_TASK,
        status: UNRESOLVED_STATUS,
        // Permanent rejections (e.g. ALREADY_TRANSFERRED) would fail the same way forever.
        errorTrace: { contains: TRANSIENT_RELEASE_FAILURE },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });

    let redriven = 0;
    for (const row of candidates) {
      if (!isReleasePayload(row.payload)) {
        log(`Release re-drive skipped dead letter ${row.id}: invalid payload.`);
        continue;
      }
      const { requestId } = row.payload;

      const claimed = await prisma.$transaction(async (tx) => {
        // Claim the row first, so two passes can never re-drive it twice.
        const { count } = await tx.deadLetterJob.updateMany({
          where: { id: row.id, status: UNRESOLVED_STATUS },
          data: { status: REDRIVEN_STATUS },
        });
        if (count === 0) return false;

        const order = await tx.orderRequest.findUnique({
          where: { id: requestId },
          select: { version: true },
        });
        // A fresh outbox row gets a fresh id, so the relay enqueues a new job
        // (outbox-<new id>) with all its retries; if that also runs out, it is
        // dead-lettered again and picked up on a later pass.
        await insertOutboxRows(tx, order?.version ?? 0, [
          buildReleaseTask(requestId),
        ]);
        return true;
      });
      if (claimed) redriven += 1;
    }
    return redriven;
  };
}

/** Runs `redriveOnce` every minute with a BullMQ job scheduler. */
export function startReleaseRedrive(
  connection: ConnectionOptions,
  redriveOnce: () => Promise<number>,
  log: (message: string) => void = console.error,
): Promise<{ close(): Promise<void> }> {
  return startScheduledTask(
    connection,
    {
      queueKey: RELEASE_REDRIVE_QUEUE_KEY,
      schedulerId: 'release-redrive',
      jobName: 'release_redrive',
      everyMs: RELEASE_REDRIVE_INTERVAL_MS,
    },
    redriveOnce,
    log,
  );
}
