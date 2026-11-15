/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: Database tests for the Kafka side of the outbox: id order, the advisory lock, batch
 *        size, acknowledgement before marking, crash recovery, wake-on-commit and back-off,
 *        using a fake producer.
 * Author review: Reviewed and approved by @phuc
 */
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { Pool } from "pg";
import { OUTBOX } from "../src/config";
import { inTransaction } from "../src/db";
import { KafkaSendError, SharedProducer } from "../src/kafka/client";
import { KafkaCreditPublisher } from "../src/kafka/creditPublisher";
import { metrics } from "../src/metrics";
import { listenForCommits, outboxBacklog, publishOutboxBatch, startOutboxPublisher } from "../src/outbox";
import { createTestDatabase, type TestDatabase } from "./helpers";
import { complete, FakeProducer, newErrand, REQUESTER, waitFor } from "./kafkaFixtures";
import { handleCreditResult } from "../src/credit/creditResults";
import { randomUUID } from "node:crypto";

let db: TestDatabase;
let pool: Pool;

before(async () => {
  db = await createTestDatabase();
  pool = db.pool;
});
after(async () => db.drop());
beforeEach(async () => {
  mock.method(console, "log", () => {});
  mock.method(console, "error", () => {});
  metrics.reset();
  await pool.query("DELETE FROM outbox");
});
afterEach(() => mock.restoreAll());

function publisherWith(fake: FakeProducer) {
  return new KafkaCreditPublisher(new SharedProducer(fake));
}

async function unpublished(): Promise<number> {
  return (await outboxBacklog(pool)).outboxPending;
}

describe("KafkaCreditPublisher through the outbox", () => {
  it("sends rows in id order with key = order_id and the stored payload, at most 100 per send", async () => {
    const errands = [];
    for (let i = 0; i < 150; i++) errands.push(await newErrand(pool));
    const fake = new FakeProducer();
    const publisher = publisherWith(fake);

    assert.equal(await publishOutboxBatch(pool, (m) => publisher.publish(m)), 100);
    assert.equal(await publishOutboxBatch(pool, (m) => publisher.publish(m)), 50);
    assert.equal(await publishOutboxBatch(pool, (m) => publisher.publish(m)), 0);

    // One send per batch: nothing waits for a full batch, and nothing is split further
    assert.deepEqual(fake.sends.map((s) => [s.topic, s.messages.length]), [["credit.commands", 100], ["credit.commands", 50]]);
    const sent = fake.messages();
    assert.deepEqual(sent.map((m) => m.key), errands.map((e) => e.id));
    for (const [i, m] of sent.entries()) {
      assert.equal(m.body.type, "ReserveRequested");
      assert.equal(m.body.order_id, m.key);
      assert.equal(m.body.operation_id, errands[i].reservationOperationId);
    }
    assert.equal(await unpublished(), 0);
  });

  it("keeps one errand's messages in commit order: ReserveRequested before OrderCompleted", async () => {
    const e = await newErrand(pool);
    await handleCreditResult(pool, { type: "CreditReserved", eventId: randomUUID(), operationId: e.reservationOperationId, orderId: e.id, reservationId: randomUUID() });
    await complete(pool, e.id);
    const fake = new FakeProducer();
    await publishOutboxBatch(pool, (m) => publisherWith(fake).publish(m));
    assert.deepEqual(fake.messages().map((m) => m.body.type), ["ReserveRequested", "OrderCompleted"]);
    assert.equal(fake.messages()[1].body.requester_id, REQUESTER);
  });

  it("a publisher that cannot take the advisory lock sends nothing", async () => {
    await newErrand(pool);
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock($1)", [OUTBOX.lockId]);
      const fake = new FakeProducer();
      assert.equal(await publishOutboxBatch(pool, (m) => publisherWith(fake).publish(m)), 0);
      assert.equal(fake.sends.length, 0);
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    assert.equal(await publishOutboxBatch(pool, async () => {}), 1);
  });

  it("concurrent publishers send every row exactly once, in id order overall", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 250; i++) ids.push((await newErrand(pool)).id);
    const fake = new FakeProducer();
    const slow = new KafkaCreditPublisher(new SharedProducer({
      ...fake,
      connect: () => fake.connect(),
      disconnect: () => fake.disconnect(),
      // Slow acknowledgements keep each publisher inside its transaction for a while
      send: async (r) => {
        await new Promise((res) => setTimeout(res, 20));
        await fake.send(r);
      },
    }));
    const loops = [startOutboxPublisher(pool, slow), startOutboxPublisher(pool, slow), startOutboxPublisher(pool, slow)];
    await waitFor("every row published", async () => (await unpublished()) === 0);
    await Promise.all(loops.map((l) => l.stop()));
    assert.deepEqual(fake.messages().map((m) => m.key), ids);
  });

  it("a failed send marks nothing, and the retry sends the same payloads and operation_ids", async () => {
    const e = await newErrand(pool);
    const fake = new FakeProducer();
    fake.failNextSends = 1;
    const publisher = publisherWith(fake);
    await assert.rejects(publishOutboxBatch(pool, (m) => publisher.publish(m)), KafkaSendError);
    assert.equal(await unpublished(), 1);

    assert.equal(await publishOutboxBatch(pool, (m) => publisher.publish(m)), 1);
    assert.equal(fake.messages().length, 1);
    assert.equal(fake.messages()[0].body.operation_id, e.reservationOperationId);
  });

  it("crash after Kafka acknowledged but before the row was marked: resent with the same operation_id", async () => {
    const e = await newErrand(pool);
    const fake = new FakeProducer();
    const publisher = publisherWith(fake);
    // The send succeeds, then the process "dies" before the UPDATE commits
    await assert.rejects(
      publishOutboxBatch(pool, async (m) => {
        await publisher.publish(m);
        throw new Error("process killed");
      }),
      /process killed/,
    );
    assert.equal(await unpublished(), 1);
    await publishOutboxBatch(pool, (m) => publisher.publish(m));
    // At-least-once: Credit sees the same operation_id twice and applies it once
    assert.deepEqual(fake.messages().map((m) => m.body.operation_id), [e.reservationOperationId, e.reservationOperationId]);
    assert.equal(await unpublished(), 0);
  });

  it("SharedProducer connects lazily and again after a failed connect", async () => {
    const fake = new FakeProducer();
    fake.failNextConnects = 1;
    const producer = new SharedProducer(fake);
    assert.equal(fake.connects, 0);
    await assert.rejects(producer.send("credit.commands", [{ key: "k", value: "{}" }]), KafkaSendError);
    await producer.send("credit.commands", [{ key: "k", value: "{}" }]);
    await producer.send("credit.commands", [{ key: "k", value: "{}" }]);
    assert.equal(fake.connects, 2);
    assert.equal(fake.sends.length, 2);
  });
});

