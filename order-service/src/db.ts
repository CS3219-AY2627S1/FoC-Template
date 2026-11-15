/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Copied from credit-service/src/db.ts (branch_credit) and adapted: toAmount removed.
 *        Connection pool and transaction helper.
 * Author review: Reviewed and approved by @mattis.
 */
import { Pool, PoolClient } from "pg";
import { loadDatabaseConfig, DB_RESILIENCE } from "./config";
import { markDatabaseDown, markDatabaseUp } from "./dbAvailability";

export function createPool(): Pool {
  const pool = new Pool({
    connectionString: loadDatabaseConfig().databaseUrl,
    connectionTimeoutMillis: DB_RESILIENCE.poolConnectionTimeoutMs,
  });
  // An idle connection that the database drops is reported here. Without a listener Node
  // would crash the process; the pool discards the connection and makes a new one.
  pool.on("error", (err) => markDatabaseDown(err));
  pool.on("connect", () => markDatabaseUp());
  return pool;
}

// Thrown by rollback(): ends the transaction without changes and hands back a result
class Rollback<T> {
  constructor(readonly result: T) {}
}

/** Ends the current inTransaction() with ROLLBACK; inTransaction() returns `result`. */
export function rollback<T>(result: T): never {
  throw new Rollback(result);
}

/**
 * Runs `fn` in one database transaction: COMMIT if it returns, ROLLBACK if it throws or
 * calls rollback().
 */
export async function inTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      // The connection is unusable; release(err) makes the pool discard it
      broken = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
    }
    if (err instanceof Rollback) return err.result as T;
    throw err;
  } finally {
    client.release(broken);
  }
}

/** PostgreSQL unique_violation */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "23505";
}

