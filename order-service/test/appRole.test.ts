/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: Runs the Kafka integration's database paths as the order_app role, so a missing grant
 *        in a migration fails here rather than in the running service.
 * Author review: Reviewed and approved by @phuc
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it, mock } from "node:test";
import type { Pool, PoolClient } from "pg";
import { handleCreditResult } from "../src/credit/creditResults";
import { sweepAction } from "../src/deadlines/sweeper";
import { applyTransition } from "../src/errands/repository";
import { outboxBacklog, publishOutboxBatch } from "../src/outbox";
import { createTestDatabase, type TestDatabase } from "./helpers";
import { complete, member, newErrand, REQUESTER, state } from "./kafkaFixtures";

let db: TestDatabase;
let app: Pool;

/**
 * The test pool connects as a superuser; this one switches every connection to order_app, the
 * role the service runs as, before handing it out.
 */
function asOrderApp(pool: Pool): Pool {
  const connect = async (): Promise<PoolClient> => {
    const client = await pool.connect();
    await client.query("SET ROLE order_app");
    const release = client.release.bind(client);
    client.release = (err?: Error | boolean) => {
      // A connection that still had order_app set would leak the role into the next test
      if (err) return release(err);
      client.query("RESET ROLE").then(() => release(), (e) => release(e));
    };
    return client;
  };
  const query = async (text: string, values?: unknown[]) => {
    const client = await connect();
    try {
      return await client.query(text, values);
    } finally {
      client.release();
    }
  };
  return { connect, query } as unknown as Pool;
}

before(async () => {
  mock.method(console, "log", () => {});
  db = await createTestDatabase();
  app = asOrderApp(db.pool);
});
after(async () => {
  await db.drop();
  mock.restoreAll();
});

it("order_app can create, publish, apply replies (with dedup), compensate late replies and time out", async () => {
  const opened = await newErrand(app);
  const reserved = { type: "CreditReserved" as const, eventId: randomUUID(), operationId: opened.reservationOperationId, orderId: opened.id, reservationId: randomUUID() };
  assert.equal(await handleCreditResult(app, reserved), "opened");
  assert.equal(await handleCreditResult(app, reserved), "already_processed");
  await complete(app, opened.id);

  const rejected = await newErrand(app);
  assert.equal(await handleCreditResult(app, { type: "CreditReservationRejected", eventId: randomUUID(), operationId: rejected.reservationOperationId, orderId: rejected.id, reasonCode: "INSUFFICIENT_CREDIT" }), "rejected");
  assert.equal(await handleCreditResult(app, { ...reserved, eventId: randomUUID(), operationId: rejected.reservationOperationId, orderId: rejected.id }), "late_reserve_cancelled");

  const timedOut = await newErrand(app);
  await db.pool.query("UPDATE errands SET reservation_deadline = now() - interval '1 second' WHERE id = $1", [timedOut.id]);
  assert.equal(await sweepAction(app, "reservationTimeout"), 1);
  assert.equal(await state(app, timedOut.id), "RESERVATION_TIMED_OUT");

  const cancelled = await newErrand(app);
  await handleCreditResult(app, { ...reserved, eventId: randomUUID(), operationId: cancelled.reservationOperationId, orderId: cancelled.id });
  assert.equal((await applyTransition(app, cancelled.id, "cancel", member(REQUESTER))).ok, true);

  const sent: string[] = [];
  let total = 0;
  for (let n; (n = await publishOutboxBatch(app, async (m) => void sent.push(...m.map((x) => String(x.payload.type))))) > 0;) total += n;
  assert.deepEqual(sent, [
    "ReserveRequested", "OrderCompleted", "ReserveRequested", "OrderCancelled", "ReserveRequested", "ReservationTimedOut",
    "ReserveRequested", "OrderCancelled",
  ]);
  assert.equal(total, sent.length);
  assert.deepEqual(await outboxBacklog(app), { outboxPending: 0, outboxOldestMs: 0 });
});
