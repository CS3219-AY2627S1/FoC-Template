/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: Integration tests against a real Kafka broker and PostgreSQL: the outbox publisher and
 *        the credit.results consumer playing against a simulated Credit Service, covering
 *        reserve/rejection, completion/release, timeouts and late replies, duplicates, the DLQ,
 *        crash recovery, concurrent publishers and a broker outage.
 * Author review: Reviewed and approved by @phuc
 * Additional AI assistance: OpenAI Codex, 2026-11-09. Scope: approved rollback/publication and retry identity assertions. Review: Reviewed and approved by @ron on 2026-11-09.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it, mock } from "node:test";
import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { Pool } from "pg";
import { StubSessionVerifier } from "../src/adapters/sessionVerifier";
import { StubSupplierDirectory } from "../src/adapters/supplierDirectory";
import { CONSUMER_GROUP, TOPICS } from "../src/config";
import { sweepAction } from "../src/deadlines/sweeper";
import type { Errand } from "../src/errands/errand";
import { applyTransition } from "../src/errands/repository";
import { createApp } from "../src/http/app";
import { createKafka, createProducer, SharedProducer } from "../src/kafka/client";
import { KafkaCreditPublisher } from "../src/kafka/creditPublisher";
import { createResultsConsumer, startCreditResultsConsumer, type ConsumerLike } from "../src/kafka/creditResultsConsumer";
import { metrics } from "../src/metrics";
import { insertOutboxEvent, outboxBacklog, startOutboxPublisher } from "../src/outbox";
import { createTestDatabase, type TestDatabase } from "./helpers";
import { complete, COURIER, member, newErrand, REQUESTER, reply, state, waitFor } from "./kafkaFixtures";

// Set by scripts/test-kafka.sh: a throwaway broker with the topics created, and its container
// (paused and resumed by the outage test)
const BROKERS = process.env.TEST_KAFKA_BROKERS?.split(",");
const CONTAINER = process.env.TEST_KAFKA_CONTAINER;

interface Seen {
  topic: string;
  key: string | null;
  body: Record<string, any>;
}

/** Plays Credit Service: reads credit.commands and the DLQ, and sends replies to credit.results. */
class CreditSimulator {
  readonly seen: Seen[] = [];
  private readonly kafka: KafkaJS.Kafka;
  private readonly producer: KafkaJS.Producer;
  private readonly consumer: KafkaJS.Consumer;

  constructor(brokers: string[]) {
    this.kafka = new KafkaJS.Kafka({ kafkaJS: { brokers, clientId: "credit-simulator", logLevel: KafkaJS.logLevel.ERROR } });
    this.producer = this.kafka.producer({ kafkaJS: { idempotent: true, acks: -1 } });
    this.consumer = this.kafka.consumer({ kafkaJS: { groupId: `credit-sim-${randomUUID()}`, fromBeginning: true } });
  }

  async start(): Promise<void> {
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [TOPICS.commands, TOPICS.resultsDlq] });
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        this.seen.push({ topic, key: message.key?.toString("utf8") ?? null, body: JSON.parse(message.value!.toString("utf8")) });
      },
    });
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
    await this.producer.disconnect();
  }

  async send(key: string | null, value: string | Record<string, unknown>): Promise<void> {
    await this.producer.send({
      topic: TOPICS.results,
      messages: [{ key, value: typeof value === "string" ? value : JSON.stringify(value) }],
    });
  }

  commands(orderId: string): Seen[] {
    return this.seen.filter((m) => m.topic === TOPICS.commands && m.key === orderId);
  }

  dead(): Seen[] {
    return this.seen.filter((m) => m.topic === TOPICS.resultsDlq);
  }

  async waitForCommand(orderId: string, type: string): Promise<Seen> {
    return waitFor(`${type} for ${orderId}`, () => this.commands(orderId).find((m) => m.body.type === type), 20_000);
  }

  admin(): KafkaJS.Admin {
    return this.kafka.admin();
  }
}

