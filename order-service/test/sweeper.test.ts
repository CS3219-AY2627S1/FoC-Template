/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Tests for the deadline sweeper (expiry and the four timeouts), written before the
 *        implementation per the approved plan.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: The accept-vs-expiry race test now runs 100 rounds with staggered starts and asserts both outcomes occur.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: The accept-vs-expiry race alternates which side starts 1-4 ms first and runs the
 *        expire sweep alone, so both outcomes occur whatever the machine's speed.
 * Author review of additional changes: Reviewed and approved by @phuc
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { createTestDatabase, TestDatabase } from "./helpers";
import { handleCreditResult } from "../src/credit/creditResults";
import { startDeadlineSweeper, sweepAction, sweepDeadlines } from "../src/deadlines/sweeper";
import { applyTransition, applyTransitionInTx, createErrand } from "../src/errands/repository";
import type { Actor, Errand, SupplierSnapshot } from "../src/errands/errand";

let db: TestDatabase;
let pool: Pool;
before(async () => {
  db = await createTestDatabase();
  pool = db.pool;
});
after(async () => {
  await db.drop();
});

const HOUR = 3_600_000;
const SUPPLIER: SupplierSnapshot = {
  id: "5d0c1e2a-3b4c-4d5e-8f60-718293a4b5c6",
  name: "Frontier Canteen",
  buildingCode: "COM1",
  locationDescription: "Level 1, next to the lift",
};
const REQUESTER = "a1111111-1111-4111-8111-111111111111";
const COURIER = "b2222222-2222-4222-8222-222222222222";
const member = (id: string): Actor => ({ kind: "user", id, role: "MEMBER" });

async function newErrand(): Promise<Errand> {
  const now = Date.now();
  return createErrand(
    pool,
    REQUESTER,
    {
      supplierId: SUPPLIER.id,
      items: [{ name: "Chicken rice", quantity: 1 }],
      dropoffLocation: "COM2 lobby",
      notes: null,
      creditAmount: 10,
      listingDeadline: new Date(now + HOUR),
      pickupDeadline: new Date(now + 2 * HOUR),
      deliveryDeadline: new Date(now + 3 * HOUR),
    },
    SUPPLIER,
  );
}

async function open(): Promise<Errand> {
  const e = await newErrand();
  await handleCreditResult(pool, {
    type: "CreditReserved", eventId: randomUUID(), operationId: e.reservationOperationId, orderId: e.id, reservationId: randomUUID(),
  });
  return e;
}

async function step(id: string, action: "accept" | "pickup" | "deliver"): Promise<void> {
  const r = await applyTransition(pool, id, action, member(COURIER));
  assert.equal(r.ok, true, `${action} failed`);
}

// Moves every deadline of the errand into the past (the order the CHECK constraint needs)
async function age(id: string): Promise<void> {
  const now = Date.now();
  await pool.query(
    `UPDATE errands SET reservation_deadline = $2, listing_deadline = $3, pickup_deadline = $4, delivery_deadline = $5,
       confirm_deadline = CASE WHEN confirm_deadline IS NULL THEN NULL ELSE $6::timestamptz END WHERE id = $1`,
    [id, new Date(now - 4 * HOUR), new Date(now - 3 * HOUR), new Date(now - 2 * HOUR), new Date(now - HOUR), new Date(now - HOUR)],
  );
}

async function row(id: string) {
  const { rows } = await pool.query(`SELECT * FROM errands WHERE id = $1`, [id]);
  return rows[0];
}
async function outbox(id: string) {
  const { rows } = await pool.query(
    `SELECT event_type, topic, payload FROM outbox WHERE message_key = $1 AND event_type <> 'ReserveRequested' ORDER BY created_at`,
    [id],
  );
  return rows as { event_type: string; topic: string; payload: Record<string, unknown> }[];
}
async function lastHistory(id: string) {
  const { rows } = await pool.query(`SELECT * FROM errand_history WHERE errand_id = $1 ORDER BY id DESC LIMIT 1`, [id]);
  return rows[0];
}

test("expires OPEN past listing deadline with one OrderExpired", async () => {
  const e = await open();
  await age(e.id);
  const counts = await sweepDeadlines(pool);
  assert.ok(counts.expire >= 1);
  const r = await row(e.id);
  assert.equal(r.state, "EXPIRED");
  assert.notEqual(r.closed_at, null);
  const msgs = await outbox(e.id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].event_type, "OrderExpired");
  assert.equal(msgs[0].topic, "credit.commands");
  const h = await lastHistory(e.id);
  assert.equal(h.actor_type, "SYSTEM");
  assert.equal(h.action, "expire");
  await sweepDeadlines(pool);
  assert.equal((await outbox(e.id)).length, 1);
});

