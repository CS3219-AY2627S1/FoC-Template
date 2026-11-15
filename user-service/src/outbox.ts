// AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status outbox. Author review: Reviewed and approved by @phuc.
import { randomUUID } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { OUTBOX } from "./config";

export type NotifiedStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";
export interface OutboxMessage { key: string; value: string }

export async function recordStatusChange(
  client: PoolClient,
  change: { accountId: string; newStatus: NotifiedStatus; firstActive: boolean },
): Promise<void> {
  if (change.firstActive && change.newStatus !== "ACTIVE") throw new Error("first_active requires ACTIVE");
  const operationId = randomUUID();
  await client.query(
    "INSERT INTO outbox (event_id, topic, message_key, payload) VALUES ($1, $2, $3, $4)",
    [operationId, OUTBOX.topic, change.accountId, {
      operation_id: operationId, account_id: change.accountId, new_status: change.newStatus,
      first_active: change.firstActive, occurred_at: new Date().toISOString(), schema_version: 1,
    }],
  );
}

/** One publisher across replicas; mark nothing until every selected message is acknowledged. */
export async function publishOutboxBatch(db: Pool, produce: (messages: OutboxMessage[]) => Promise<void>): Promise<number> {
  const client = await db.connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    const { rows: [lock] } = await client.query("SELECT pg_try_advisory_xact_lock($1) AS ok", [OUTBOX.lockId]);
    if (!lock.ok) { await client.query("ROLLBACK"); return 0; }
    const { rows } = await client.query(
      "SELECT id, message_key, payload FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT $1",
      [OUTBOX.batchSize],
    );
    if (rows.length) {
      await produce(rows.map((row) => ({ key: row.message_key, value: JSON.stringify(row.payload) })));
      await client.query("UPDATE outbox SET published_at = now() WHERE id = ANY($1::bigint[])", [rows.map((row) => row.id)]);
    }
    await client.query("COMMIT");
    return rows.length;
  } catch (err) {
    try { await client.query("ROLLBACK"); }
    catch (rollbackError) { broken = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)); }
    throw err;
  } finally { client.release(broken); }
}

/** Bounded statements; the loop can yield to publishing/shutdown between cleanup batches. */
export async function deletePublishedOutboxEvents(db: Pool): Promise<number> {
  const result = await db.query(
    `DELETE FROM outbox WHERE id IN (
       SELECT id FROM outbox WHERE published_at < now() - make_interval(days => $1)
       ORDER BY published_at LIMIT 1000)`, [OUTBOX.retentionDays],
  );
  return result.rowCount ?? 0;
}

export async function outboxBacklog(db: Pool) {
  const { rows: [row] } = await db.query(
    `SELECT count(*)::text AS pending,
       COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at))) * 1000, 0)::float8 AS oldest_ms
     FROM outbox WHERE published_at IS NULL`,
  );
  return { pending: row.pending as string, oldestMs: row.oldest_ms as number };
}
