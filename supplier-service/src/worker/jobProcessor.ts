/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: BullMQ job processor: route by job name, insert a dead_letter_jobs row when a job fails for
 *        the last time or is a bad job, and rethrow so BullMQ schedules the retry (Phase 4 plan Task 11;
 *        SupplierServiceArchitecture.md §8.1, §8.2). No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Bad-job detection now mirrors BullMQ (instanceof or error name) via a local helper. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { UnrecoverableError } from 'bullmq';
import type { DeadLetterRepository } from '../persistence/deadLetterRepository.js';
import { sgtDatetime } from '../utils/time.js';
import type { JobHandler } from './handlers.js';

/** The parts of a BullMQ Job the processor reads. */
export interface ProcessableJob {
  id?: string | undefined;
  name: string;
  data: unknown;
  /** Attempts that have already failed; 0 while the first attempt runs. */
  attemptsMade: number;
  opts: { attempts?: number | undefined };
}

interface Dependencies {
  handlers: Record<string, JobHandler>;
  deadLetters: DeadLetterRepository;
  log?: (message: string) => void;
  clock?: () => Date;
}

// Mirrors BullMQ's own check (instanceof or name), so an error from a duplicated bullmq copy still counts.
function isUnrecoverable(error: unknown): boolean {
  return error instanceof UnrecoverableError || (error instanceof Error && error.name === 'UnrecoverableError');
}

function errorTrace(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

export function createJobProcessor({ handlers, deadLetters, log = console.error, clock = () => new Date() }: Dependencies) {
  async function deadLetter(job: ProcessableJob, error: unknown): Promise<void> {
    try {
      await deadLetters.insert({
        jobId: job.id ?? 'unknown',
        taskName: job.name,
        payload: job.data,
        errorTrace: errorTrace(error),
        failedAt: sgtDatetime(clock()),
      });
    } catch (insertError) {
      // The job stays in BullMQ's failed set for manual recovery; the original error is still rethrown.
      log(`Could not write dead_letter_jobs row for job ${job.id ?? 'unknown'}: ${errorTrace(insertError)}`);
    }
  }

  return async function process(job: ProcessableJob): Promise<void> {
    const handler = handlers[job.name];
    if (handler === undefined) {
      const error = new UnrecoverableError(`No handler registered for task_name "${job.name}".`);
      await deadLetter(job, error);
      throw error;
    }

    try {
      await handler(job.data);
    } catch (error) {
      // Final when a bad job (UnrecoverableError) or when this was the last allowed attempt (BullMQ: attemptsMade + 1 >= attempts).
      const isFinal = isUnrecoverable(error) || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinal) await deadLetter(job, error);
      throw error; // BullMQ schedules the delayed retry (or marks the job failed); the worker stays free.
    }
  };
}

export type JobProcessor = ReturnType<typeof createJobProcessor>;
