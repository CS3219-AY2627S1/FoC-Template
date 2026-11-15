/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Tests for handling CreditReserved / CreditReservationRejected replies, written
 *        before the implementation per the approved plan.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Widened the closing() helper type so the tests type-check.
 * Author review: Reviewed and approved by @mattis.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { createTestDatabase, TestDatabase } from "./helpers";
import { handleCreditResult } from "../src/credit/creditResults";
import { parseCreditResult, type CreditResult } from "../src/domain/messages";
import { applyTransition, createErrand } from "../src/errands/repository";
import type { Errand, SupplierSnapshot } from "../src/errands/errand";

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

const reserved = (e: Errand, operationId = e.reservationOperationId): CreditResult => ({
  type: "CreditReserved", eventId: randomUUID(), operationId, orderId: e.id, reservationId: randomUUID(),
});
const rejected = (e: Errand, operationId = e.reservationOperationId): CreditResult => ({
  type: "CreditReservationRejected", eventId: randomUUID(), operationId, orderId: e.id, reasonCode: "INSUFFICIENT_CREDIT",
});

async function row(id: string) {
  const { rows } = await pool.query(`SELECT * FROM errands WHERE id = $1`, [id]);
  return rows[0];
}
async function outbox(id: string) {
  const { rows } = await pool.query(
    `SELECT event_type, topic, message_key, payload FROM outbox WHERE message_key = $1 ORDER BY created_at, event_type`,
    [id],
  );
  return rows as { event_type: string; topic: string; payload: Record<string, unknown> }[];
}
async function history(id: string) {
  const { rows } = await pool.query(`SELECT * FROM errand_history WHERE errand_id = $1 ORDER BY id`, [id]);
  return rows;
}
const closing = <T extends { event_type: string }>(rows: T[]) => rows.filter((r) => r.event_type !== "ReserveRequested");

test("reserved opens the errand", async () => {
  const e = await newErrand();
  assert.equal(await handleCreditResult(pool, reserved(e)), "opened");
  assert.equal((await row(e.id)).state, "OPEN");
  const h = (await history(e.id)).at(-1);
  assert.equal(h.action, "reserved");
  assert.equal(h.actor_type, "CREDIT");
  assert.equal(h.actor_id, null);
  assert.equal(h.from_state, "PENDING_RESERVATION");
  assert.equal(h.to_state, "OPEN");
  assert.equal(closing(await outbox(e.id)).length, 0);
});

test("rejected closes the errand with reason INSUFFICIENT_CREDIT and writes no outbox row", async () => {
  const e = await newErrand();
  assert.equal(await handleCreditResult(pool, rejected(e)), "rejected");
  const r = await row(e.id);
  assert.equal(r.state, "RESERVATION_REJECTED");
  assert.equal(r.rejection_reason, "INSUFFICIENT_CREDIT");
  assert.notEqual(r.closed_at, null);
  assert.equal((await history(e.id)).at(-1).actor_type, "CREDIT");
  assert.equal(closing(await outbox(e.id)).length, 0);
});

test("duplicate CreditReserved is a no-op", async () => {
  const e = await newErrand();
  await handleCreditResult(pool, reserved(e));
  const before = { o: (await outbox(e.id)).length, h: (await history(e.id)).length };
  assert.equal(await handleCreditResult(pool, reserved(e)), "duplicate");
  assert.equal((await outbox(e.id)).length, before.o);
  assert.equal((await history(e.id)).length, before.h);
  assert.equal((await row(e.id)).state, "OPEN");
});

test("late CreditReserved after rejection writes OrderCancelled with amount and requester", async () => {
  const e = await newErrand();
  await handleCreditResult(pool, rejected(e));
  assert.equal(await handleCreditResult(pool, reserved(e)), "late_reserve_cancelled");
  assert.equal((await row(e.id)).state, "RESERVATION_REJECTED");
  const msgs = closing(await outbox(e.id));
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].event_type, "OrderCancelled");
  assert.equal(msgs[0].topic, "credit.commands");
  assert.equal(msgs[0].payload.requester_id, REQUESTER);
  assert.equal(msgs[0].payload.amount, 10);
  assert.equal(msgs[0].payload.courier_id, null);
  assert.equal(msgs[0].payload.order_id, e.id);
  assert.equal((await history(e.id)).at(-1).action, "late_reserve_released");
});

