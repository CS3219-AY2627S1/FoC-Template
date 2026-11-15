/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Unit tests for incoming message validation.
 * Author review: Reviewed and approved by @phuc
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAccountStatusNotification, parseCreditCommand } from "../src/messages";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("parseCreditCommand", () => {
  const reserve = { type: "ReserveRequested", operation_id: A, order_id: B, requester_id: C, amount: 5, schema_version: 1 };

  it("accepts a valid ReserveRequested, keeping a non-positive amount for INVALID_AMOUNT", () => {
    assert.deepEqual(parseCreditCommand(reserve), {
      ok: true,
      message: { type: "ReserveRequested", operationId: A, orderId: B, requesterId: C, amount: 5 },
    });
    assert.equal(parseCreditCommand({ ...reserve, amount: 0 }).ok, true);
  });

  it("lower-cases UUIDs", () => {
    const parsed = parseCreditCommand({ ...reserve, order_id: B.toUpperCase() });
    assert.ok(parsed.ok && parsed.message.orderId === B);
  });

  it("rejects malformed messages", () => {
    for (const bad of [
      null,
      [],
      "text",
      { ...reserve, schema_version: 2 },
      { ...reserve, type: "Unknown" },
      { ...reserve, amount: 1.5 },
      { ...reserve, amount: "5" },
      { ...reserve, order_id: "not-a-uuid" },
      { type: "ReserveRequested", schema_version: 1 },
    ]) {
      assert.equal(parseCreditCommand(bad).ok, false, JSON.stringify(bad));
    }
  });

  it("requires a courier different from the requester on OrderCompleted only", () => {
    const completed = { type: "OrderCompleted", operation_id: A, order_id: B, requester_id: C, amount: 5, schema_version: 1 };
    assert.equal(parseCreditCommand(completed).ok, false);
    assert.equal(parseCreditCommand({ ...completed, courier_id: C }).ok, false);
    assert.equal(parseCreditCommand({ ...completed, courier_id: A }).ok, true);

    const cancelled = parseCreditCommand({ ...completed, type: "OrderCancelled", courier_id: A });
    assert.ok(cancelled.ok && "courierId" in cancelled.message && cancelled.message.courierId === null);
  });

  it("accepts ReservationTimedOut without a courier_id", () => {
    const timedOut = { type: "ReservationTimedOut", operation_id: A, order_id: B, requester_id: C, amount: 5, schema_version: 1 };
    assert.deepEqual(parseCreditCommand(timedOut), {
      ok: true,
      message: { type: "ReservationTimedOut", operationId: A, orderId: B, requesterId: C, amount: 5 },
    });
    assert.equal(parseCreditCommand({ ...timedOut, order_id: "not-a-uuid" }).ok, false);
  });
});

describe("parseAccountStatusNotification", () => {
  const msg = { operation_id: A, account_id: B, new_status: "ACTIVE", first_active: true, occurred_at: "2026-10-16T00:00:00Z", schema_version: 1 };

  it("accepts a valid notification", () => {
    assert.deepEqual(parseAccountStatusNotification(msg), {
      ok: true,
      message: { operationId: A, accountId: B, newStatus: "ACTIVE", firstActive: true },
    });
  });

  it("rejects unknown statuses and first_active on a non-ACTIVE status", () => {
    assert.equal(parseAccountStatusNotification({ ...msg, new_status: "PENDING_VERIFICATION" }).ok, false);
    assert.equal(parseAccountStatusNotification({ ...msg, new_status: "SUSPENDED" }).ok, false);
    assert.equal(parseAccountStatusNotification({ ...msg, first_active: "yes" }).ok, false);
  });
});