test("pickup timeout returns ACCEPTED to OPEN and clears courier", async () => {
  const e = await open();
  await step(e.id, "accept");
  await age(e.id);
  // age() makes the listing deadline past too, so run this action alone to see the OPEN state
  assert.ok((await sweepAction(pool, "pickupTimeout")) >= 1);
  const r = await row(e.id);
  assert.equal(r.state, "OPEN");
  assert.equal(r.courier_id, null);
  assert.equal((await outbox(e.id)).length, 0);
  assert.equal((await lastHistory(e.id)).action, "pickupTimeout");
  // In a full sweep the errand returned to OPEN can then expire in the same tick
  await sweepDeadlines(pool);
  assert.equal((await row(e.id)).state, "EXPIRED");
});

test("delivery timeout moves PICKED_UP to DISPUTED, no outbox row", async () => {
  const e = await open();
  await step(e.id, "accept");
  await step(e.id, "pickup");
  await age(e.id);
  const counts = await sweepDeadlines(pool);
  assert.ok(counts.deliveryTimeout >= 1);
  assert.equal((await row(e.id)).state, "DISPUTED");
  assert.equal((await outbox(e.id)).length, 0);
});

test("confirm timeout completes DELIVERED with OrderCompleted", async () => {
  const e = await open();
  await step(e.id, "accept");
  await step(e.id, "pickup");
  await step(e.id, "deliver");
  await age(e.id);
  const counts = await sweepDeadlines(pool);
  assert.ok(counts.confirmTimeout >= 1);
  assert.equal((await row(e.id)).state, "COMPLETED");
  const msgs = await outbox(e.id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].event_type, "OrderCompleted");
});

test("reservation timeout closes PENDING_RESERVATION with one ReservationTimedOut", async () => {
  const e = await newErrand();
  await age(e.id);
  const counts = await sweepDeadlines(pool);
  assert.ok(counts.reservationTimeout >= 1);
  assert.equal((await row(e.id)).state, "RESERVATION_TIMED_OUT");
  const msgs = await outbox(e.id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].event_type, "ReservationTimedOut");
  assert.equal("courier_id" in msgs[0].payload, false);
  assert.equal(msgs[0].payload.amount, e.creditAmount);
  assert.equal(msgs[0].payload.requester_id, e.requesterId);
});

test("reply racing reservation timeout: never both", async () => {
  const ROUNDS = 100;
  const ids: string[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const e = await newErrand();
    ids.push(e.id);
    // The sweep runs with a clock past the reservation deadline; the reply runs at the real time
    const future = new Date(Date.now() + 10 * 60_000);
    await Promise.all([
      handleCreditResult(pool, {
        type: "CreditReserved", eventId: randomUUID(), operationId: e.reservationOperationId, orderId: e.id, reservationId: randomUUID(),
      }),
      sweepDeadlines(pool, future),
    ]);
  }
  let timedOut = 0;
  let openCount = 0;
  let msgs = 0;
  for (const id of ids) {
    const s = (await row(id)).state;
    if (s === "RESERVATION_TIMED_OUT") timedOut++;
    else {
      assert.equal(s, "OPEN");
      openCount++;
    }
    msgs += (await outbox(id)).filter((m) => m.event_type === "ReservationTimedOut").length;
  }
  assert.equal(timedOut + openCount, ROUNDS);
  assert.equal(msgs, timedOut);
  // Both outcomes must occur, otherwise the two sides are not really racing
  assert.ok(timedOut > 0 && openCount > 0, `no race: OPEN=${openCount} TIMED_OUT=${timedOut}`);
});

test("leaves errands before their deadline alone", async () => {
  const pending = await newErrand();
  const o = await open();
  const accepted = await open();
  await step(accepted.id, "accept");
  const picked = await open();
  await step(picked.id, "accept");
  await step(picked.id, "pickup");
  const delivered = await open();
  await step(delivered.id, "accept");
  await step(delivered.id, "pickup");
  await step(delivered.id, "deliver");
  await sweepDeadlines(pool);
  assert.equal((await row(pending.id)).state, "PENDING_RESERVATION");
  assert.equal((await row(o.id)).state, "OPEN");
  assert.equal((await row(accepted.id)).state, "ACCEPTED");
  assert.equal((await row(picked.id)).state, "PICKED_UP");
  assert.equal((await row(delivered.id)).state, "DELIVERED");
  for (const e of [pending, o, accepted, picked, delivered]) assert.equal((await outbox(e.id)).length, 0);
});