test("second late CreditReserved writes no second OrderCancelled", async () => {
  const e = await newErrand();
  await handleCreditResult(pool, rejected(e));
  await handleCreditResult(pool, reserved(e));
  assert.equal(await handleCreditResult(pool, reserved(e)), "duplicate");
  assert.equal(closing(await outbox(e.id)).length, 1);
});

test("late rejection after OPEN is ignored", async () => {
  const e = await newErrand();
  await handleCreditResult(pool, reserved(e));
  const h = (await history(e.id)).length;
  assert.equal(await handleCreditResult(pool, rejected(e)), "duplicate");
  const r = await row(e.id);
  assert.equal(r.state, "OPEN");
  assert.equal(r.rejection_reason, null);
  assert.equal((await history(e.id)).length, h);
});

async function timedOut(): Promise<Errand> {
  const e = await newErrand();
  const res = await applyTransition(pool, e.id, "reservationTimeout", { kind: "system" }, {
    now: new Date(e.reservationDeadline.getTime() + 1000),
  });
  assert.equal(res.ok, true);
  return e;
}

test("late CreditReserved after timeout writes no outbox row", async () => {
  const e = await timedOut();
  assert.equal(await handleCreditResult(pool, reserved(e)), "ignored_after_timeout");
  assert.equal((await row(e.id)).state, "RESERVATION_TIMED_OUT");
  const msgs = closing(await outbox(e.id));
  assert.deepEqual(msgs.map((m) => m.event_type), ["ReservationTimedOut"]);
  assert.equal((await history(e.id)).at(-1).action, "late_reply_after_timeout");
});

test("late rejection after timeout is ignored", async () => {
  const e = await timedOut();
  const h = (await history(e.id)).length;
  assert.equal(await handleCreditResult(pool, rejected(e)), "ignored_after_timeout");
  const r = await row(e.id);
  assert.equal(r.state, "RESERVATION_TIMED_OUT");
  assert.equal(r.rejection_reason, null);
  assert.equal((await history(e.id)).length, h);
  assert.deepEqual(closing(await outbox(e.id)).map((m) => m.event_type), ["ReservationTimedOut"]);
});

test("ignores reply for unknown order", async () => {
  const msg: CreditResult = {
    type: "CreditReserved", eventId: randomUUID(), operationId: randomUUID(), orderId: randomUUID(), reservationId: randomUUID(),
  };
  const warn = console.error;
  console.error = () => {};
  try {
    assert.equal(await handleCreditResult(pool, msg), "ignored_unknown_order");
  } finally {
    console.error = warn;
  }
});

test("ignores reply whose operation_id does not match", async () => {
  const e = await newErrand();
  const warn = console.error;
  console.error = () => {};
  try {
    assert.equal(await handleCreditResult(pool, reserved(e, randomUUID())), "ignored_operation_mismatch");
  } finally {
    console.error = warn;
  }
  assert.equal((await row(e.id)).state, "PENDING_RESERVATION");
});

test("parseCreditResult rejects schema_version 2 and missing order_id", () => {
  const good = {
    event_id: randomUUID(), type: "CreditReserved", operation_id: randomUUID(), order_id: randomUUID().toUpperCase(),
    reservation_id: randomUUID(), occurred_at: "2026-10-20T09:00:01Z", schema_version: 1,
  };
  const ok = parseCreditResult(good);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.message.orderId, good.order_id.toLowerCase());
  assert.deepEqual(parseCreditResult({ ...good, schema_version: 2 }), { ok: false, reason: "unsupported schema_version" });
  const { order_id: _omit, ...noOrder } = good;
  assert.equal(parseCreditResult(noOrder).ok, false);
  assert.equal(parseCreditResult({ ...good, type: "Nope" }).ok, false);
  assert.equal(parseCreditResult(null).ok, false);
  const rej = parseCreditResult({ ...good, type: "CreditReservationRejected", reason_code: "ACCOUNT_NOT_FOUND" });
  assert.equal(rej.ok && rej.message.type === "CreditReservationRejected" && rej.message.reasonCode, "ACCOUNT_NOT_FOUND");
});
