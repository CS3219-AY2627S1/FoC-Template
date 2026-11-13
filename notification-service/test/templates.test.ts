// AI Assistance Disclosure:
// Tool: Claude (Opus 5.5), date: 2026-11-10
// Scope: Unit tests for event -> email mapping
// Author review: Reviewed and tested locally

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNotifications } from "../src/notifications/templates.ts";
import type { OrderEvent } from "../src/events/orderEvent.ts";

const ev = (event_type: string, data: Partial<OrderEvent["data"]> = {}): OrderEvent => ({
  event_id: "e1",
  event_type,
  timestamp: new Date().toISOString(),
  data: { order_id: "o1", requester_id: "req", courier_id: "cou", credit_amount: 3, title: "Prints", ...data },
});

const recipients = (e: OrderEvent) => buildNotifications(e).map((n) => n.userId);

describe("buildNotifications", () => {
  it("notifies the right people for each stage", () => {
    assert.deepEqual(recipients(ev("ORDER_CREATED", { courier_id: null })), ["req"]);
    assert.deepEqual(recipients(ev("ORDER_ACCEPTED")), ["req", "cou"]);
    assert.deepEqual(recipients(ev("ORDER_PICKED_UP")), ["req"]);
    assert.deepEqual(recipients(ev("ORDER_COMPLETED")), ["req", "cou"]);
    assert.deepEqual(recipients(ev("ORDER_CANCELLED")), ["req", "cou"]);
    assert.deepEqual(recipients(ev("ORDER_CANCELLED", { courier_id: null })), ["req"]);
    assert.deepEqual(recipients(ev("ORDER_EXPIRED", { courier_id: null })), ["req"]);
  });

  it("includes the title, credits and order id", () => {
    const [n] = buildNotifications(ev("ORDER_CREATED"), "https://foc.example");
    assert.match(n.body, /"Prints"/);
    assert.match(n.body, /3 credit/);
    assert.match(n.body, /Order ID: o1/);
    assert.match(n.body, /https:\/\/foc\.example/);
  });

  it("explains a compensation cancel (no title) as a failed creation", () => {
    const [n] = buildNotifications(ev("ORDER_CANCELLED", { title: null, courier_id: null }));
    assert.equal(n.subject, "Your errand could not be created");
  });

  it("ignores unknown event types", () => {
    assert.deepEqual(buildNotifications(ev("SOMETHING_ELSE")), []);
  });
});

import { parseUserRegisteredEvent } from "../src/events/userEvent.ts";
import { filterPolicyFor } from "../src/notifications/filterPolicy.ts";

describe("auto-subscribe", () => {
  it("builds a per-user filter policy", () => {
    assert.deepEqual(JSON.parse(filterPolicyFor("u1")), { userId: ["u1"] });
  });

  it("validates USER_REGISTERED events", () => {
    const ok = {
      event_id: "e",
      event_type: "USER_REGISTERED",
      timestamp: "t",
      data: { user_id: "u1", email: "a@u.nus.edu" },
    };
    assert.equal(parseUserRegisteredEvent(ok).data.email, "a@u.nus.edu");
    assert.throws(() => parseUserRegisteredEvent({ ...ok, data: { user_id: "u1", email: "nope" } }));
    assert.throws(() => parseUserRegisteredEvent({ ...ok, event_type: "ORDER_CREATED" }));
  });
});