describe("publisher loop", () => {
  it("a commit that adds a row wakes the listener; a rolled-back one does not", async () => {
    let wakes = 0;
    const listener = listenForCommits(pool, () => wakes++);
    try {
      // The listener wakes once when it starts listening
      await waitFor("listening", () => wakes >= 1);
      const before = wakes;
      await assert.rejects(
        inTransaction(pool, async (client) => {
          await client.query("SELECT pg_notify($1, '')", [OUTBOX.wakeChannel]);
          throw new Error("rolled back");
        }),
      );
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(wakes, before, "a rolled-back transaction must not wake");
      await newErrand(pool);
      await waitFor("wake after commit", () => wakes > before);
    } finally {
      await listener.stop();
    }
  });

  it("publishes a newly committed row without waiting for a full batch", async () => {
    const fake = new FakeProducer();
    const loop = startOutboxPublisher(pool, publisherWith(fake));
    try {
      await new Promise((r) => setTimeout(r, 300)); // let it go idle
      const e = await newErrand(pool);
      await waitFor("the one row sent", () => fake.messages().some((m) => m.key === e.id), 2_000);
      assert.equal(fake.sends.at(-1)!.messages.length, 1);
      assert.ok(metrics.snapshot().outboxPublished >= 1);
    } finally {
      await loop.stop();
    }
  });

  it("backs off during an outage, and wake-ups do not shorten the back-off", async () => {
    await newErrand(pool);
    let calls = 0;
    const loop = startOutboxPublisher(pool, {
      publish: async () => {
        calls++;
        throw new KafkaSendError("broker down");
      },
    }, { listen: false });
    const waker = setInterval(() => loop.wake(), 5);
    await new Promise((r) => setTimeout(r, 1_100));
    clearInterval(waker);
    await loop.stop();
    // Pauses of 400 ms then 800 ms: attempts at about 0, 400 and 1200 ms
    assert.ok(calls >= 2 && calls <= 3, `expected 2-3 attempts, got ${calls}`);
    assert.equal(metrics.snapshot().outboxPublishFailures, calls);
    assert.equal(await unpublished(), 1);
  });
});
