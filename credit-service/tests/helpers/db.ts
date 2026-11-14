// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - test database helpers.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean
//  2026-10-16: Week 7/8 catch-up - cleanupUsers removed: the suite now connects as the
//    least-privilege role, which has no DELETE anywhere (NFR8.2.3). Isolation comes
//    from a database rebuilt per run plus a fresh UUID per case.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { randomUUID } from 'node:crypto';
import pool from '../../src/db/pool.js';
import { allocateInitialCredits, reserveCredits } from '../../src/services/credits.service.js';

export const newUserId = (): string => randomUUID();
export const newRequestId = (): string => randomUUID();

export async function readBalance(
  userId: string,
): Promise<{ total: number; reserved: number } | null> {
  const { rows } = await pool.query<{ total_balance: number; reserved_balance: number }>(
    'SELECT total_balance, reserved_balance FROM balances WHERE user_id = $1',
    [userId],
  );
  const row = rows[0];
  return row ? { total: row.total_balance, reserved: row.reserved_balance } : null;
}

export async function countTransactions(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM transaction_log
      WHERE originating_user_id = $1 OR destination_user_id = $1`,
    [userId],
  );
  return Number(rows[0]?.count ?? '0');
}

export async function countTransactionsForRequest(requestId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM transaction_log WHERE request_id = $1',
    [requestId],
  );
  return Number(rows[0]?.count ?? '0');
}

/** A funded user with `amount` credits reserved against a fresh request. */
export async function givenReservation(
  amount: number,
): Promise<{ requesterId: string; requestId: string }> {
  const requesterId = newUserId();
  const requestId = newRequestId();
  await allocateInitialCredits(requesterId);
  await reserveCredits(requesterId, requestId, amount);
  return { requesterId, requestId };
}

/** A user who exists and has been allocated their starting credits. */
export async function givenFundedUser(): Promise<string> {
  const userId = newUserId();
  await allocateInitialCredits(userId);
  return userId;
}

export async function closePool(): Promise<void> {
  await pool.end();
}
