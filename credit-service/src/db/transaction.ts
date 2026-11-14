// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - transaction helper, copied from the team's
//    user-service/src/db/transaction.ts so both services roll back identically.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean

import type pg from 'pg';
import pool from './pool.js';

export type Queryable = pg.Pool | pg.PoolClient;

/**
 * Runs `fn` inside a single BEGIN/COMMIT. Any throw rolls the whole thing back.
 *
 * This is what NFR8.1.1 (atomic concurrent balance updates) and NFR8.1.2 (complete
 * rollback on failure) rest on: the balance UPDATE and the transaction_log INSERT are
 * issued on the same client inside the same transaction, so they commit or fail together
 * and there can never be a logged operation that did not happen (context §5).
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let discardClient = false;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // The connection is unusable; keep the original error and drop the connection.
      discardClient = true;
      console.error('ROLLBACK failed:', rollbackErr);
    }
    throw err;
  } finally {
    client.release(discardClient);
  }
}
