/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: Database tests for the credit.results consumer's record handling: replies, late
 *        replies, duplicates, the DLQ, retries and outages, with a fake DLQ producer.
 * Author review: Reviewed and approved by @phuc
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { Pool } from "pg";
import { CONSUMER } from "../src/config";
import { sweepAction } from "../src/deadlines/sweeper";
import { KafkaSendError, type KafkaRecord } from "../src/kafka/client";
import { processRecord, processWithRetry, type ConsumerDeps, type IncomingRecord } from "../src/kafka/creditResultsConsumer";
import { metrics } from "../src/metrics";
import { createTestDatabase, type TestDatabase } from "./helpers";
import { newErrand, reply, state } from "./kafkaFixtures";

let db: TestDatabase;
let pool: Pool;
let dlq: KafkaRecord[];
let offset = 0;

before(async () => {
  db = await createTestDatabase();
  pool = db.pool;
});
after(async () => db.drop());
beforeEach(() => {
  mock.method(console, "log", () => {});
  mock.method(console, "error", () => {});
  metrics.reset();
  dlq = [];
});
afterEach(() => mock.restoreAll());

function deps(over: Partial<ConsumerDeps> = {}): ConsumerDeps {
  return {
    pool,
    sendToDlq: async (messages) => void dlq.push(...messages),
    sleep: async () => {},
    isStopping: () => false,
    ...over,
  };
}

function record(body: unknown, key?: string | null): IncomingRecord {
  const value = typeof body === "string" ? body : JSON.stringify(body);
  const orderId = typeof body === "object" && body !== null ? (body as { order_id?: string }).order_id : undefined;
  return { topic: "credit.results", partition: 0, offset: String(offset++), key: key === undefined ? orderId ?? null : key, value };
}

function dlqReasons(): string[] {
  return dlq.map((m) => JSON.parse(m.value).reason);
}

async function processed(eventId: string) {
  const { rows } = await pool.query("SELECT * FROM processed_credit_results WHERE event_id = $1", [eventId]);
  return rows[0];
}

async function outboxTypes(orderId: string): Promise<string[]> {
  const { rows } = await pool.query("SELECT event_type FROM outbox WHERE message_key = $1 ORDER BY id", [orderId]);
  return rows.map((r) => r.event_type);
}

/** A pool whose connect() throws `make()` the first `times` times, then works. */
function failingPool(times: number, make: () => Error): Pool {
  let left = times;
  return {
    connect: () => {
      if (left-- > 0) return Promise.reject(make());
      return pool.connect();
    },
  } as unknown as Pool;
}

const outage = () => Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });

describe("replies", () => {
  it("CreditReserved opens the errand and records the event", async () => {
    const e = await newErrand(pool);
    const body = reply(e, "CreditReserved");
    assert.equal(await processRecord(deps(), record(body)), "opened");
    assert.equal(await state(pool, e.id), "OPEN");
    assert.equal((await processed(body.event_id as string)).outcome, "opened");
  });

  it("CreditReservationRejected closes the errand with the reason", async () => {
    const e = await newErrand(pool);
    assert.equal(await processRecord(deps(), record(reply(e, "CreditReservationRejected"))), "rejected");
    assert.equal(await state(pool, e.id), "RESERVATION_REJECTED");
  });

  it("a key in another case still matches order_id", async () => {
    const e = await newErrand(pool);
    assert.equal(await processRecord(deps(), record(reply(e, "CreditReserved"), e.id.toUpperCase())), "opened");
  });

  it("a redelivered event is skipped by event_id; a new event_id hits the state guard", async () => {
    const e = await newErrand(pool);
    const body = reply(e, "CreditReserved");
    assert.equal(await processRecord(deps(), record(body)), "opened");
    assert.equal(await processRecord(deps(), record(body)), "already_processed");
    assert.equal(await processRecord(deps(), record(reply(e, "CreditReserved"))), "duplicate");
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM errand_history WHERE errand_id = $1 AND action = 'reserved'", [e.id]);
    assert.equal(rows[0].n, 1);
    assert.equal(metrics.snapshot().resultsDuplicates, 1);
  });

  it("the same event delivered 10 times at once is applied once", async () => {
    const e = await newErrand(pool);
    const body = reply(e, "CreditReserved");
    const outcomes = await Promise.all(Array.from({ length: 10 }, () => processRecord(deps(), record(body))));
    assert.equal(outcomes.filter((o) => o === "opened").length, 1);
    assert.equal(outcomes.filter((o) => o === "already_processed").length, 9);
  });

  it("a late CreditReserved after a rejection queues OrderCancelled to release the hold", async () => {
    const e = await newErrand(pool);
    await processRecord(deps(), record(reply(e, "CreditReservationRejected")));
    assert.equal(await processRecord(deps(), record(reply(e, "CreditReserved"))), "late_reserve_cancelled");
    assert.deepEqual(await outboxTypes(e.id), ["ReserveRequested", "OrderCancelled"]);
  });

  it("replies after the reservation timeout change nothing; ReservationTimedOut releases the hold", async () => {
    const e = await newErrand(pool);
    await pool.query("UPDATE errands SET reservation_deadline = now() - interval '1 second' WHERE id = $1", [e.id]);
    assert.equal(await sweepAction(pool, "reservationTimeout"), 1);
    assert.equal(await processRecord(deps(), record(reply(e, "CreditReserved"))), "ignored_after_timeout");
    assert.equal(await processRecord(deps(), record(reply(e, "CreditReservationRejected"))), "ignored_after_timeout");
    assert.equal(await state(pool, e.id), "RESERVATION_TIMED_OUT");
    assert.deepEqual(await outboxTypes(e.id), ["ReserveRequested", "ReservationTimedOut"]);
    assert.equal(dlq.length, 0);
  });
});

