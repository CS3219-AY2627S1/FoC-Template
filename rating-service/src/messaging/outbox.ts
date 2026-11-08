/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated the transactional outbox relay to foc.user.rating.
 * Reviewed by Ngooi Jun Sen.
 */

import { and, asc, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../database/index.js';
import { outbox } from '../database/schema.js';

// The slice of a Kafka producer the relay needs; tests pass a fake.
export interface MessageSender {
  send(record: { topic: string; messages: { key: string; value: string }[] }): Promise<unknown>;
}

// Publishes one batch of unsent outbox rows, oldest first, then marks them sent.
// If a send fails the transaction rolls back and the whole batch is retried on
// the next pass, so delivery is at-least-once; consumers dedupe on eventId.
export async function relayOutboxBatch(sender: MessageSender, limit = 100): Promise<number> {
  return db.transaction(async (tx) => {
    // SKIP LOCKED lets several replicas relay without sending a row twice.
    const rows = await tx
      .select()
      .from(outbox)
      .where(isNull(outbox.sentAt))
      .orderBy(asc(outbox.outboxId))
      .limit(limit)
      .for('update', { skipLocked: true });

    if (rows.length === 0) return 0;

    for (const row of rows) {
      await sender.send({
        topic: row.topic,
        messages: [{ key: row.messageKey, value: JSON.stringify(row.payload) }],
      });
    }

    await tx
      .update(outbox)
      .set({ sentAt: sql`now()` })
      .where(
        inArray(
          outbox.outboxId,
          rows.map((r) => r.outboxId),
        ),
      );

    return rows.length;
  });
}

// Polls the outbox until stopped. Returns a function that stops the loop.
export function startOutboxRelay(
  sender: MessageSender,
  intervalMs: number,
  onError: (error: unknown) => void,
): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async (): Promise<void> => {
    try {
      // Keep draining while full batches come back.
      while (!stopped && (await relayOutboxBatch(sender)) > 0) {
        // loop
      }
    } catch (error) {
      onError(error);
    }
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  };

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

// Deletes rows sent more than retentionMs ago, so the outbox doesn't grow
// forever. Unsent rows are never touched. Returns how many were deleted.
export async function purgeSentOutbox(retentionMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionMs);
  const deleted = await db
    .delete(outbox)
    .where(and(isNotNull(outbox.sentAt), lt(outbox.sentAt, cutoff)))
    .returning({ outboxId: outbox.outboxId });
  return deleted.length;
}

// Purges on a timer until stopped. Returns a function that stops it.
export function startOutboxPurge(
  intervalMs: number,
  retentionMs: number,
  onError: (error: unknown) => void,
): () => void {
  const timer = setInterval(() => {
    purgeSentOutbox(retentionMs).catch(onError);
  }, intervalMs);
  return () => clearInterval(timer);
}
