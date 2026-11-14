// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-22
//  2026-10-22: Credit transfer consumer - the job processor: validate, call the same
//    transferCredits the HTTP route calls, classify the failure with the table in
//    classifyTransferError.ts, dead-letter when BullMQ will not run the job again.
//    Takes its dependencies as parameters so it can be tested without Redis.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { UnrecoverableError } from 'bullmq';
import { transferCredits } from '../services/credits.service.js';
import { AppError } from '../utils/AppError.js';
import { classifyTransferError } from './classifyTransferError.js';
import {
  MAX_ATTEMPTS,
  TRANSFER_TASK_NAME,
  isTransferPayload,
} from '../queue/transferQueue.js';
import type { DeadLetterEntry } from '../db/queries/deadLetter.queries.js';

/** The part of a BullMQ Job this processor reads. Keeps the tests free of Redis. */
export interface ProcessableJob {
  id?: string | undefined;
  name: string;
  data: unknown;
  /** Attempts that have already failed; 0 while the first attempt is running. */
  attemptsMade: number;
  opts: { attempts?: number | undefined };
}

export interface TransferJobDeps {
  /** Writes one dead_letter_jobs row. Injected so a test can make it fail. */
  insertDeadLetter: (entry: DeadLetterEntry) => Promise<unknown>;
  /** Defaults to the real transfer. Injected so a test can force a transient failure. */
  transfer?: (requestId: string, courierId: string) => Promise<unknown>;
  log?: (message: string) => void;
  logError?: (message: string) => void;
  clock?: () => Date;
}

/**
 * The text stored in dead_letter_jobs.error_trace.
 *
 * An AppError's `code` is prefixed because it is the field an operator triages on, and
 * it does not otherwise appear anywhere in the stack — the stack carries only the human
 * message. The permanent path wraps the code into its UnrecoverableError message, so
 * without this the transient exhaustion rows would be the only ones missing it.
 */
function errorTrace(error: unknown): string {
  if (error instanceof AppError) {
    return `[${error.code}] ${error.stack ?? error.message}`;
  }
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

/** Mirrors BullMQ's own check, so an error from a duplicated bullmq copy still counts. */
function isUnrecoverable(error: unknown): boolean {
  return (
    error instanceof UnrecoverableError ||
    (error instanceof Error && error.name === 'UnrecoverableError')
  );
}

export function createTransferJobProcessor({
  insertDeadLetter,
  transfer = transferCredits,
  log = console.log,
  logError = console.error,
  clock = () => new Date(),
}: TransferJobDeps) {
  /**
   * Records a job BullMQ will not run again.
   *
   * The insert has its own try/catch on purpose. dead_letter_jobs captures *business*
   * failures; if the write itself fails — credit-db unreachable — that is an
   * infrastructure failure and must not disappear with it. The whole job is printed to
   * stderr so it can be replayed by hand, and the original error is still thrown, so
   * the job stays in BullMQ's failed set (the producer leaves removeOnFail unset).
   */
  async function deadLetter(job: ProcessableJob, error: unknown): Promise<void> {
    const jobId = job.id ?? 'unknown';
    try {
      await insertDeadLetter({
        jobId,
        taskName: job.name,
        payload: job.data,
        errorTrace: errorTrace(error),
        failedAt: clock(),
      });
      log(`[${TRANSFER_TASK_NAME}] job ${jobId} dead-lettered: ${errorTrace(error)}`);
    } catch (insertError) {
      logError(
        `[${TRANSFER_TASK_NAME}] DEAD-LETTER WRITE FAILED for job ${jobId}. ` +
          `The job stays in BullMQ's failed set and must be replayed by hand.\n` +
          `  payload:     ${JSON.stringify(job.data)}\n` +
          `  original:    ${errorTrace(error)}\n` +
          `  write error: ${errorTrace(insertError)}`,
      );
    }
  }

  return async function processTransferJob(job: ProcessableJob): Promise<void> {
    const jobId = job.id ?? 'unknown';
    const attempts = job.opts.attempts ?? MAX_ATTEMPTS;
    // attemptsMade counts attempts that already failed, so the running one is +1.
    const attempt = job.attemptsMade + 1;

    log(
      `[${TRANSFER_TASK_NAME}] job ${jobId} received (attempt ${attempt}/${attempts}): ` +
        JSON.stringify(job.data),
    );

    if (job.name !== TRANSFER_TASK_NAME) {
      const error = new UnrecoverableError(
        `No handler for task_name "${job.name}" on the transfer queue.`,
      );
      await deadLetter(job, error);
      throw error;
    }

    if (!isTransferPayload(job.data)) {
      const error = new UnrecoverableError(
        `Invalid ${TRANSFER_TASK_NAME} payload: expected { requestId, courierId } as UUIDs.`,
      );
      await deadLetter(job, error);
      throw error;
    }

    const { requestId, courierId } = job.data;

    try {
      await transfer(requestId, courierId);
      log(`[${TRANSFER_TASK_NAME}] job ${jobId} transferred credits for request ${requestId}`);
      return;
    } catch (error) {
      const disposition = classifyTransferError(error);
      const code = error instanceof AppError ? error.code : 'NON_APP_ERROR';

      if (disposition === 'success') {
        // Already done — a redelivery of the same completion, which is normal under
        // at-least-once delivery. Ack it; do not retry and do not dead-letter.
        log(
          `[${TRANSFER_TASK_NAME}] job ${jobId} already applied (${code}) for request ` +
            `${requestId}; treating as success`,
        );
        return;
      }

      if (disposition === 'permanent') {
        const unrecoverable = new UnrecoverableError(
          `Transfer rejected for request ${requestId}: ${code}`,
        );
        await deadLetter(job, unrecoverable);
        throw unrecoverable;
      }

      // Transient. On the final attempt BullMQ will not call this processor again, so
      // this is the last chance to record it.
      const isFinalAttempt = attempt >= attempts;
      logError(
        `[${TRANSFER_TASK_NAME}] job ${jobId} attempt ${attempt}/${attempts} failed ` +
          `(${code}), ${isFinalAttempt ? 'no attempts left' : 'will retry'}: ${errorTrace(error)}`,
      );
      if (isFinalAttempt) await deadLetter(job, error);
      throw error;
    }
  };
}

export type TransferJobProcessor = ReturnType<typeof createTransferJobProcessor>;

/** True once BullMQ will not run the job again. Exported for the worker's `failed` log. */
export function isFinalFailure(job: ProcessableJob, error: unknown): boolean {
  return isUnrecoverable(error) || job.attemptsMade >= (job.opts.attempts ?? MAX_ATTEMPTS);
}
