// Additional AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status publishing and verification. Author review: Reviewed and approved by @phuc.
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Database tests for account status, reserve, capture, release and forfeit, covering
 *        the verification plan in implementation-proposal.md §12.
 * Author review: Reviewed and approved by @phuc
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, describe, it } from "node:test";
import { Pool } from "pg";
import { getBalance, handleAccountStatus } from "../src/accounts";
import { AccountStatus } from "../src/messages";
import { handleReserveRequested, handleClosingMessage } from "../src/reservations";
import {
  TestDatabase,
  activeAccount,
  assertLedgerReconciles,
  balanceOf,
  createTestDatabase,
  reserveMsg,
  terminalMsg,
  timedOutMsg,
  transactionTypes,
} from "./helpers";

let db: TestDatabase;
let pool: Pool;

before(async () => {
  db = await createTestDatabase();
  pool = db.pool;
});
after(async () => db.drop());
afterEach(async () => assertLedgerReconciles(pool));

function setStatus(accountId: string, newStatus: AccountStatus) {
  return handleAccountStatus(pool, { operationId: randomUUID(), accountId, newStatus, firstActive: false });
}

async function reserved(requesterId: string, amount: number) {
  const msg = reserveMsg(requesterId, amount);
  const outcome = await handleReserveRequested(pool, msg);
  assert.equal(outcome.kind, "reserved");
  return msg;
}

describe("account status", () => {
  it("rolls back both status and dedup marker when updating status throws", async () => {
    const id = await activeAccount(pool);
    const msg = { operationId: randomUUID(), accountId: id, newStatus: "SUSPENDED" as const, firstActive: false };
    await pool.query(`CREATE FUNCTION fail_status_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'status update failed'; END $$;
      CREATE TRIGGER fail_status_update BEFORE UPDATE ON credit_accounts FOR EACH ROW EXECUTE FUNCTION fail_status_update()`);
    try {
      await assert.rejects(handleAccountStatus(pool, msg), /status update failed/);
      assert.equal((await pool.query("SELECT status FROM credit_accounts WHERE user_id = $1", [id])).rows[0].status, "ACTIVE");
      assert.equal((await pool.query("SELECT * FROM processed_account_status WHERE operation_id = $1", [msg.operationId])).rowCount, 0);
    } finally { await pool.query("DROP TRIGGER fail_status_update ON credit_accounts; DROP FUNCTION fail_status_update()"); }
    assert.equal((await handleAccountStatus(pool, msg)).kind, "applied");
  });
  it("does not reapply an old restore after a newer suspension", async () => {
    const id = await activeAccount(pool);
    const restore = { operationId: randomUUID(), accountId: id, newStatus: "ACTIVE" as const, firstActive: false };
    const suspend = { operationId: randomUUID(), accountId: id, newStatus: "SUSPENDED" as const, firstActive: false };
    await handleAccountStatus(pool, restore);
    await handleAccountStatus(pool, suspend);
    assert.equal((await handleAccountStatus(pool, restore)).kind, "duplicate");
    const outcome = await handleReserveRequested(pool, reserveMsg(id, 1));
    assert.equal(outcome.kind, "rejected");
    if (outcome.kind === "rejected") assert.equal(outcome.reason, "ACCOUNT_NOT_ACTIVE");
    assert.equal((await handleAccountStatus(pool, suspend)).kind, "duplicate");
  });

  it("rolls back the processed marker when account-status effects cannot be applied", async () => {
    const id = randomUUID();
    const restore = { operationId: randomUUID(), accountId: id, newStatus: "ACTIVE" as const, firstActive: false };
    assert.equal((await handleAccountStatus(pool, restore)).kind, "invalid");
    assert.equal((await pool.query("SELECT * FROM processed_account_status WHERE operation_id = $1", [restore.operationId])).rowCount, 0);
    await handleAccountStatus(pool, { operationId: randomUUID(), accountId: id, newStatus: "ACTIVE", firstActive: true });
    assert.equal((await handleAccountStatus(pool, restore)).kind, "applied");
  });
  it("grants 100 credits once when the same first-ACTIVE notification arrives 20 times", async () => {
    const accountId = randomUUID();
    const msg = { operationId: randomUUID(), accountId, newStatus: "ACTIVE" as const, firstActive: true };
    const outcomes = await Promise.all(Array.from({ length: 20 }, () => handleAccountStatus(pool, msg)));

    assert.equal(outcomes.filter((o) => o.kind === "applied").length, 1);
    assert.equal(outcomes.filter((o) => o.kind === "duplicate").length, 19);
    assert.deepEqual(await getBalance(pool, accountId), { total: 100, reserved: 0, available: 100 });
    assert.deepEqual(await transactionTypes(pool, accountId), ["INITIAL_GRANT"]);
  });

  it("suspends and restores without changing the balance", async () => {
    const id = await activeAccount(pool);
    assert.equal((await setStatus(id, "SUSPENDED")).kind, "applied");
    assert.equal((await setStatus(id, "SUSPENDED")).kind, "applied"); // redelivery
    assert.equal((await setStatus(id, "ACTIVE")).kind, "applied");
    assert.deepEqual(await getBalance(pool, id), { total: 100, reserved: 0, available: 100 });
  });

  it("rejects a status change for an unknown account", async () => {
    const outcome = await setStatus(randomUUID(), "SUSPENDED");
    assert.equal(outcome.kind, "invalid");
  });

  it("forfeits at once when a closed account has nothing reserved, and only once", async () => {
    const id = await activeAccount(pool);
    assert.equal((await setStatus(id, "CLOSED")).kind, "applied");
    assert.equal((await setStatus(id, "CLOSED")).kind, "applied"); // redelivery
    assert.deepEqual(await getBalance(pool, id), { total: 0, reserved: 0, available: 0 });
    assert.deepEqual(await transactionTypes(pool, id), ["INITIAL_GRANT", "FORFEIT"]);
  });

  it("refuses to reopen a CLOSED account", async () => {
    const id = await activeAccount(pool);
    await setStatus(id, "CLOSED");
    assert.equal((await setStatus(id, "ACTIVE")).kind, "invalid");
  });
});