describe("dead-letter queue", () => {
  it("dead-letters malformed and uncorrelated replies with the reason, recording nothing", async () => {
    const e = await newErrand(pool);
    const unknown: Record<string, unknown> = { ...reply(e, "CreditReserved"), order_id: randomUUID() };
    const wrongOperation = reply(e, "CreditReserved", { operation_id: randomUUID() });
    const cases: [IncomingRecord, string][] = [
      [record("{not json", e.id), "value is not valid JSON"],
      [record(reply(e, "CreditReserved", { schema_version: 2 })), "unsupported schema_version"],
      [record(reply(e, "CreditReserved", { type: "CreditCaptured" })), "unknown type"],
      [record(reply(e, "CreditReserved"), randomUUID()), "message key does not match order_id"],
      [record(reply(e, "CreditReserved"), null), "message key does not match order_id"],
      [record(unknown), "no errand with this order_id"],
      [record(wrongOperation), "operation_id is not the errand's reservation operation"],
    ];
    for (const [r] of cases) assert.equal(await processRecord(deps(), r), "dead_lettered");
    assert.deepEqual(dlqReasons(), cases.map(([, reason]) => reason));
    const first = JSON.parse(dlq[0].value);
    assert.equal(first.source_topic, "credit.results");
    assert.equal(first.original_value, "{not json");
    assert.equal(dlq[0].key, e.id);
    assert.equal(await state(pool, e.id), "PENDING_RESERVATION");
    assert.equal(await processed(unknown.event_id as string), undefined);
    assert.equal(await processed(wrongOperation.event_id as string), undefined);
    assert.equal(metrics.snapshot().resultsDeadLettered, cases.length);
  });

  it("a DLQ that does not acknowledge makes the record fail, so its offset is not committed", async () => {
    const r = record("{not json", randomUUID());
    await assert.rejects(
      processRecord(deps({ sendToDlq: async () => { throw new KafkaSendError("broker down"); } }), r),
      KafkaSendError,
    );
  });
});

describe("retries", () => {
  it("retries a failing record in place and applies it once it works", async () => {
    const e = await newErrand(pool);
    const sleeps: number[] = [];
    const d = deps({ pool: failingPool(2, () => new Error("deadlock detected")), sleep: async (ms) => void sleeps.push(ms) });
    assert.equal(await processWithRetry(d, record(reply(e, "CreditReserved")), { count: 0 }), "opened");
    assert.deepEqual(sleeps, [200, 400]);
    assert.equal(metrics.snapshot().resultsRetries, 2);
  });

  it(`dead-letters a record that fails ${CONSUMER.maxAttempts} times`, async () => {
    const e = await newErrand(pool);
    const d = deps({ pool: failingPool(99, () => new Error("bug")) });
    assert.equal(await processWithRetry(d, record(reply(e, "CreditReserved")), { count: 0 }), "dead_lettered");
    const dead = JSON.parse(dlq[0].value);
    assert.equal(dead.attempts, CONSUMER.maxAttempts);
    assert.match(dead.reason, /failed after 5 attempts: bug/);
    assert.equal(await state(pool, e.id), "PENDING_RESERVATION");
  });

  it("during a database outage it throws for redelivery and never dead-letters; the redelivery applies", async () => {
    const e = await newErrand(pool);
    const r = record(reply(e, "CreditReserved"));
    const outages = { count: 0 };
    const sleeps: number[] = [];
    const down = deps({ pool: failingPool(99, outage), sleep: async (ms) => void sleeps.push(ms) });
    for (let i = 0; i < 3; i++) await assert.rejects(processWithRetry(down, r, outages), /ECONNREFUSED/);
    assert.deepEqual(sleeps, [200, 400, 800]); // growing pauses between redeliveries
    assert.equal(dlq.length, 0);
    assert.equal(metrics.snapshot().resultsOutageRetries, 3);

    assert.equal(await processWithRetry(deps(), r, outages), "opened");
    assert.equal(outages.count, 0);
  });

  it("while stopping, a failing record is left for redelivery instead of the DLQ", async () => {
    const e = await newErrand(pool);
    const d = deps({ pool: failingPool(99, () => new Error("bug")), isStopping: () => true });
    await assert.rejects(processWithRetry(d, record(reply(e, "CreditReserved")), { count: 0 }), /bug/);
    assert.equal(dlq.length, 0);
  });
});
