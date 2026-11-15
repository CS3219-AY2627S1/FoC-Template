/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: The outbox as specified in implementation-proposal.md §4.4: insert in the caller's
 *        transaction, publish a batch in one transaction (FOR UPDATE SKIP LOCKED, produce,
 *        mark, commit), and delete published rows after the retention period.
 * Author review: Reviewed and approved by @phuc
 */
import { randomUUID } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { OUTBOX } from "./config";
import { inTransaction } from "./db";

export interface OutboxMessage {
  eventId: string;
  topic: string;
  key: string;
  payload: Record<string, unknown>;
}

/**
 * Adds an event to the outbox. Call it inside the transaction that makes the change, so the
 * event exists if and only if the change committed. `payload.event_id` is set to the row's
 * event_id.
 */
export async function insertOutboxEvent(
  client: PoolClient,
  event: { eventType: string; topic: string; key: string; payload: Record<string, unknown>; causationId: string | null },
): Promise<string> {
  const eventId = randomUUID();
  await client.query(
    `INSERT INTO outbox (event_id, event_type, topic, message_key, payload, causation_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [eventId, event.eventType, event.topic, event.key, { event_id: eventId, ...event.payload }, event.causationId],
  );
  return eventId;
}

/**
 * Publishes up to OUTBOX.batchSize unpublished events, oldest first. `produce` must send
 * every message and resolve only once Kafka has acknowledged all of them (acks=all); if it
 * throws, nothing is marked and the events are retried in a later batch.
 *
 * The transaction stays open through produce() and the marking, so the row locks stop
 * another publisher instance from taking the same rows. Returns the number published.
 */
export async function publishOutboxBatch(
  pool: Pool,
  produce: (messages: OutboxMessage[]) => Promise<void>,
): Promise<number> {
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `SELECT event_id, topic, message_key, payload
       FROM outbox
       WHERE published_at IS NULL
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [OUTBOX.batchSize],
    );
    if (rows.length === 0) return 0;

    await produce(
      rows.map((r) => ({ eventId: r.event_id, topic: r.topic, key: r.message_key, payload: r.payload })),
    );

    await client.query("UPDATE outbox SET published_at = now() WHERE event_id = ANY($1::uuid[])", [
      rows.map((r) => r.event_id),
    ]);
    return rows.length;
  });
}

/** Deletes events published more than OUTBOX.retentionDays ago. Returns the number deleted. */
export async function deletePublishedOutboxEvents(pool: Pool): Promise<number> {
  const result = await pool.query(
    "DELETE FROM outbox WHERE published_at < now() - make_interval(days => $1)",
    [OUTBOX.retentionDays],
  );
  return result.rowCount ?? 0;
}