describe("reserve", () => {
  it("moves the amount from available to reserved and queues CreditReserved", async () => {
    const id = await activeAccount(pool);
    const msg = reserveMsg(id, 30);
    const outcome = await handleReserveRequested(pool, msg);

    assert.equal(outcome.kind, "reserved");
    assert.deepEqual(await getBalance(pool, id), { total: 100, reserved: 30, available: 70 });
    const { rows } = await pool.query("SELECT event_type, message_key, payload, causation_id FROM outbox WHERE causation_id = $1", [
      msg.operationId,
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].event_type, "CreditReserved");
    assert.equal(rows[0].message_key, msg.orderId);
    assert.equal(rows[0].payload.reservation_id, outcome.kind === "reserved" ? outcome.reservationId : undefined);
  });

  it("treats a redelivered request as a duplicate", async () => {
    const id = await activeAccount(pool);
    const msg = reserveMsg(id, 30);
    await handleReserveRequested(pool, msg);
    assert.equal((await handleReserveRequested(pool, msg)).kind, "duplicate");
    assert.deepEqual(await getBalance(pool, id), { total: 100, reserved: 30, available: 70 });
  });

  it("keeps one hold when two operations arrive for the same order", async () => {
    const id = await activeAccount(pool);
    const first = reserveMsg(id, 30);
    const second = reserveMsg(id, 30, first.orderId);
    const outcomes = await Promise.all([handleReserveRequested(pool, first), handleReserveRequested(pool, second)]);

    assert.deepEqual(outcomes.map((o) => o.kind).sort(), ["duplicate", "reserved"]);
    assert.deepEqual(await getBalance(pool, id), { total: 100, reserved: 30, available: 70 });
  });

  it("never overdraws under concurrent reserves from one user", async () => {
    const id = await activeAccount(pool);
    const outcomes = await Promise.all(Array.from({ length: 10 }, () => handleReserveRequested(pool, reserveMsg(id, 30))));

    assert.equal(outcomes.filter((o) => o.kind === "reserved").length, 3);
    assert.equal(outcomes.filter((o) => o.kind === "rejected").length, 7);
    assert.deepEqual(await getBalance(pool, id), { total: 100, reserved: 90, available: 10 });
  });

  it("rejects with the right reason code and writes nothing", async () => {
    const id = await activeAccount(pool);
    const suspended = await activeAccount(pool);
    await setStatus(suspended, "SUSPENDED");

    const cases: Array<[ReturnType<typeof reserveMsg>, string]> = [
      [reserveMsg(id, 101), "INSUFFICIENT_CREDIT"],
      [reserveMsg(randomUUID(), 10), "ACCOUNT_NOT_FOUND"],
      [reserveMsg(suspended, 10), "ACCOUNT_NOT_ACTIVE"],
      [reserveMsg(id, 0), "INVALID_AMOUNT"],
      [reserveMsg(id, -5), "INVALID_AMOUNT"],
    ];
    for (const [msg, reason] of cases) {
      const outcome = await handleReserveRequested(pool, msg);
      assert.equal(outcome.kind, "rejected");
      if (outcome.kind !== "rejected") continue;
      assert.equal(outcome.reason, reason);
      assert.equal(outcome.reply.key, msg.orderId);
      assert.equal(outcome.reply.payload.type, "CreditReservationRejected");
      assert.equal(outcome.reply.payload.operation_id, msg.operationId);
      assert.equal(outcome.reply.payload.reason_code, reason);
      const written = await pool.query("SELECT 1 FROM outbox WHERE causation_id = $1", [msg.operationId]);
      assert.equal(written.rows.length, 0);
    }
    assert.deepEqual(await getBalance(pool, id), { total: 100, reserved: 0, available: 100 });
  });
});

