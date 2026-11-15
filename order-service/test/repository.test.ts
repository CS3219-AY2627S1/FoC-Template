/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Tests for atomic errand creation and state transitions (history + outbox), written
 *        before the implementation per the approved plan.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: A non-party's failed accept carries no currentState.
 * Author review: Reviewed and approved by @mattis.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { createTestDatabase, TestDatabase } from "./helpers";
import { applyTransition, createErrand } from "../src/errands/repository";
import type { Actor, Errand, SupplierSnapshot } from "../src/errands/errand";
import { terminalEventPayload } from "../src/domain/messages";
import type { TerminalEventType } from "../src/domain/transitions";

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

const member = (id: string): Actor => ({ kind: "user", id, role: "MEMBER" });
const admin = (id: string): Actor => ({ kind: "user", id, role: "ADMINISTRATOR" });

async function newErrand(requesterId: string): Promise<Errand> {
  const now = Date.now();
  return createErrand(
    pool,
    requesterId,
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

// Stands in for the CreditReserved reply (Task 4)
async function newOpenErrand(requesterId: string): Promise<Errand> {
  const e = await newErrand(requesterId);
  await pool.query(`UPDATE errands SET state = 'OPEN' WHERE id = $1`, [e.id]);
  return { ...e, state: "OPEN" };
}

async function outbox(errandId: string) {
  const { rows } = await pool.query(
    `SELECT event_type, topic, message_key, payload FROM outbox WHERE message_key = $1 ORDER BY created_at`,
    [errandId],
  );
  return rows as { event_type: string; topic: string; message_key: string; payload: Record<string, unknown> }[];
}

async function stateOf(errandId: string): Promise<string> {
  const { rows } = await pool.query(`SELECT state FROM errands WHERE id = $1`, [errandId]);
  return rows[0].state;
}

async function ok(p: ReturnType<typeof applyTransition>): Promise<Errand> {
  const r = await p;
  assert.ok(r.ok, `expected ok, got ${JSON.stringify(r)}`);
  return r.errand;
}

/** A DELIVERED errand from requester `a` carried by courier `b`. */
async function deliveredErrand(a: string, b: string): Promise<Errand> {
  const e = await newOpenErrand(a);
  await ok(applyTransition(pool, e.id, "accept", member(b)));
  await ok(applyTransition(pool, e.id, "pickup", member(b)));
  return ok(applyTransition(pool, e.id, "deliver", member(b)));
}

test("create writes errand, history and one ReserveRequested", async () => {
  const a = randomUUID();
  const e = await newErrand(a);
  assert.equal(e.state, "PENDING_RESERVATION");
  assert.equal(e.requesterId, a);
  assert.deepEqual(e.items, [{ name: "Chicken rice", quantity: 1 }]);
  assert.ok(e.reservationDeadline > e.createdAt);

  const { rows: history } = await pool.query(
    `SELECT from_state, to_state, action, actor_type, actor_id FROM errand_history WHERE errand_id = $1`,
    [e.id],
  );
  assert.deepEqual(history, [
    { from_state: null, to_state: "PENDING_RESERVATION", action: "create", actor_type: "USER", actor_id: a },
  ]);

  const rows = await outbox(e.id);
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.event_type, "ReserveRequested");
  assert.equal(row.topic, "credit.commands");
  assert.equal(row.message_key, e.id);
  assert.deepEqual(
    Object.keys(row.payload).sort(),
    ["amount", "occurred_at", "operation_id", "order_id", "requester_id", "schema_version", "type"],
  );
  assert.equal(row.payload.type, "ReserveRequested");
  assert.equal(row.payload.schema_version, 1);
  assert.equal(row.payload.operation_id, e.reservationOperationId);
  assert.equal(row.payload.order_id, e.id);
  assert.equal(row.payload.requester_id, a);
  assert.equal(row.payload.amount, 10);
});

test("terminal payloads match the contract", async () => {
  const a = randomUUID();
  const b = randomUUID();
  const e = await newErrand(a);
  const withCourier: Errand = { ...e, courierId: b };
  const types: TerminalEventType[] = ["OrderCompleted", "OrderCancelled", "OrderExpired", "OrderFailed"];
  for (const type of types) {
    const operationId = randomUUID();
    const p = terminalEventPayload(withCourier, type, operationId);
    assert.deepEqual(
      Object.keys(p).sort(),
      ["amount", "courier_id", "occurred_at", "operation_id", "order_id", "requester_id", "schema_version", "type"],
      type,
    );
    assert.equal(p.type, type);
    assert.equal(p.schema_version, 1);
    assert.equal(p.courier_id, type === "OrderCompleted" ? b : null, type);
    assert.equal(p.operation_id, operationId);
    assert.notEqual(p.operation_id, e.reservationOperationId);
    assert.equal(p.order_id, e.id);
    assert.equal(p.requester_id, a);
    assert.equal(p.amount, 10);
  }
  assert.throws(() => terminalEventPayload(e, "OrderCompleted", randomUUID()));
});

test("cancel while PENDING_RESERVATION is INVALID_STATE and writes no outbox row", async () => {
  const a = randomUUID();
  const e = await newErrand(a);
  const r = await applyTransition(pool, e.id, "cancel", member(a));
  assert.deepEqual(r, { ok: false, error: "INVALID_STATE", currentState: "PENDING_RESERVATION" });
  assert.deepEqual((await outbox(e.id)).map((o) => o.event_type), ["ReserveRequested"]);
  assert.equal(await stateOf(e.id), "PENDING_RESERVATION");
});

test("happy path reaches COMPLETED with one OrderCompleted", async () => {
  const a = randomUUID();
  const b = randomUUID();
  const e = await newOpenErrand(a);
  const accepted = await ok(applyTransition(pool, e.id, "accept", member(b)));
  assert.equal(accepted.state, "ACCEPTED");
  assert.equal(accepted.courierId, b);
  assert.ok(accepted.acceptedAt);
  const picked = await ok(applyTransition(pool, e.id, "pickup", member(b)));
  assert.ok(picked.pickedUpAt);
  await ok(applyTransition(pool, e.id, "deliver", member(b)));
  const done = await ok(applyTransition(pool, e.id, "confirm", member(a)));
  assert.equal(done.state, "COMPLETED");
  assert.ok(done.closedAt);

  const terminal = (await outbox(e.id)).filter((o) => o.event_type !== "ReserveRequested");
  assert.equal(terminal.length, 1);
  assert.equal(terminal[0].event_type, "OrderCompleted");
  assert.equal(terminal[0].topic, "credit.commands");
  assert.equal(terminal[0].message_key, e.id);
  assert.equal(terminal[0].payload.type, "OrderCompleted");
  assert.equal(terminal[0].payload.courier_id, b);
  assert.equal(terminal[0].payload.requester_id, a);
  assert.equal(terminal[0].payload.amount, 10);
  assert.notEqual(terminal[0].payload.operation_id, e.reservationOperationId);

  const { rows: history } = await pool.query(
    `SELECT from_state, to_state, action, actor_type, actor_id FROM errand_history WHERE errand_id = $1 ORDER BY id`,
    [e.id],
  );
  assert.equal(history.length, 5);
  assert.deepEqual(history.slice(1), [
    { from_state: "OPEN", to_state: "ACCEPTED", action: "accept", actor_type: "USER", actor_id: b },
    { from_state: "ACCEPTED", to_state: "PICKED_UP", action: "pickup", actor_type: "USER", actor_id: b },
    { from_state: "PICKED_UP", to_state: "DELIVERED", action: "deliver", actor_type: "USER", actor_id: b },
    { from_state: "DELIVERED", to_state: "COMPLETED", action: "confirm", actor_type: "USER", actor_id: a },
  ]);
});

test("deliver sets confirm_deadline", async () => {
  const e = await deliveredErrand(randomUUID(), randomUUID());
  assert.ok(e.deliveredAt && e.confirmDeadline);
  assert.equal(e.confirmDeadline.getTime() - e.deliveredAt.getTime(), 1440 * 60_000);
});

test("requester cannot accept own errand", async () => {
  const a = randomUUID();
  const e = await newOpenErrand(a);
  const r = await applyTransition(pool, e.id, "accept", member(a));
  assert.deepEqual(r, { ok: false, error: "CANNOT_ACCEPT_OWN_ERRAND" });
  assert.equal(await stateOf(e.id), "OPEN");
});

test("ten concurrent accepts: exactly one wins", async () => {
  const e = await newOpenErrand(randomUUID());
  const couriers = Array.from({ length: 10 }, () => randomUUID());
  const results = await Promise.all(couriers.map((c) => applyTransition(pool, e.id, "accept", member(c))));
  const wins = results.filter((r) => r.ok);
  assert.equal(wins.length, 1);
  for (const r of results.filter((r) => !r.ok)) {
    // A non-party loser is not told what the errand became
    assert.deepEqual(r, { ok: false, error: "INVALID_STATE" });
  }
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM errand_history WHERE errand_id = $1 AND action = 'accept'`,
    [e.id],
  );
  assert.equal(rows[0].n, 1);
});

// cancel is allowed from both OPEN and ACCEPTED, so when accept commits first the cancel
// still succeeds (from ACCEPTED); only an accept that loses to cancel gets INVALID_STATE.
test("accept racing cancel: one wins, the other gets INVALID_STATE", async () => {
  for (let i = 0; i < 20; i++) {
    const a = randomUUID();
    const b = randomUUID();
    const e = await newOpenErrand(a);
    const [accepted, cancelled] = await Promise.all([
      applyTransition(pool, e.id, "accept", member(b)),
      applyTransition(pool, e.id, "cancel", member(a)),
    ]);
    for (const r of [accepted, cancelled]) {
      if (!r.ok) assert.equal(r.error, "INVALID_STATE");
    }
    assert.ok(accepted.ok || cancelled.ok);
    const final = await stateOf(e.id);
    assert.ok(final === "ACCEPTED" || final === "CANCELLED", final);
    const cancelWins = cancelled.ok ? 1 : 0;
    const rows = await outbox(e.id);
    assert.equal(rows.filter((o) => o.event_type === "OrderCancelled").length, cancelWins);
    assert.equal(rows.length, 1 + cancelWins);
    if (!accepted.ok) assert.equal(accepted.currentState, undefined);
    const { rows: history } = await pool.query(
      `SELECT from_state FROM errand_history WHERE errand_id = $1 AND action = 'cancel'`,
      [e.id],
    );
    assert.deepEqual(history, [{ from_state: accepted.ok ? "ACCEPTED" : "OPEN" }]);
  }
});

test("confirm twice: second is INVALID_STATE and only one OrderCompleted", async () => {
  const a = randomUUID();
  const e = await deliveredErrand(a, randomUUID());
  const results = await Promise.all([
    applyTransition(pool, e.id, "confirm", member(a)),
    applyTransition(pool, e.id, "confirm", member(a)),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.deepEqual(results.find((r) => !r.ok), { ok: false, error: "INVALID_STATE", currentState: "COMPLETED" });
  const completed = (await outbox(e.id)).filter((o) => o.event_type === "OrderCompleted");
  assert.equal(completed.length, 1);
});

test("unrelated member cannot pickup", async () => {
  const e = await newOpenErrand(randomUUID());
  await ok(applyTransition(pool, e.id, "accept", member(randomUUID())));
  const r = await applyTransition(pool, e.id, "pickup", member(randomUUID()));
  assert.deepEqual(r, { ok: false, error: "NOT_FOUND" });
  assert.equal(await stateOf(e.id), "ACCEPTED");
});

test("requester cannot pickup", async () => {
  const a = randomUUID();
  const e = await newOpenErrand(a);
  await ok(applyTransition(pool, e.id, "accept", member(randomUUID())));
  const r = await applyTransition(pool, e.id, "pickup", member(a));
  assert.deepEqual(r, { ok: false, error: "FORBIDDEN" });
  assert.equal(await stateOf(e.id), "ACCEPTED");
});

test("rejects accept after listing deadline even before sweep", async () => {
  const e = await newOpenErrand(randomUUID());
  const late = new Date(e.listingDeadline.getTime() + 1000);
  const r = await applyTransition(pool, e.id, "accept", member(randomUUID()), { now: late });
  assert.deepEqual(r, { ok: false, error: "DEADLINE_PASSED" });
  assert.equal(await stateOf(e.id), "OPEN");
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM errand_history WHERE errand_id = $1`, [e.id]);
  assert.equal(rows[0].n, 1);
});

