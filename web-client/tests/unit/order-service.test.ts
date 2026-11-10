// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09, 2026-10-11
// Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
// Scope: Implemented participant Order client, response and error-handling tests.
// Author review: I validated correctness and added boundary checks where needed.

import { afterEach, describe, expect, it, vi } from "vitest";
import { orderService, type OrderInput } from "../../src/api/order-service";

const input: OrderInput = {
  supplierId: "supplier-id",
  itemDescription: "One vegetarian sandwich",
  deliveryLocation: "COM3 collection point",
  reward: 10,
  acceptanceDeadline: "2026-10-10T12:30:00+08:00",
  deliveryDeadline: "2026-10-10T13:00:00+08:00",
};

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Order create/read client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers participants no way to fail an errand directly", () => {
    // N2F3: an errand fails only when an administrator accepts a dispute about it.
    expect("fail" in orderService).toBe(false);
  });

  it.each(["accept", "cancel", "pickup", "deliver", "complete"] as const)("posts %s with current auth and no client actor/state", async (action) => {
    const fetchMock = respond({ state: action === "accept" ? "ACCEPTED" : "CANCELLED" });
    await orderService[action]("order/id", "current-token");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`/v1/orders/order%2Fid/${action}`);
    expect(options.method).toBe("POST");
    expect(options.body).toBeUndefined();
    expect(options.headers.get("Authorization")).toBe("Bearer current-token");
  });

  it.each([200, 201])("returns a confirmed order for HTTP %s", async (status) => {
    const order = { ...input, orderId: "order-id", state: "OPEN" };
    const fetchMock = respond(order, status);
    await expect(orderService.create(input, "creation-key", "access-token")).resolves.toEqual(order);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/v1/orders");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual(input);
    const headers = options.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(headers.get("Idempotency-Key")).toBe("creation-key");
    expect(headers.get("X-Correlation-ID")).toBeTruthy();
  });

  it("keeps unresolved creation distinct from an order and retains the retry key/body", async () => {
    const pending = { operationId: "operation-id", orderId: null, stage: "RESERVATION_UNKNOWN", retryCreation: false };
    const fetchMock = respond(pending, 202);
    await expect(orderService.create(input, "same-key", "first-token")).resolves.toEqual(pending);
    await orderService.create(input, "same-key", "refreshed-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0][1] as RequestInit;
    const retry = fetchMock.mock.calls[1][1] as RequestInit;
    expect(first.body).toBe(retry.body);
    expect((retry.headers as Headers).get("Idempotency-Key")).toBe("same-key");
    expect((retry.headers as Headers).get("Authorization")).toBe("Bearer refreshed-token");
  });

  it("does not send protected actor or state fields from a form object", async () => {
    const fetchMock = respond({});
    const form = { ...input, requesterId: "spoofed", state: "COMPLETED" };
    await orderService.create(form, "key", "token");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(input);
  });

  it.each([
    [503, "CREDIT_UNAVAILABLE"], [409, "INSUFFICIENT_CREDIT"],
    [409, "IDEMPOTENCY_CONFLICT"], [401, "AUTH_REQUIRED"], [422, "VALIDATION_ERROR"],
  ])("preserves HTTP %s %s without returning fake success or retrying", async (status, code) => {
    const fetchMock = respond({ error: { code, message: "Request failed", correlationId: "correlation-id", fieldErrors: [] } }, status);
    await expect(orderService.create(input, "key", "token")).rejects.toMatchObject({ status, code, correlationId: "correlation-id" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a lost response without silently creating another attempt", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(orderService.create(input, "keep-this-key", "token")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses encoded fixed-origin status/detail/history paths and camelCase pagination", async () => {
    const fetchMock = respond({});
    await orderService.creation("operation/id?other", "token");
    await orderService.detail("order/id", "token");
    await orderService.history("order/id", { page: 2, pageSize: 20 }, "token");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/v1/order-creations/operation%2Fid%3Fother", "/v1/orders/order%2Fid",
      "/v1/orders/order%2Fid/history?page=2&pageSize=20",
    ]);
    for (const [, options] of fetchMock.mock.calls) expect(options.method).toBe("GET");
  });

  it("requests public assessment and own-order queries without supplying actor IDs", async () => {
    const fetchMock = respond({ items: [], page: 1, pageSize: 20, total: 0 });
    await orderService.list({ supplierId: "supplier+id", page: 1, pageSize: 20 }, "token");
    await orderService.list({}, "token");
    await orderService.mine("requester", { page: 2 }, "token");
    await orderService.mine("courier", {}, "token");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/v1/orders?page=1&pageSize=20&supplierId=supplier%2Bid", "/v1/orders",
      "/v1/orders/mine?page=2&relationship=requester", "/v1/orders/mine?relationship=courier",
    ]);
  });
});
