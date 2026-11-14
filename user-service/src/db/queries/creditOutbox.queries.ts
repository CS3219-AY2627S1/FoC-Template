// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-10-21
// Scope: Generated the credit-allocation outbox queries (Stage 14b). No requirements,
//        architecture, schema, or API decisions were made by the AI tool — see
//        instructions.md Stage 14 for the governing decision.
// Author review:

import pool from "../pool.js";
import type { Queryable } from "../transaction.js";

export type OutboxStatus = "pending" | "sent" | "dead";

export interface CreditAllocationOutboxRow {
  id: string;
  user_id: string;
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: Date;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

// Transaction-only: call with the same client as the activation/bootstrap insert it belongs to.
export async function insertCreditAllocation(
  userId: string,
  db: Queryable,
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO credit_allocation_outbox (user_id) VALUES ($1) RETURNING id`,
    [userId],
  );
  return result.rows[0]!.id;
}

export async function findDueCreditAllocations(
  limit: number,
  db: Queryable = pool,
): Promise<CreditAllocationOutboxRow[]> {
  const result = await db.query<CreditAllocationOutboxRow>(
    `SELECT * FROM credit_allocation_outbox
     WHERE status = 'pending' AND next_attempt_at <= clock_timestamp()
     ORDER BY next_attempt_at, created_at
     LIMIT $1`,
    [limit],
  );
  return result.rows;
}

export async function markCreditAllocationSent(
  id: string,
  db: Queryable = pool,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE credit_allocation_outbox SET status = 'sent', updated_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markCreditAllocationDead(
  id: string,
  lastError: string,
  db: Queryable = pool,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE credit_allocation_outbox
     SET status = 'dead', attempts = attempts + 1, last_error = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [id, lastError],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function recordCreditAllocationFailure(
  id: string,
  lastError: string,
  {
    maxAttempts,
    baseDelaySeconds,
    maxDelaySeconds,
  }: { maxAttempts: number; baseDelaySeconds: number; maxDelaySeconds: number },
  db: Queryable = pool,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE credit_allocation_outbox
     SET attempts = attempts + 1,
         last_error = $2,
         updated_at = NOW(),
         status = CASE WHEN attempts + 1 >= $3 THEN 'dead' ELSE status END,
         next_attempt_at = CASE
           WHEN attempts + 1 >= $3 THEN next_attempt_at
           ELSE clock_timestamp()
             + make_interval(secs => random() * LEAST($5, $4 * power(2, attempts)))
         END
     WHERE id = $1 AND status = 'pending'`,
    [id, lastError, maxAttempts, baseDelaySeconds, maxDelaySeconds],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function replayDeadCreditAllocations(
  ids: string[] | null,
  db: Queryable = pool,
): Promise<string[]> {
  const result = await db.query<{ id: string }>(
    ids === null
      ? `UPDATE credit_allocation_outbox
         SET status = 'pending', attempts = 0, next_attempt_at = NOW(), updated_at = NOW()
         WHERE status = 'dead'
         RETURNING id`
      : `UPDATE credit_allocation_outbox
         SET status = 'pending', attempts = 0, next_attempt_at = NOW(), updated_at = NOW()
         WHERE status = 'dead' AND id = ANY($1)
         RETURNING id`,
    ids === null ? [] : [ids],
  );
  return result.rows.map((row) => row.id);
}
