/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Database tests for the outbox publisher (implementation-proposal.md §4.4, §12).
 * Author review: Reviewed and approved by @phuc
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { Pool } from "pg";
import { OutboxMessage, deletePublishedOutboxEvents, publishOutboxBatch } from "../src/outbox";
import { handleReserveRequested } from "../src/reservations";
import { TestDatabase, activeAccount, createTestDatabase, reserveMsg } from "./helpers";

let db: TestDatabase;
let pool: Pool;

before(async () => {
  db = await createTestDatabase();
  pool = db.pool;
});
after(async () => db.drop());
beforeEach(async () => {
  await pool.query("DELETE FROM outbox");
});

async function queueEvents(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const outcome = await handleReserveRequested(pool, reserveMsg(await activeAccount(pool), 1));
    assert.equal(outcome.kind, "reserved");
  }
}

describe("outbox publisher", () => {
  it("publishes each event exactly once with two publishers running at once", async () => {
    await queueEvents(30);
    const sent: OutboxMessage[] = [];
    const produce = async (messages: OutboxMessage[]) => {
      // Slow producer, so both publishers are inside their transactions at the same time
      await new Promise((resolve) => setTimeout(resolve, 50));
      sent.push(...messages);
    };

    let total = 0;
    for (;;) {
      const counts = await Promise.all([publishOutboxBatch(pool, produce), publishOutboxBatch(pool, produce)]);
      total += counts[0] + counts[1];
      if (counts[0] + counts[1] === 0) break;
    }

    assert.equal(total, 30);
    assert.equal(new Set(sent.map((m) => m.eventId)).size, 30);
    assert.equal(sent.length, 30);
    for (const m of sent) {
      assert.equal(m.topic, "credit.results");
      assert.equal(m.payload.event_id, m.eventId);
      assert.equal(m.payload.order_id, m.key);
    }
  });

  it("leaves events unpublished when producing fails, and retries them later", async () => {
    await queueEvents(3);
    await assert.rejects(
      publishOutboxBatch(pool, async () => {
        throw new Error("broker unavailable");
      }),
      /broker unavailable/,
    );
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM outbox WHERE published_at IS NULL");
    assert.equal(rows[0].n, 3);

    assert.equal(await publishOutboxBatch(pool, async () => {}), 3);
    assert.equal(await publishOutboxBatch(pool, async () => {}), 0);
  });

  it("deletes only events published more than 7 days ago", async () => {
    await queueEvents(2);
    await publishOutboxBatch(pool, async () => {});
    await pool.query(
      "UPDATE outbox SET published_at = now() - interval '8 days' WHERE event_id = (SELECT event_id FROM outbox LIMIT 1)",
    );
    assert.equal(await deletePublishedOutboxEvents(pool), 1);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM outbox");
    assert.equal(rows[0].n, 1);
  });
});
