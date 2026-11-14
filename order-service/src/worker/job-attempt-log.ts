/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-22
 * Scope (2026-10-22): Observability - one JSON log line per job attempt with orderId, jobId,
 *        attempt and result, correlated by the payload's requestId (George, 2026-10-22:
 *        JSON lines). Field names beyond those four and the result values
 *        (completed | retrying | failed) are by convention.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */

import { UnrecoverableError, type Job } from 'bullmq';

/** The subset of a BullMQ job the logger reads. */
export type LoggedJob = Pick<
  Job,
  'id' | 'name' | 'data' | 'attemptsMade' | 'opts'
>;

/** `retrying`: BullMQ will run the job again; `failed`: it will not (dead-lettered). */
export type AttemptResult = 'completed' | 'retrying' | 'failed';

export interface JobAttemptLine {
  event: 'job_attempt';
  ts: string;
  queue: string;
  task: string;
  jobId: string | null;
  /** The order the job is about; for the credit tasks this is the payload's requestId. */
  orderId: string | null;
  /** Correlation id shared with credit-service (the reservation's requestId). */
  requestId: string | null;
  attempt: number;
  maxAttempts: number;
  result: AttemptResult;
  durationMs: number;
  error?: string;
}

export interface AttemptLogOptions {
  log?: (line: string) => void;
  now?: () => number;
}

const requestIdOf = (data: unknown): string | null => {
  const id = (data as { requestId?: unknown } | null)?.requestId;
  return typeof id === 'string' ? id : null;
};

/**
 * Wraps a BullMQ processor so every attempt writes exactly one line, then passes the
 * outcome through unchanged (a thrown error is rethrown for BullMQ's retry logic).
 */
export function withAttemptLog<J extends LoggedJob>(
  queueKey: string,
  processor: (job: J) => Promise<void>,
  { log = console.log, now = Date.now }: AttemptLogOptions = {},
): (job: J) => Promise<void> {
  return async (job) => {
    const startedAt = now();
    // attemptsMade counts finished attempts, so the running one is the next.
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    const requestId = requestIdOf(job.data);
    const emit = (result: AttemptResult, error?: unknown) => {
      const line: JobAttemptLine = {
        event: 'job_attempt',
        ts: new Date(startedAt).toISOString(),
        queue: queueKey,
        task: job.name,
        jobId: job.id ?? null,
        orderId: requestId,
        requestId,
        attempt,
        maxAttempts,
        result,
        durationMs: now() - startedAt,
        ...(error !== undefined && {
          error: error instanceof Error ? error.message : JSON.stringify(error),
        }),
      };
      log(JSON.stringify(line));
    };

    try {
      await processor(job);
    } catch (error) {
      const final =
        error instanceof UnrecoverableError || attempt >= maxAttempts;
      emit(final ? 'failed' : 'retrying', error);
      throw error;
    }
    emit('completed');
  };
}