describe("terminal events", () => {
  it("captures once when the same OrderCompleted arrives 20 times concurrently", async () => {
    const requester = await activeAccount(pool);
    const courier = await activeAccount(pool);
    const reserve = await reserved(requester, 40);
    const completed = terminalMsg("OrderCompleted", reserve, courier);

    const outcomes = await Promise.all(Array.from({ length: 20 }, () => handleClosingMessage(pool, completed)));
    assert.equal(outcomes.filter((o) => o.kind === "applied").length, 1);
    assert.equal(outcomes.filter((o) => o.kind === "duplicate").length, 19);

    assert.deepEqual(await balanceOf(pool, requester), { available: 60, reserved: 0 });
    assert.deepEqual(await balanceOf(pool, courier), { available: 140, reserved: 0 });
    assert.deepEqual(await transactionTypes(pool, requester), ["INITIAL_GRANT", "RESERVE", "CAPTURE_DEBIT"]);
    assert.deepEqual(await transactionTypes(pool, courier), ["INITIAL_GRANT", "CAPTURE_CREDIT"]);
    const { rows } = await pool.query("SELECT status, closed_by, courier_id FROM credit_reservations WHERE order_id = $1", [
      reserve.orderId,
    ]);
    assert.deepEqual(rows[0], { status: "CAPTURED", closed_by: "COMPLETED", courier_id: courier });
  });

  for (const type of ["OrderCancelled", "OrderExpired", "OrderFailed"] as const) {
    it(`releases on ${type}`, async () => {
      const requester = await activeAccount(pool);
      const reserve = await reserved(requester, 25);
      assert.equal((await handleClosingMessage(pool, terminalMsg(type, reserve))).kind, "applied");
      assert.deepEqual(await balanceOf(pool, requester), { available: 100, reserved: 0 });
      assert.deepEqual(await transactionTypes(pool, requester), ["INITIAL_GRANT", "RESERVE", "RELEASE"]);
    });
  }

  it("lets exactly one of OrderCompleted and OrderCancelled win for one order", async () => {
    const requester = await activeAccount(pool);
    const courier = await activeAccount(pool);
    const reserve = await reserved(requester, 20);
    const outcomes = await Promise.all([
      handleClosingMessage(pool, terminalMsg("OrderCompleted", reserve, courier)),
      handleClosingMessage(pool, terminalMsg("OrderCancelled", reserve)),
    ]);
    assert.deepEqual(outcomes.map((o) => o.kind).sort(), ["applied", "invalid"]);
  });

  it("credits a courier the exact sum of 50 concurrent captures", async () => {
    const courier = await activeAccount(pool);
    const reserves = [];
    for (let i = 0; i < 50; i++) {
      reserves.push(await reserved(await activeAccount(pool), 2));
    }
    const outcomes = await Promise.all(
      reserves.map((r) => handleClosingMessage(pool, terminalMsg("OrderCompleted", r, courier))),
    );
    assert.ok(outcomes.every((o) => o.kind === "applied"));
    assert.deepEqual(await balanceOf(pool, courier), { available: 200, reserved: 0 });
  });

  it("processes terminal events for a suspended requester (CS-F4.1.1)", async () => {
    const requester = await activeAccount(pool);
    const reserve = await reserved(requester, 10);
    await setStatus(requester, "SUSPENDED");
    assert.equal((await handleClosingMessage(pool, terminalMsg("OrderCancelled", reserve))).kind, "applied");
    assert.deepEqual(await balanceOf(pool, requester), { available: 100, reserved: 0 });
  });

  it("sends mismatching or unknown events to the DLQ without changing balances", async () => {
    const requester = await activeAccount(pool);
    const courier = await activeAccount(pool);
    const reserve = await reserved(requester, 10);

    const wrongAmount = { ...terminalMsg("OrderCancelled", reserve), amount: 11 };
    const wrongRequester = { ...terminalMsg("OrderCancelled", reserve), requesterId: courier };
    const unknownOrder = { ...terminalMsg("OrderCancelled", reserve), orderId: randomUUID() };
    const courierWithoutAccount = terminalMsg("OrderCompleted", reserve, randomUUID());
    for (const msg of [wrongAmount, wrongRequester, unknownOrder, courierWithoutAccount]) {
      assert.equal((await handleClosingMessage(pool, msg)).kind, "invalid");
    }
    assert.deepEqual(await balanceOf(pool, requester), { available: 90, reserved: 10 });
    assert.deepEqual(await balanceOf(pool, courier), { available: 100, reserved: 0 });
  });
});

