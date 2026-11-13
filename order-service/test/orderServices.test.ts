// AI Assistance Disclosure:
// Tool: GitHub Copilot (Copilot SDK in VS Code), date: 2026-11-10
// Scope: Added unit tests for order lifecycle, event recording, and credit client functions.
// Author review: Tests reviewed and verified by author

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import type { Transaction } from "sequelize";
import type { AuthenticatedUser } from "../app/middleware/auth.ts";

process.env.JWT_SECRET ??= "unit-test-secret-that-is-long-enough";
process.env.RABBITMQ_URL ??= "amqp://guest:guest@localhost:5672";
process.env.CREDIT_SERVICE_URL ??= "http://credit-service.test";
process.env.INTERNAL_API_KEY ??= "unit-test-key";
process.env.DB_USER ??= "test-user";
process.env.DB_PASSWORD ??= "test-password";
process.env.DB_DATABASE ??= "test-database";

const [{ Order, OutboxEvent, sequelize }, orderService, creditClient, orderEvents] = await Promise.all([
  import("../app/models/index.ts"),
  import("../app/service/orderService.ts"),
  import("../app/clients/creditClient.ts"),
  import("../app/events/orderEvents.ts"),
]);

const requester: AuthenticatedUser = { id: "requester-1", roles: ["REQUESTER"] };
const courier: AuthenticatedUser = { id: "courier-1", roles: ["COURIER"] };
const admin: AuthenticatedUser = { id: "admin-1", roles: ["ADMIN"] };
const validId = "a01f1234-1234-1234-1234-123456789abc";
const newOrderBody = (overrides: Record<string, unknown> = {}) => ({
  title: "Lunch",
  description: "Please collect lunch",
  supplier_id: "supplier-1",
  delivery_location: "Science",
  credit_amount: 3,
  accept_by: new Date(Date.now() + 60_000).toISOString(),
  ...overrides,
});

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  order_id: validId,
  requester_id: "requester-1",
  courier_id: null,
  status: "OPEN",
  title: "Lunch",
  description: "",
  supplier_id: "supplier-1",
  delivery_location: "Science",
  credit_amount: 3,
  accept_by: new Date(Date.now() + 60_000),
  created_at: new Date(),
  accepted_at: null,
  picked_up_at: null,
  completed_at: null,
  cancelled_at: null,
  expired_at: null,
  ...overrides,
});

const transactionMock = (t: TestContext) => {
  const fakeTransaction = { LOCK: { UPDATE: "UPDATE" } } as unknown as Transaction;
  t.mock.method(sequelize, "transaction", async <T>(
    callback: (transaction: Transaction) => Promise<T>,
  ): Promise<T> => callback(fakeTransaction));
  return fakeTransaction;
};

const mockFetch = (t: TestContext, implementation: typeof fetch) => {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = original;
  });
};