test("cancel from ACCEPTED emits OrderCancelled with courier_id null", async () => {
  const a = randomUUID();
  const b = randomUUID();
  const e = await newOpenErrand(a);
  await ok(applyTransition(pool, e.id, "accept", member(b)));
  const cancelled = await ok(applyTransition(pool, e.id, "cancel", member(a), { reason: "changed my mind" }));
  assert.equal(cancelled.state, "CANCELLED");
  assert.equal(cancelled.courierId, b); // kept for history
  assert.ok(cancelled.closedAt);
  const rows = (await outbox(e.id)).filter((o) => o.event_type === "OrderCancelled");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payload.courier_id, null);
  assert.equal(rows[0].payload.requester_id, a);
  const { rows: history } = await pool.query(
    `SELECT reason FROM errand_history WHERE errand_id = $1 AND action = 'cancel'`,
    [e.id],
  );
  assert.deepEqual(history, [{ reason: "changed my mind" }]);
});

test("withdraw returns to OPEN and clears courier; no outbox row", async () => {
  const b = randomUUID();
  const e = await newOpenErrand(randomUUID());
  await ok(applyTransition(pool, e.id, "accept", member(b)));
  const withdrawn = await ok(applyTransition(pool, e.id, "withdraw", member(b)));
  assert.equal(withdrawn.state, "OPEN");
  assert.equal(withdrawn.courierId, null);
  assert.equal(withdrawn.closedAt, null);
  assert.deepEqual((await outbox(e.id)).map((o) => o.event_type), ["ReserveRequested"]);
});

