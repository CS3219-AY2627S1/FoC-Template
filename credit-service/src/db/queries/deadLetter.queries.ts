// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-22
//  2026-10-22: Credit transfer consumer - dead_letter_jobs writes and reads, following
//    the same query-module shape as credits.queries.ts.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import type { Queryable } from '../transaction.js';

export interface DeadLetterEntry {
  jobId: string;
  taskName: string;
  payload: unknown;
  errorTrace: string;
  failedAt: Date;
}

export interface DeadLetterRow {
  id: string;
  job_id: string;
  task_name: string;
  payload: unknown;
  error_trace: string;
  failed_at: Date;
  status: string;
}

/**
 * Records a job BullMQ will not run again.
 *
 * `status` is left to its DEFAULT 'UNRESOLVED' rather than passed in: the default lives
 * in the schema, and writing it here as well would give it two homes.
 *
 * Not idempotent on job_id, and deliberately so. BullMQ will not call the failure
 * handler twice for one attempt, and if the same outbox id were somehow dead-lettered
 * twice that is itself worth seeing rather than silently collapsing.
 */
export async function insertDeadLetter(
  client: Queryable,
  entry: DeadLetterEntry,
): Promise<DeadLetterRow> {
  const { rows } = await client.query<DeadLetterRow>(
    `INSERT INTO dead_letter_jobs (job_id, task_name, payload, error_trace, failed_at)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     RETURNING id, job_id, task_name, payload, error_trace, failed_at, status`,
    [
      entry.jobId,
      entry.taskName,
      JSON.stringify(entry.payload ?? null),
      entry.errorTrace,
      entry.failedAt,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('insertDeadLetter: INSERT ... RETURNING produced no row');
  return row;
}

/** Every dead letter for one job id. Used by the tests and by manual investigation. */
export async function findDeadLettersByJobId(
  client: Queryable,
  jobId: string,
): Promise<DeadLetterRow[]> {
  const { rows } = await client.query<DeadLetterRow>(
    `SELECT id, job_id, task_name, payload, error_trace, failed_at, status
       FROM dead_letter_jobs
      WHERE job_id = $1
      ORDER BY id`,
    [jobId],
  );
  return rows;
}
