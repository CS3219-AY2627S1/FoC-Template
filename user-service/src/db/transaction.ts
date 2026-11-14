// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-25
// 25/09/2026: Stage 5a - transaction helper
// Author review:

import type pg from "pg";
import pool from "./pool.js";

export type Queryable = pg.Pool | pg.PoolClient;

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let discardClient = false;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      // The connection is unusable; keep the original error and drop the connection.
      discardClient = true;
      console.error("ROLLBACK failed:", rollbackErr);
    }
    throw err;
  } finally {
    client.release(discardClient);
  }
}