test("admin party to dispute cannot resolve it", async () => {
  const a = randomUUID();
  const e = await deliveredErrand(a, randomUUID());
  await ok(applyTransition(pool, e.id, "reject", member(a)));
  const r = await applyTransition(pool, e.id, "resolveForCourier", admin(a));
  assert.deepEqual(r, { ok: false, error: "FORBIDDEN" });
  const byRequester = await applyTransition(pool, e.id, "resolveForCourier", member(a));
  assert.deepEqual(byRequester, { ok: false, error: "FORBIDDEN" });
  // A non-party member must not learn that a non-OPEN errand exists
  const byMember = await applyTransition(pool, e.id, "resolveForCourier", member(randomUUID()));
  assert.deepEqual(byMember, { ok: false, error: "NOT_FOUND" });
  assert.equal(await stateOf(e.id), "DISPUTED");
});

test("admin resolves for requester → FAILED + OrderFailed", async () => {
  const a = randomUUID();
  const e = await deliveredErrand(a, randomUUID());
  await ok(applyTransition(pool, e.id, "reject", member(a)));
  const failed = await ok(applyTransition(pool, e.id, "resolveForRequester", admin(randomUUID())));
  assert.equal(failed.state, "FAILED");
  assert.ok(failed.closedAt);
  const rows = (await outbox(e.id)).filter((o) => o.event_type !== "ReserveRequested");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_type, "OrderFailed");
  assert.equal(rows[0].payload.courier_id, null);
  assert.equal(rows[0].payload.requester_id, a);
});