describe("order creation and lookup", () => {
  it("validates and trims order fields, reserves credits, and persists the new order", async (t) => {
    let payload: Record<string, unknown> | undefined;
    mockFetch(t, async (_url, init) => {
      payload = JSON.parse(String(init?.body));
      return new Response(null, { status: 200 });
    });
    transactionMock(t);
    const created = makeOrder({ order_id: "generated-order-id" });
    const create = t.mock.method(Order, "create", async () => created as never);
    const createEvent = t.mock.method(OutboxEvent, "create", async (values: unknown) => values as never);
    t.mock.method(OutboxEvent, "findAll", async () => []);

    const result = await orderService.createOrder(requester, newOrderBody({
      title: " Lunch ",
      supplier_id: " supplier-1 ",
      delivery_location: " Science ",
    }));

    assert.equal(result, created);
    assert.equal(payload?.requester_id, requester.id);
    assert.equal(payload?.amount, 3);
    assert.equal(create.mock.calls.length, 1);
    const values = create.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(values.title, "Lunch");
    assert.equal(values.supplier_id, "supplier-1");
    assert.equal(values.delivery_location, "Science");
    assert.equal(values.status, "OPEN");
    assert.equal(typeof values.order_id, "string");
    // ORDER_CREATED is recorded in the same transaction (notification service)
    const event = createEvent.mock.calls[0].arguments[0] as { event_type: string; payload: { data: { title: string } } };
    assert.equal(event.event_type, "ORDER_CREATED");
    assert.equal(event.payload.data.title, "Lunch");
  });

  it("rejects malformed, missing, overlong, and expired create fields before reserving credits", async (t) => {
    let calls = 0;
    mockFetch(t, async () => {
      calls += 1;
      return new Response(null, { status: 200 });
    });
    const invalidCases = [
      {},
      newOrderBody({ title: " " }),
      newOrderBody({ description: 1 }),
      newOrderBody({ supplier_id: "" }),
      newOrderBody({ delivery_location: "x".repeat(256) }),
      newOrderBody({ credit_amount: 0 }),
      newOrderBody({ credit_amount: 1.5 }),
      newOrderBody({ accept_by: "invalid date" }),
      newOrderBody({ accept_by: new Date(Date.now() - 1).toISOString() }),
    ];

    for (const body of invalidCases) {
      await assert.rejects(orderService.createOrder(requester, body),
        (error: Error & { status?: number }) => error.status === 400);
    }
    assert.equal(calls, 0);
  });

  it("does not create an order when credit reservation is rejected", async (t) => {
    mockFetch(t, async () => new Response(JSON.stringify({ message: "Not enough credits" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }));
    const create = t.mock.method(Order, "create");

    await assert.rejects(orderService.createOrder(requester, newOrderBody()),
      (error: Error & { status?: number; code?: string }) =>
        error.status === 409 && error.code === "CREDIT_RESERVATION_REJECTED");
    assert.equal(create.mock.calls.length, 0);
  });

  it("records a cancellation event to compensate if order persistence fails", async (t) => {
    mockFetch(t, async () => new Response(null, { status: 200 }));
    transactionMock(t);
    t.mock.method(Order, "create", async () => {
      throw new Error("database insert failed");
    });
    const createEvent = t.mock.method(OutboxEvent, "create", async (values: unknown) => values as never);
    t.mock.method(OutboxEvent, "findAll", async () => []);

    await assert.rejects(orderService.createOrder(requester, newOrderBody()), /database insert failed/);
    assert.equal(createEvent.mock.calls.length, 1);
    assert.equal((createEvent.mock.calls[0].arguments[0] as { event_type: string }).event_type, "ORDER_CANCELLED");
  });

  it("returns open orders to everyone and restricts other orders to participants or admins", async (t) => {
    const open = makeOrder();
    t.mock.method(Order, "findByPk", async () => open as never);
    assert.equal(await orderService.getOrder(requester, validId), open);

    const completed = makeOrder({ status: "COMPLETED", courier_id: "courier-1" });
    t.mock.method(Order, "findByPk", async () => completed as never);
    await assert.rejects(orderService.getOrder({ id: "other", roles: [] }, validId),
      (error: Error & { status?: number }) => error.status === 403);
    assert.equal(await orderService.getOrder(admin, validId), completed);
    assert.equal(await orderService.getOrder(courier, validId), completed);
  });

  it("rejects invalid and nonexistent order identifiers", async (t) => {
    const find = t.mock.method(Order, "findByPk", async () => null);
    await assert.rejects(orderService.getOrder(requester, "bad"),
      (error: Error & { status?: number }) => error.status === 400);
    assert.equal(find.mock.calls.length, 0);
    await assert.rejects(orderService.getOrder(requester, validId),
      (error: Error & { status?: number }) => error.status === 404);
  });
});

describe("order listing and lifecycle", () => {
  it("lists public open orders with defaults and hides orders past their accept-by time", async (t) => {
    const find = t.mock.method(Order, "findAndCountAll", async () => ({ rows: [], count: 0 }));
    const result = await orderService.listOrders({ id: "guest", roles: [] }, {});
    assert.deepEqual(result, { data: [], total: 0, limit: 50, offset: 0 });
    const options = find.mock.calls[0].arguments[0] as {
      where: Record<string, unknown>;
      limit: number;
      offset: number;
    };
    assert.equal(options.where.status, "OPEN");
    assert.ok("accept_by" in options.where);
    assert.equal(options.limit, 50);
    assert.equal(options.offset, 0);
  });

  it("applies owner, status, limit, and offset filters", async (t) => {
    const find = t.mock.method(Order, "findAndCountAll", async () => ({ rows: [makeOrder()], count: 1 }));
    const result = await orderService.listOrders(requester, {
      requester_id: requester.id, status: "COMPLETED", limit: "10", offset: "5",
    });
    const options = find.mock.calls[0].arguments[0] as {
      where: Record<string, unknown>;
      limit: number;
      offset: number;
    };
    assert.equal(result.total, 1);
    assert.equal(options.where.requester_id, requester.id);
    assert.equal(options.where.status, "COMPLETED");
    assert.equal(options.limit, 10);
    assert.equal(options.offset, 5);
  });

  it("rejects invalid pagination, filters, and attempts to query another user's orders", async (t) => {
    const find = t.mock.method(Order, "findAndCountAll", async () => ({ rows: [], count: 0 }));
    const cases: Array<Record<string, unknown>> = [
      { limit: "0" },
      { limit: "101" },
      { offset: "-1" },
      { offset: "1.5" },
      { status: "UNKNOWN" },
      { requester_id: "someone-else" },
      { courier_id: ["multiple", "values"] },
      { status: "COMPLETED" },
    ];
    for (const query of cases) {
      await assert.rejects(orderService.listOrders(requester, query),
        (error: Error & { status?: number }) => error.status === 400 || error.status === 403);
    }
    assert.equal(find.mock.calls.length, 0);
  });

  it("accepts an open order, assigns the courier, and guards self-acceptance and expiry", async (t) => {
    transactionMock(t);
    const openOrder = makeOrder();
    t.mock.method(Order, "findByPk", async () => openOrder as never);
    const update = t.mock.method(Order, "update", async () => [1, [makeOrder({ status: "ACCEPTED", courier_id: courier.id })] as never]);
    const createEvent = t.mock.method(OutboxEvent, "create", async (values: unknown) => values as never);
    t.mock.method(OutboxEvent, "findAll", async () => []);
    const accepted = await orderService.accept(courier, validId);
    assert.equal(accepted.status, "ACCEPTED");
    assert.equal((createEvent.mock.calls[0].arguments[0] as { event_type: string }).event_type, "ORDER_ACCEPTED");
    const values = update.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(values.status, "ACCEPTED");
    assert.equal(values.courier_id, courier.id);

    await assert.rejects(orderService.accept(requester, validId),
      (error: Error & { status?: number }) => error.status === 403);

    t.mock.method(Order, "findByPk", async () => makeOrder({ accept_by: new Date(Date.now() - 1) }) as never);
    await assert.rejects(orderService.accept(courier, validId),
      (error: Error & { status?: number; code?: string }) => error.status === 409 && error.code === "ORDER_EXPIRED");
  });

  it("picks up only an assigned courier's accepted order", async (t) => {
    transactionMock(t);
    t.mock.method(Order, "findByPk", async () => makeOrder({ status: "ACCEPTED", courier_id: courier.id }) as never);
    t.mock.method(Order, "update", async () => [1, [makeOrder({ status: "PICKED_UP" })] as never]);
    const createEvent = t.mock.method(OutboxEvent, "create", async (values: unknown) => values as never);
    t.mock.method(OutboxEvent, "findAll", async () => []);
    assert.equal((await orderService.pickup(courier, validId)).status, "PICKED_UP");
    assert.equal((createEvent.mock.calls[0].arguments[0] as { event_type: string }).event_type, "ORDER_PICKED_UP");

    t.mock.method(Order, "findByPk", async () =>
      makeOrder({ status: "ACCEPTED", courier_id: "another-courier" }) as never);
    await assert.rejects(orderService.pickup(courier, validId),
      (error: Error & { status?: number }) => error.status === 403);
  });

  it("completes and cancels requester-owned orders with transactional events", async (t) => {
    transactionMock(t);
    t.mock.method(Order, "findByPk", async () => makeOrder({
      status: "PICKED_UP", courier_id: courier.id,
    }) as never);
    t.mock.method(Order, "update", async () => [1, [makeOrder({ status: "COMPLETED" })] as never]);
    const createEvent = t.mock.method(OutboxEvent, "create", async (values: unknown) => values as never);
    t.mock.method(OutboxEvent, "findAll", async () => []);
    assert.equal((await orderService.complete(requester, validId)).status, "COMPLETED");
    assert.equal((createEvent.mock.calls[0].arguments[0] as { event_type: string }).event_type, "ORDER_COMPLETED");

    t.mock.method(Order, "findByPk", async () =>
      makeOrder({ status: "OPEN", courier_id: courier.id }) as never);
    t.mock.method(Order, "update", async () => [1, [makeOrder({ status: "CANCELLED" })] as never]);
    assert.equal((await orderService.cancel(requester, validId)).status, "CANCELLED");
    assert.equal((createEvent.mock.calls[1].arguments[0] as { event_type: string }).event_type, "ORDER_CANCELLED");
  });

  it("rejects unauthorized or invalid-state transitions and detects concurrent updates", async (t) => {
    transactionMock(t);
    t.mock.method(Order, "findByPk", async () =>
      makeOrder({ status: "OPEN", courier_id: courier.id }) as never);
    await assert.rejects(orderService.complete(courier, validId),
      (error: Error & { status?: number }) => error.status === 403);
    await assert.rejects(orderService.pickup(courier, validId),
      (error: Error & { status?: number; code?: string }) => error.status === 409 && error.code === "INVALID_STATE");

    t.mock.method(Order, "findByPk", async () => makeOrder() as never);
    t.mock.method(Order, "update", async () => [0, [] as never]);
    await assert.rejects(orderService.accept(courier, validId),
      (error: Error & { status?: number; code?: string }) => error.status === 409 && error.code === "INVALID_STATE");
  });

  it("expires due orders in batches and records an event only for rows actually updated", async (t) => {
    transactionMock(t);
    t.mock.method(Order, "findAll", async () => [
      makeOrder({ order_id: "due-1" }),
      makeOrder({ order_id: "due-2" }),
    ] as never);
    const updates: Array<[number, object[]]> = [
      [1, [makeOrder({ status: "EXPIRED" })]],
      [0, []],
    ];
    const update = t.mock.method(Order, "update", async () => updates.shift() as never);
    const createEvent = t.mock.method(OutboxEvent, "create", async (values: unknown) => values as never);

    assert.equal(await orderService.expireDueOpenOrders(2), 1);
    assert.equal(update.mock.calls.length, 2);
    assert.equal(createEvent.mock.calls.length, 1);
    assert.equal((createEvent.mock.calls[0].arguments[0] as { event_type: string }).event_type, "ORDER_EXPIRED");
  });
});

describe("order event and credit client", () => {
  it("builds and records an event with optional courier normalized to null", async (t) => {
    const record = {
      order_id: validId,
      requester_id: requester.id,
      courier_id: null,
      credit_amount: 3,
    };
    const create = t.mock.method(OutboxEvent, "create", async (values: unknown) => values as never);
    const event = await orderEvents.recordOrderEvent("ORDER_CANCELLED", record);
    assert.equal(event.event_type, "ORDER_CANCELLED");
    assert.equal(event.data.courier_id, null);
    assert.equal(typeof event.event_id, "string");
    assert.equal(Number.isNaN(Date.parse(event.timestamp)), false);
    assert.equal((create.mock.calls[0].arguments[0] as { payload: unknown }).payload, event);
    assert.deepEqual(create.mock.calls[0].arguments[1], {});
  });

  it("sends a credit reservation with optional internal authentication", async (t) => {
    let request: { url: string; init?: RequestInit } | undefined;
    mockFetch(t, async (input, init) => {
      request = { url: String(input), init };
      return new Response(null, { status: 204 });
    });
    await creditClient.reserve({ orderId: validId, userId: requester.id, amount: 0 });
    assert.match(request?.url ?? "", /\/api\/credit\/tx\/reserve$/);
    assert.equal((request?.init?.headers as Record<string, string>)["X-Internal-Api-Key"], "unit-test-key");
    assert.deepEqual(JSON.parse(String(request?.init?.body)), {
      order_id: validId, requester_id: requester.id, amount: 0,
    });
  });

  it("maps credit service network, server, auth, and business errors to documented errors", async (t) => {
    const originalError = console.error;
    console.error = () => {};
    t.after(() => {
      console.error = originalError;
    });

    mockFetch(t, async () => {
      throw new Error("offline");
    });
    await assert.rejects(creditClient.reserve({ orderId: validId, userId: requester.id, amount: 1 }),
      (error: Error & { status?: number }) => error.status === 503);

    for (const status of [401, 403, 500]) {
      mockFetch(t, async () => new Response("{}", { status }));
      await assert.rejects(creditClient.reserve({ orderId: validId, userId: requester.id, amount: 1 }),
        (error: Error & { status?: number }) => error.status === 503);
    }

    mockFetch(t, async () => new Response(JSON.stringify({ message: "Insufficient credits" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    }));
    await assert.rejects(creditClient.reserve({ orderId: validId, userId: requester.id, amount: 1 }),
      (error: Error & { status?: number; code?: string }) =>
        error.status === 409 && error.code === "CREDIT_RESERVATION_REJECTED" && error.message.includes("Insufficient credits"));
  });
});