describe("ReservationTimedOut", () => {
  it("releases a held reservation and closes it as TIMED_OUT", async () => {
    const requester = await activeAccount(pool);
    const reserve = await reserved(requester, 15);
    const timedOut = timedOutMsg(reserve);

    assert.equal((await handleClosingMessage(pool, timedOut)).kind, "applied");
    assert.equal((await handleClosingMessage(pool, timedOut)).kind, "duplicate"); // redelivery
    assert.deepEqual(await balanceOf(pool, requester), { available: 100, reserved: 0 });
    assert.deepEqual(await transactionTypes(pool, requester), ["INITIAL_GRANT", "RESERVE", "RELEASE"]);
    const { rows } = await pool.query("SELECT status, closed_by FROM credit_reservations WHERE order_id = $1", [
      reserve.orderId,
    ]);
    assert.deepEqual(rows[0], { status: "RELEASED", closed_by: "TIMED_OUT" });
  });

  it("does nothing when the reserve was rejected, every time it arrives", async () => {
    const requester = await activeAccount(pool);
    const reserve = reserveMsg(requester, 500);
    assert.equal((await handleReserveRequested(pool, reserve)).kind, "rejected");

    const timedOut = timedOutMsg(reserve);
    assert.equal((await handleClosingMessage(pool, timedOut)).kind, "no_hold");
    assert.equal((await handleClosingMessage(pool, timedOut)).kind, "no_hold");
    assert.deepEqual(await transactionTypes(pool, requester), ["INITIAL_GRANT"]);
  });

  it("sends a mismatch, or a second closing message, to the DLQ", async () => {
    const requester = await activeAccount(pool);
    const reserve = await reserved(requester, 10);
    assert.equal((await handleClosingMessage(pool, { ...timedOutMsg(reserve), amount: 11 })).kind, "invalid");

    assert.equal((await handleClosingMessage(pool, timedOutMsg(reserve))).kind, "applied");
    assert.equal((await handleClosingMessage(pool, terminalMsg("OrderCancelled", reserve))).kind, "invalid");
    assert.deepEqual(await balanceOf(pool, requester), { available: 100, reserved: 0 });
  });
});

describe("forfeit on CLOSED", () => {
  it("waits until the last reservation is finalised, then forfeits once", async () => {
    const requester = await activeAccount(pool);
    const first = await reserved(requester, 30);
    const second = await reserved(requester, 20);
    await setStatus(requester, "CLOSED");
    assert.deepEqual(await balanceOf(pool, requester), { available: 50, reserved: 50 });

    // Closed accounts cannot reserve
    const rejected = await handleReserveRequested(pool, reserveMsg(requester, 1));
    assert.equal(rejected.kind === "rejected" && rejected.reason, "ACCOUNT_NOT_ACTIVE");

    await handleClosingMessage(pool, terminalMsg("OrderCancelled", first));
    assert.deepEqual(await balanceOf(pool, requester), { available: 80, reserved: 20 });

    const courier = await activeAccount(pool);
    await handleClosingMessage(pool, terminalMsg("OrderCompleted", second, courier));
    assert.deepEqual(await balanceOf(pool, requester), { available: 0, reserved: 0 });
    assert.deepEqual(await transactionTypes(pool, requester), [
      "INITIAL_GRANT", "RESERVE", "RESERVE", "RELEASE", "CAPTURE_DEBIT", "FORFEIT",
    ]);
    const { rows } = await pool.query("SELECT forfeited_at FROM credit_accounts WHERE user_id = $1", [requester]);
    assert.notEqual(rows[0].forfeited_at, null);
  });
});

describe("credit_app role", () => {
  it("cannot UPDATE or DELETE credit_transactions", async () => {
    const id = await activeAccount(pool);
    const client = await pool.connect();
    try {
      await client.query("SET ROLE credit_app");
      await assert.rejects(client.query("UPDATE credit_transactions SET available_delta = 0 WHERE user_id = $1", [id]), {
        code: "42501",
      });
      await assert.rejects(client.query("DELETE FROM credit_transactions WHERE user_id = $1", [id]), { code: "42501" });
      // ...but can do what the handlers need
      await client.query("SELECT 1 FROM credit_accounts LIMIT 1");
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  });
});
