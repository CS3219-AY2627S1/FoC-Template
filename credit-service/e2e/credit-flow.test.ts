/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: End-to-end tests: messages go through Kafka to the running Credit Service, and the
 *        replies, DLQ messages and database state are checked (implementation-proposal §12).
 * Author review: Reviewed and approved by @phuc
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Harness, TOPICS, waitFor } from "./harness";

// Each topic has one partition, so Credit Service handles a topic's messages strictly in the
// order they were sent. To prove a message was ignored, a test sends a later "marker" message
// on the same topic and waits for its effect: by then the earlier one has been handled.

const h = new Harness();

before(async () => h.start());
after(async () => h.stop());

describe("user.account-status", () => {
  it("grants 100 credits on the first ACTIVE notification, and only once", async () => {
    const id = randomUUID();
    const first = await h.accountStatus(id, "ACTIVE", true);
    await h.waitForBalance(id, { available: 100, reserved: 0, status: "ACTIVE" });

    // Redelivery of the same notification, then a marker
    await h.accountStatus(id, "ACTIVE", true, first.operation_id);
    await h.grantedAccount();

    assert.deepEqual(await h.balance(id), { available: 100, reserved: 0, status: "ACTIVE" });
    assert.deepEqual(await h.transactionTypes(id), ["INITIAL_GRANT"]);
  });
});

describe("reserve (credit.commands → credit.results)", () => {
  it("holds the amount and replies CreditReserved", async () => {
    const requester = await h.grantedAccount();
    const req = await h.reserve(requester, 30);

    const reply = await h.reply(req.operation_id);
    assert.equal(reply.key, req.order_id);
    assert.equal(reply.body.type, "CreditReserved");
    assert.equal(reply.body.order_id, req.order_id);
    assert.equal(reply.body.schema_version, 1);
    assert.ok(reply.body.reservation_id, "reservation_id is set");
    assert.deepEqual(await h.balance(requester), { available: 70, reserved: 30, status: "ACTIVE" });
  });

  it("ignores a redelivered ReserveRequested", async () => {
    const requester = await h.grantedAccount();
    const req = await h.reserve(requester, 30);
    await h.reply(req.operation_id);

    await h.reserve(requester, 30, req.order_id, req.operation_id); // redelivery
    const marker = await h.reserve(requester, 5);
    await h.reply(marker.operation_id);

    assert.equal(h.repliesTo(req.operation_id).length, 1, "one reply only");
    assert.deepEqual(await h.balance(requester), { available: 65, reserved: 35, status: "ACTIVE" });
  });

  it("keeps one hold when a second operation arrives for the same order", async () => {
    const requester = await h.grantedAccount();
    const first = await h.reserve(requester, 30);
    await h.reply(first.operation_id);
    const second = await h.reserve(requester, 30, first.order_id);
    const marker = await h.reserve(requester, 1);
    await h.reply(marker.operation_id);

    assert.equal(h.repliesTo(second.operation_id).length, 0);
    assert.deepEqual(await h.balance(requester), { available: 69, reserved: 31, status: "ACTIVE" });
  });

  const rejections: Array<[string, (requester: string) => Promise<{ operation_id: string; order_id: string }>]> = [
    ["INSUFFICIENT_CREDIT", (r) => h.reserve(r, 101)],
    ["ACCOUNT_NOT_FOUND", () => h.reserve(randomUUID(), 10)],
    ["INVALID_AMOUNT", (r) => h.reserve(r, 0)],
  ];
  for (const [code, send] of rejections) {
    it(`replies CreditReservationRejected with ${code} and holds nothing`, async () => {
      const requester = await h.grantedAccount();
      const req = await send(requester);

      const reply = await h.reply(req.operation_id);
      assert.equal(reply.key, req.order_id);
      assert.equal(reply.body.type, "CreditReservationRejected");
      assert.equal(reply.body.reason_code, code);
      assert.equal(reply.body.order_id, req.order_id);
      assert.deepEqual(await h.balance(requester), { available: 100, reserved: 0, status: "ACTIVE" });
    });
  }

  it("rejects a suspended account with ACCOUNT_NOT_ACTIVE and accepts it again after restore", async () => {
    const requester = await h.grantedAccount();
    await h.accountStatus(requester, "SUSPENDED");
    await h.waitForBalance(requester, { status: "SUSPENDED" });

    const blocked = await h.reserve(requester, 10);
    assert.equal((await h.reply(blocked.operation_id)).body.reason_code, "ACCOUNT_NOT_ACTIVE");

    await h.accountStatus(requester, "ACTIVE");
    await h.waitForBalance(requester, { status: "ACTIVE" });
    const allowed = await h.reserve(requester, 10);
    assert.equal((await h.reply(allowed.operation_id)).body.type, "CreditReserved");
  });
});