describe("Kafka integration", { skip: BROKERS ? false : "TEST_KAFKA_BROKERS is not set (run scripts/test-kafka.sh)" }, () => {
  let db: TestDatabase;
  let pool: Pool;
  let credit: CreditSimulator;
  let producer: SharedProducer;
  let publisher: { stop(): Promise<void> };
  let consumer: { stop(): Promise<void> };
  // Lets a test make the consumer's next offset commit fail, as if it crashed before committing
  let failNextCommit = false;

  async function errandState(id: string, wanted: string): Promise<void> {
    await waitFor(`errand ${id} in ${wanted}`, async () => (await state(pool, id)) === wanted, 20_000);
  }

  /** Creates an errand, waits for its ReserveRequested and answers CreditReserved. */
  async function openErrand() {
    const e = await newErrand(pool);
    await credit.waitForCommand(e.id, "ReserveRequested");
    await credit.send(e.id, reply(e, "CreditReserved"));
    await errandState(e.id, "OPEN");
    return e;
  }

  before(async () => {
    mock.method(console, "log", () => {});
    db = await createTestDatabase();
    pool = db.pool;
    credit = new CreditSimulator(BROKERS!);
    await credit.start();

    const kafka = createKafka({ brokers: BROKERS!, clientId: "order-service-it" });
    producer = new SharedProducer(createProducer(kafka));
    publisher = startOutboxPublisher(pool, new KafkaCreditPublisher(producer));
    consumer = startCreditResultsConsumer(
      kafka,
      { pool, sendToDlq: (messages) => producer.send(TOPICS.resultsDlq, messages) },
      () => {
        const real = createResultsConsumer(kafka);
        const wrapped: ConsumerLike = {
          connect: () => real.connect(),
          subscribe: (s) => real.subscribe(s),
          run: (c) => real.run(c),
          disconnect: () => real.disconnect(),
          commitOffsets: async (offsets) => {
            if (failNextCommit) {
              failNextCommit = false;
              throw new Error("crashed before the offset commit");
            }
            return real.commitOffsets(offsets);
          },
        };
        return wrapped;
      },
    );
  });

  after(async () => {
    await consumer?.stop();
    await publisher?.stop();
    await producer?.disconnect();
    await credit?.stop();
    await db?.drop();
    mock.restoreAll();
  });

  it("rolled-back outbox work is never published, while later committed work is delivered", async () => {
    const key = randomUUID();
    const client = await pool.connect();
    let eventId: string;
    try {
      await client.query("BEGIN");
      eventId = await insertOutboxEvent(client, {
        eventType: "ReserveRequested", topic: TOPICS.commands, key,
        payload: { type: "ReserveRequested", schema_version: 1, operation_id: randomUUID(), order_id: key, requester_id: REQUESTER, amount: 10, occurred_at: new Date().toISOString() },
      });
      await client.query("ROLLBACK");
    } finally { client.release(); }
    // Publication of later committed work is a progress barrier, not an arbitrary sleep.
    const marker = await newErrand(pool);
    await credit.waitForCommand(marker.id, "ReserveRequested");
    assert.equal(credit.commands(key).length, 0);
    assert.equal((await pool.query("SELECT * FROM outbox WHERE event_id=$1", [eventId])).rowCount, 0);
  });

  it("reserve: ReserveRequested keyed by order_id; CreditReserved opens the errand", async () => {
    const e = await newErrand(pool);
    const sent = await credit.waitForCommand(e.id, "ReserveRequested");
    assert.equal(sent.body.order_id, e.id);
    assert.equal(sent.body.operation_id, e.reservationOperationId);
    assert.equal(sent.body.requester_id, REQUESTER);
    assert.equal(sent.body.amount, 10);
    await credit.send(e.id, reply(e, "CreditReserved"));
    await errandState(e.id, "OPEN");
  });

  it("rejection: CreditReservationRejected closes the errand with the reason", async () => {
    const e = await newErrand(pool);
    await credit.waitForCommand(e.id, "ReserveRequested");
    await credit.send(e.id, reply(e, "CreditReservationRejected", { reason_code: "ACCOUNT_NOT_ACTIVE" }));
    await errandState(e.id, "RESERVATION_REJECTED");
    const { rows } = await pool.query("SELECT rejection_reason FROM errands WHERE id = $1", [e.id]);
    assert.equal(rows[0].rejection_reason, "ACCOUNT_NOT_ACTIVE");
  });

  it("completion and release: OrderCompleted pays the courier; OrderCancelled releases", async () => {
    const done = await openErrand();
    await complete(pool, done.id);
    const completed = await credit.waitForCommand(done.id, "OrderCompleted");
    assert.equal(completed.body.courier_id, COURIER);
    assert.equal(completed.body.amount, 10);

    const cancelled = await openErrand();
    assert.equal((await applyTransition(pool, cancelled.id, "cancel", member(REQUESTER))).ok, true);
    const release = await credit.waitForCommand(cancelled.id, "OrderCancelled");
    assert.equal(release.body.courier_id, null);
    // Per errand, Credit reads the reserve before the closing message
    assert.deepEqual(credit.commands(cancelled.id).map((m) => m.body.type), ["ReserveRequested", "OrderCancelled"]);
  });

  it("timeout and late replies: ReservationTimedOut is sent; a late CreditReserved changes nothing", async () => {
    const e = await newErrand(pool);
    await credit.waitForCommand(e.id, "ReserveRequested");
    await pool.query("UPDATE errands SET reservation_deadline = now() - interval '1 second' WHERE id = $1", [e.id]);
    assert.equal(await sweepAction(pool, "reservationTimeout"), 1);
    const timedOut = await credit.waitForCommand(e.id, "ReservationTimedOut");
    assert.equal(timedOut.body.amount, 10);

    await credit.send(e.id, reply(e, "CreditReserved"));
    await waitFor("late reply recorded", async () => {
      const { rows } = await pool.query("SELECT outcome FROM processed_credit_results WHERE order_id = $1", [e.id]);
      return rows[0]?.outcome === "ignored_after_timeout";
    }, 20_000);
    assert.equal(await state(pool, e.id), "RESERVATION_TIMED_OUT");
    assert.deepEqual(credit.commands(e.id).map((m) => m.body.type), ["ReserveRequested", "ReservationTimedOut"]);
  });

  it("late CreditReserved after a rejection sends OrderCancelled to release the hold", async () => {
    const e = await newErrand(pool);
    await credit.waitForCommand(e.id, "ReserveRequested");
    await credit.send(e.id, reply(e, "CreditReservationRejected"));
    await errandState(e.id, "RESERVATION_REJECTED");
    await credit.send(e.id, reply(e, "CreditReserved"));
    const release = await credit.waitForCommand(e.id, "OrderCancelled");
    assert.equal(release.body.requester_id, REQUESTER);
  });

  it("duplicates: the same reply delivered twice is applied once", async () => {
    const e = await newErrand(pool);
    await credit.waitForCommand(e.id, "ReserveRequested");
    const body = reply(e, "CreditReserved");
    const before = metrics.snapshot().resultsDuplicates;
    await credit.send(e.id, body);
    await credit.send(e.id, body);
    await waitFor("duplicate seen", () => metrics.snapshot().resultsDuplicates > before, 20_000);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM errand_history WHERE errand_id = $1 AND action = 'reserved'", [e.id]);
    assert.equal(rows[0].n, 1);
  });

  it("DLQ: malformed and uncorrelated replies are dead-lettered, and later replies still flow", async () => {
    const e = await newErrand(pool);
    await credit.waitForCommand(e.id, "ReserveRequested");
    const before = credit.dead().length;
    await credit.send(e.id, "{not json");
    await credit.send(randomUUID(), reply(e, "CreditReserved")); // key is not the order_id
    await credit.send(e.id, reply(e, "CreditReserved", { operation_id: randomUUID() }));
    const unknown = randomUUID();
    await credit.send(unknown, { ...reply(e, "CreditReserved"), order_id: unknown });
    await credit.send(e.id, reply(e, "CreditReserved"));
    await errandState(e.id, "OPEN");

    const dead = await waitFor("four DLQ messages", () => (credit.dead().length >= before + 4 ? credit.dead().slice(before) : undefined), 20_000);
    assert.deepEqual(dead.map((m) => m.body.reason), [
      "value is not valid JSON",
      "message key does not match order_id",
      "operation_id is not the errand's reservation operation",
      "no errand with this order_id",
    ]);
    assert.equal(dead[0].body.source_topic, TOPICS.results);
    assert.equal(dead[0].body.original_value, "{not json");

    // Every offset up to the last reply is committed
    const admin = credit.admin();
    await admin.connect();
    try {
      const [high] = await admin.fetchTopicOffsets(TOPICS.results);
      await waitFor("offsets committed", async () => {
        const [committed] = await admin.fetchOffsets({ groupId: CONSUMER_GROUP, topics: [TOPICS.results] });
        return committed.partitions[0].offset === high.high;
      }, 20_000);
    } finally {
      await admin.disconnect();
    }
  });

  it("crash recovery: a reply applied but not committed is redelivered and skipped", async () => {
    const e = await newErrand(pool);
    await credit.waitForCommand(e.id, "ReserveRequested");
    const before = metrics.snapshot().resultsDuplicates;
    failNextCommit = true;
    await credit.send(e.id, reply(e, "CreditReserved"));
    await waitFor("redelivered and skipped", () => metrics.snapshot().resultsDuplicates > before, 20_000);
    assert.equal(failNextCommit, false);
    assert.equal(await state(pool, e.id), "OPEN");
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM errand_history WHERE errand_id = $1 AND action = 'reserved'", [e.id]);
    assert.equal(rows[0].n, 1);
  });

  it("concurrent publishers (replicas) send each row once, in order per errand", async () => {
    const kafka = createKafka({ brokers: BROKERS!, clientId: "order-service-replica" });
    const extraProducers = [new SharedProducer(createProducer(kafka)), new SharedProducer(createProducer(kafka))];
    const replicas = extraProducers.map((p) => startOutboxPublisher(pool, new KafkaCreditPublisher(p)));
    try {
      const errands: Errand[] = [];
      for (let i = 0; i < 40; i++) errands.push(await newErrand(pool));
      await waitFor("every reserve sent", () => errands.every((e) => credit.commands(e.id).length > 0), 30_000);
      for (const e of errands) await credit.send(e.id, reply(e, "CreditReserved"));
      for (const e of errands) await errandState(e.id, "OPEN");
      for (const e of errands) assert.equal((await applyTransition(pool, e.id, "cancel", member(REQUESTER))).ok, true);
      await waitFor("every release sent", () => errands.every((e) => credit.commands(e.id).length === 2), 30_000);
      for (const e of errands) {
        assert.deepEqual(credit.commands(e.id).map((m) => m.body.type), ["ReserveRequested", "OrderCancelled"]);
      }
    } finally {
      await Promise.all(replicas.map((r) => r.stop()));
      await Promise.all(extraProducers.map((p) => p.disconnect()));
    }
  });

  it("broker outage: HTTP stays ready, rows wait in the outbox, and everything flows once Kafka is back", { skip: CONTAINER ? false : "TEST_KAFKA_CONTAINER is not set", timeout: 120_000 }, async () => {
    const server = createApp({ pool, verifier: new StubSessionVerifier(), suppliers: new StubSupplierDirectory() }).listen(0);
    const port = (server.address() as AddressInfo).port;
    const failuresBefore = metrics.snapshot().outboxPublishFailures;
    execFileSync("docker", ["pause", CONTAINER!]);
    let paused = true;
    try {
      const e = await newErrand(pool);
      const pending = (await pool.query("SELECT event_id, payload FROM outbox WHERE message_key=$1", [e.id])).rows[0];
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(health.status, 200);
      await waitFor("a failed publish", () => metrics.snapshot().outboxPublishFailures > failuresBefore, 30_000);
      assert.ok((await outboxBacklog(pool)).outboxPending >= 1);

      execFileSync("docker", ["unpause", CONTAINER!]);
      paused = false;
      const delivered = await credit.waitForCommand(e.id, "ReserveRequested");
      assert.deepEqual(delivered.body, pending.payload, "retry preserves the logical event and operation identity");
      await credit.send(e.id, reply(e, "CreditReserved"));
      await errandState(e.id, "OPEN");
      await waitFor("outbox drained", async () => (await outboxBacklog(pool)).outboxPending === 0, 30_000);
      const sent = (await pool.query("SELECT event_id, payload, published_at FROM outbox WHERE event_id=$1", [pending.event_id])).rows[0];
      assert.deepEqual(sent.payload, pending.payload);
      assert.ok(sent.published_at);
    } finally {
      if (paused) execFileSync("docker", ["unpause", CONTAINER!]);
      server.close();
    }
  });

  it("startup does not wait for Kafka, and stop() is prompt while it is unreachable", async () => {
    const dead = createKafka({ brokers: ["127.0.0.1:1"], clientId: "order-service-unreachable" });
    const deadProducer = new SharedProducer(createProducer(dead));
    const t = Date.now();
    const deadConsumer = startCreditResultsConsumer(dead, { pool, sendToDlq: (m) => deadProducer.send(TOPICS.resultsDlq, m) });
    const deadPublisher = startOutboxPublisher(pool, new KafkaCreditPublisher(deadProducer), { listen: false });
    assert.ok(Date.now() - t < 100, "starting must not block on Kafka");
    await new Promise((r) => setTimeout(r, 1_500));
    const stopping = Date.now();
    await deadConsumer.stop();
    // As in index.ts: disconnecting aborts a connect the publisher may be waiting on
    await Promise.all([deadPublisher.stop(), deadProducer.disconnect()]);
    assert.ok(Date.now() - stopping < 5_000, `stop took ${Date.now() - stopping} ms`);
  });
});