test("two concurrent sweeps produce one OrderExpired per errand", async () => {
  const ids: string[] = [];
  for (let i = 0; i < 30; i++) {
    const e = await open();
    await age(e.id);
    ids.push(e.id);
  }
  await Promise.all([sweepDeadlines(pool), sweepDeadlines(pool)]);
  const { rows } = await pool.query(
    `SELECT message_key, count(*)::int AS n FROM outbox WHERE event_type = 'OrderExpired' AND message_key = ANY($1) GROUP BY message_key`,
    [ids],
  );
  assert.equal(rows.length, 30);
  assert.ok(rows.every((r) => r.n === 1));
  for (const id of ids) assert.equal((await row(id)).state, "EXPIRED");
});

test("accept racing expiry: never both", async () => {
  const ROUNDS = 100;
  const ids: string[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const e = await open();
    ids.push(e.id);
    // Both are legal at their own clock: the accept at the real time, the sweep 90 minutes on
    // (past the listing deadline, before the pickup deadline)
    const future = new Date(Date.now() + 90 * 60_000);
    // Each side starts 1-4 ms ahead in alternate rounds, so each wins some rounds on any machine.
    // A fixed offset did not: depending on speed, one side won every round. The sweep is the
    // expire action alone, so the full sweep's earlier phases don't shift the timing.
    const lead = 1 + (i % 4);
    const acceptFirst = i % 2 === 0;
    const after = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const accept = after(acceptFirst ? 0 : lead).then(() => applyTransition(pool, e.id, "accept", member(COURIER)));
    const expire = after(acceptFirst ? lead : 0).then(() => sweepAction(pool, "expire", future));
    await Promise.all([accept, expire]);
  }
  let accepted = 0;
  let expired = 0;
  for (const id of ids) {
    const s = (await row(id)).state;
    if (s === "EXPIRED") expired++;
    else {
      assert.equal(s, "ACCEPTED");
      accepted++;
    }
  }
  assert.equal(accepted + expired, ROUNDS);
  // Both outcomes must occur, otherwise the two sides are not really racing
  assert.ok(accepted > 0 && expired > 0, `no race: ACCEPTED=${accepted} EXPIRED=${expired}`);
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM outbox WHERE event_type = 'OrderExpired' AND message_key = ANY($1)`,
    [ids],
  );
  assert.equal(rows[0].n, expired);
});

test("a failing row does not stop other rows or other actions in the same sweep", async () => {
  const bad: string[] = [];
  const good: string[] = [];
  for (let i = 0; i < 3; i++) {
    const b = await open();
    await age(b.id);
    bad.push(b.id);
  }
  for (let i = 0; i < 2; i++) {
    const g = await open();
    await age(g.id);
    good.push(g.id);
  }
  const pending = await newErrand();
  await age(pending.id);
  const delivered = await open();
  await step(delivered.id, "accept");
  await step(delivered.id, "pickup");
  await step(delivered.id, "deliver");
  await age(delivered.id);

  // Fails after writing, so the savepoint rollback must undo the partial work
  const flaky: typeof applyTransitionInTx = async (client, id, action, actor, opts) => {
    const r = await applyTransitionInTx(client, id, action, actor, opts);
    if (bad.includes(id)) throw new Error("injected failure");
    return r;
  };
  const errors = console.error;
  console.error = () => {}; // the sweeper logs each skipped row
  try {
    await sweepDeadlines(pool, new Date(), flaky);
  } finally {
    console.error = errors;
  }
  for (const id of bad) {
    assert.equal((await row(id)).state, "OPEN");
    assert.equal((await outbox(id)).length, 0);
  }
  for (const id of good) assert.equal((await row(id)).state, "EXPIRED");
  assert.equal((await row(pending.id)).state, "RESERVATION_TIMED_OUT");
  assert.equal((await row(delivered.id)).state, "COMPLETED");
  // Healthy sweeps pick the rows up again once the failure is gone
  await sweepDeadlines(pool);
  for (const id of bad) assert.equal((await row(id)).state, "EXPIRED");
});

test("stop() resolves", async () => {
  const sweeper = startDeadlineSweeper(pool);
  await sweeper.stop();
});