describe("terminal events (credit.commands)", () => {
  it("OrderCompleted moves the held credits from the requester to the courier", async () => {
    const requester = await h.grantedAccount();
    const courier = await h.grantedAccount();
    const req = await h.reserve(requester, 40);
    await h.reply(req.operation_id);

    await h.terminal("OrderCompleted", req, courier);
    await h.waitForBalance(courier, { available: 140 });

    assert.deepEqual(await h.balance(requester), { available: 60, reserved: 0, status: "ACTIVE" });
    assert.deepEqual(await h.transactionTypes(requester), ["INITIAL_GRANT", "RESERVE", "CAPTURE_DEBIT"]);
    assert.deepEqual(await h.transactionTypes(courier), ["INITIAL_GRANT", "CAPTURE_CREDIT"]);
  });

  it("a redelivered OrderCompleted pays the courier only once", async () => {
    const requester = await h.grantedAccount();
    const courier = await h.grantedAccount();
    const req = await h.reserve(requester, 25);
    await h.reply(req.operation_id);

    const completed = await h.terminal("OrderCompleted", req, courier);
    await h.send(TOPICS.commands, req.order_id, completed); // redelivery
    const marker = await h.reserve(requester, 1);
    await h.reply(marker.operation_id);

    assert.deepEqual(await h.balance(courier), { available: 125, reserved: 0, status: "ACTIVE" });
  });

  for (const type of ["OrderCancelled", "OrderExpired", "OrderFailed"]) {
    it(`${type} gives the held credits back to the requester`, async () => {
      const requester = await h.grantedAccount();
      const req = await h.reserve(requester, 20);
      await h.reply(req.operation_id);
      await h.waitForBalance(requester, { available: 80, reserved: 20 });

      await h.terminal(type, req);
      await h.waitForBalance(requester, { available: 100, reserved: 0 });
      assert.deepEqual(await h.transactionTypes(requester), ["INITIAL_GRANT", "RESERVE", "RELEASE"]);
    });
  }

  it("a terminal event for a suspended requester is still processed", async () => {
    const requester = await h.grantedAccount();
    const req = await h.reserve(requester, 15);
    await h.reply(req.operation_id);
    await h.accountStatus(requester, "SUSPENDED");
    await h.waitForBalance(requester, { status: "SUSPENDED" });

    await h.terminal("OrderCancelled", req);
    await h.waitForBalance(requester, { available: 100, reserved: 0 });
  });
});

describe("account closure", () => {
  it("forfeits the balance once the last reservation is finalised", async () => {
    const requester = await h.grantedAccount();
    const req = await h.reserve(requester, 40);
    await h.reply(req.operation_id);

    await h.accountStatus(requester, "CLOSED");
    await h.waitForBalance(requester, { status: "CLOSED", available: 60, reserved: 40 });

    await h.terminal("OrderExpired", req);
    await h.waitForBalance(requester, { available: 0, reserved: 0 });
    assert.deepEqual(await h.transactionTypes(requester), ["INITIAL_GRANT", "RESERVE", "RELEASE", "FORFEIT"]);
  });

  it("forfeits at once when nothing is reserved", async () => {
    const id = await h.grantedAccount();
    await h.accountStatus(id, "CLOSED");
    await h.waitForBalance(id, { status: "CLOSED", available: 0, reserved: 0 });
  });
});

describe("dead-letter topics", () => {
  it("sends a value that is not JSON to credit.commands.dlq", async () => {
    const key = randomUUID();
    await h.send(TOPICS.commands, key, "this is not json");
    const dlq = await h.waitForMessage(TOPICS.commandsDlq, (m) => m.key === key);
    assert.equal(dlq.body.reason, "value is not valid JSON");
    assert.equal(dlq.body.source_topic, TOPICS.commands);
    assert.equal(dlq.body.original_value, "this is not json");
  });

  it("sends a message with a missing field to credit.commands.dlq", async () => {
    const orderId = randomUUID();
    await h.send(TOPICS.commands, orderId, { type: "ReserveRequested", order_id: orderId, schema_version: 1 });
    const dlq = await h.waitForMessage(TOPICS.commandsDlq, (m) => m.key === orderId);
    assert.match(dlq.body.reason, /missing/);
  });

  it("sends a terminal event whose amount does not match the hold to the DLQ and moves nothing", async () => {
    const requester = await h.grantedAccount();
    const req = await h.reserve(requester, 30);
    await h.reply(req.operation_id);

    await h.terminal("OrderCancelled", { ...req, amount: 31 });
    const dlq = await h.waitForMessage(TOPICS.commandsDlq, (m) => m.key === req.order_id);
    assert.equal(dlq.body.reason, "amount does not match the reservation");
    assert.deepEqual(await h.balance(requester), { available: 70, reserved: 30, status: "ACTIVE" });
  });

  it("sends the losing outcome to the DLQ when an order is both completed and cancelled", async () => {
    const requester = await h.grantedAccount();
    const courier = await h.grantedAccount();
    const req = await h.reserve(requester, 10);
    await h.reply(req.operation_id);

    await h.terminal("OrderCompleted", req, courier);
    await h.terminal("OrderCancelled", req);
    const dlq = await h.waitForMessage(TOPICS.commandsDlq, (m) => m.key === req.order_id);
    assert.match(dlq.body.reason, /already CAPTURED/);
    assert.deepEqual(await h.balance(courier), { available: 110, reserved: 0, status: "ACTIVE" });
  });

  it("sends a status change for an unknown account to user.account-status.dlq", async () => {
    const id = randomUUID();
    await h.accountStatus(id, "SUSPENDED");
    const dlq = await h.waitForMessage(TOPICS.accountStatusDlq, (m) => m.key === id);
    assert.equal(dlq.body.reason, "no credit account for account_id");
    assert.equal(dlq.body.source_topic, TOPICS.accountStatus);
  });

  it("keeps processing later messages after a bad one", async () => {
    await h.send(TOPICS.commands, randomUUID(), "{broken");
    const requester = await h.grantedAccount();
    const req = await h.reserve(requester, 5);
    assert.equal((await h.reply(req.operation_id)).body.type, "CreditReserved");
  });
});

describe("outbox", () => {
  it("publishes every CreditReserved event (nothing left unpublished)", async () => {
    const { rows } = await waitFor("an empty outbox backlog", async () => {
      const result = await h.pool.query("SELECT count(*)::int AS n FROM outbox WHERE published_at IS NULL");
      return result.rows[0].n === 0 ? result : undefined;
    });
    assert.equal(rows[0].n, 0);
  });
});
