/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Database tests for the outbox publisher, adapted from credit-service/test/outbox.test.ts
 *        (branch_credit), written before the implementation per the approved plan.
 * Author review: Reviewed and approved by @mattis.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { Pool } from "pg";
import { inTransaction } from "../src/db";
import { insertOutboxEvent, publishOutboxBatch, startOutboxPublisher, type OutboxMessage } from "../src/outbox";
import { createTestDatabase, type TestDatabase } from "./helpers";

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

async function queueEvents(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const orderId = randomUUID();
    await inTransaction(pool, async (client) => {
      ids.push(
        await insertOutboxEvent(client, {
          eventType: "OrderExpired",
          topic: "credit.commands",
          key: orderId,
          payload: { type: "OrderExpired", order_id: orderId, seq: i },
        }),
      );
    });
  }
  return ids;
}

describe("outbox publisher", () => {
  it("publish batch marks rows published and keeps order", async () => {
    const ids = await queueEvents(5);
    const sent: OutboxMessage[] = [];
    assert.equal(await publishOutboxBatch(pool, async (m) => void sent.push(...m)), 5);
    assert.deepEqual(sent.map((m) => m.eventId), ids);
    assert.equal(sent[0].topic, "credit.commands");
    assert.equal(sent[2].payload.seq, 2);
    assert.equal(sent[0].payload.event_id, undefined);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM outbox WHERE published_at IS NULL");
    assert.equal(rows[0].n, 0);
    assert.equal(await publishOutboxBatch(pool, async () => {}), 0);
  });

  it("failed produce leaves rows unpublished", async () => {
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
  });

  it("two publishers never send the same row", async () => {
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
    assert.equal(sent.length, 30);
    assert.equal(new Set(sent.map((m) => m.eventId)).size, 30);
  });

  it("publisher loop sends rows and stop() waits for it", async () => {
    mock.method(console, "log", () => {});
    try {
      await queueEvents(2);
      const sent: OutboxMessage[] = [];
      const publisher = startOutboxPublisher(pool, { publish: async (m) => void sent.push(...m) });
      const until = Date.now() + 3000;
      while (sent.length < 2 && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
      await publisher.stop();
      assert.equal(sent.length, 2);
    } finally {
      mock.restoreAll();
    }
  });

  it("stop() during an in-flight batch resolves promptly after it", async () => {
    mock.method(console, "log", () => {});
    try {
      await queueEvents(1);
      let started!: () => void;
      const inFlight = new Promise<void>((r) => (started = r));
      const publisher = startOutboxPublisher(pool, {
        publish: async () => {
          started();
          await new Promise((r) => setTimeout(r, 150));
        },
      });
      await inFlight;
      const t = Date.now();
      await publisher.stop();
      // The batch ends with rows sent; the next batch finds none and would pause 250 ms
      assert.ok(Date.now() - t < 220, `stop took ${Date.now() - t} ms`);
    } finally {
      mock.restoreAll();
    }
  });

  it("stop() during a failing batch does not wait out the backoff", async () => {
    mock.method(console, "log", () => {});
    mock.method(console, "error", () => {});
    try {
      await queueEvents(1);
      let started!: () => void;
      const inFlight = new Promise<void>((r) => (started = r));
      const publisher = startOutboxPublisher(pool, {
        publish: async () => {
          started();
          await new Promise((r) => setTimeout(r, 50));
          throw new Error("down");
        },
      });
      await inFlight;
      const t = Date.now();
      await publisher.stop();
      assert.ok(Date.now() - t < 300, `stop took ${Date.now() - t} ms`);
    } finally {
      mock.restoreAll();
    }
  });

  it("publisher loop survives a failing publish and retries", async () => {
    mock.method(console, "log", () => {});
    mock.method(console, "error", () => {});
    try {
      await queueEvents(1);
      let calls = 0;
      const sent: OutboxMessage[] = [];
      const publisher = startOutboxPublisher(pool, {
        publish: async (m) => {
          if (++calls === 1) throw new Error("down");
          sent.push(...m);
        },
      });
      const until = Date.now() + 5000;
      while (sent.length < 1 && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
      await publisher.stop();
      assert.equal(sent.length, 1);
    } finally {
      mock.restoreAll();
    }
  });
});
