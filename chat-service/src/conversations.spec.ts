/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-07
 * Scope: Implemented the team-specified chat creation endpoint and supporting scaffold.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */
import request from "supertest";
import { createApp } from "./app.js";
import type { PrismaClient } from "./db/prisma.js";
const key = "test-service-key";
const body = {
  orderId: "0192f0c4-0000-7000-8000-000000000001",
  requesterId: "0192f0c4-0000-7000-8000-00000000000a",
  orderDescription: "Coffee from Deck",
};
function setup() {
  let row: any = null;
  const findUnique = vi.fn(async () => row);
  const create = vi.fn(async ({ data }: any) => {
    row = {
      conversationId: "0192f0c4-0000-7000-8000-000000000002",
      orderId: data.orderId,
      title: data.title,
      status: "ACTIVE",
      createdAt: new Date("2026-11-07T00:00:00.000Z"),
      participants: [data.participants.create],
    };
    return row;
  });
  const app = createApp({
    prisma: { conversation: { findUnique, create } } as unknown as PrismaClient,
    apiKey: key,
  });
  const post = (payload: object = body) =>
    request(app)
      .post("/chat/conversations")
      .set("X-Service-Key", key)
      .set("X-Service-Name", "order-service")
      .send(payload);
  return { app, post, create, findUnique };
}
it("creates the conversation with requester in one nested write and returns 201", async () => {
  const t = setup();
  const res = await t.post();
  expect(res.status).toBe(201);
  expect(res.body).toEqual({
    success: true,
    data: {
      conversationId: expect.any(String),
      orderId: body.orderId,
      title: body.orderDescription,
      status: "ACTIVE",
      createdAt: "2026-11-07T00:00:00.000Z",
    },
  });
  expect(t.create).toHaveBeenCalledWith({
    data: {
      orderId: body.orderId,
      title: body.orderDescription,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
      participants: {
        create: {
          userId: body.requesterId,
          role: "REQUESTER",
          joinedAt: expect.any(Date),
        },
      },
    },
    include: { participants: true },
  });
});
it("returns the same conversation for an identical retry", async () => {
  const t = setup();
  const first = await t.post();
  const second = await t.post();
  expect(second.status).toBe(200);
  expect(second.body).toEqual(first.body);
  expect(t.create).toHaveBeenCalledTimes(1);
});
it.each([
  { orderDescription: "Tea" },
  { requesterId: "0192f0c4-0000-7000-8000-00000000000b" },
])("rejects differing creation details", async (change) => {
  const t = setup();
  await t.post();
  const res = await t.post({ ...body, ...change });
  expect(res.status).toBe(409);
  expect(res.body.error).toEqual({
    code: "ORDER_ID_CONFLICT",
    message:
      "A conversation already exists for this order with different creation details",
  });
});
it.each([undefined, "wrong"])(
  "rejects missing or invalid keys",
  async (supplied) => {
    const t = setup();
    const req = request(t.app)
      .post("/chat/conversations")
      .set("X-Service-Name", "order-service");
    if (supplied) req.set("X-Service-Key", supplied);
    const res = await req.send(body);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Invalid service credentials" },
    });
    expect(t.create).not.toHaveBeenCalled();
  },
);
it("rejects a valid key used by an unpermitted service", async () => {
  const t = setup();
  const res = await request(t.app)
    .post("/chat/conversations")
    .set("X-Service-Key", key)
    .set("X-Service-Name", "credit-service")
    .send(body);
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe("FORBIDDEN");
  expect(t.create).not.toHaveBeenCalled();
});
it.each([
  {},
  { ...body, orderId: "bad" },
  { ...body, requesterId: "bad" },
  { ...body, orderDescription: "" },
  { ...body, orderDescription: "  " },
])("validates required fields, UUIDs and description", async (payload) => {
  const t = setup();
  const res = await t.post(payload);
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe("VALIDATION_ERROR");
  expect(res.body.error.details.length).toBeGreaterThan(0);
  expect(t.create).not.toHaveBeenCalled();
});
it("recovers an identical concurrent winner after unique orderId violation", async () => {
  const t = setup();
  const first = await t.post();
  t.findUnique.mockResolvedValueOnce(null);
  t.create.mockRejectedValueOnce({ code: "P2002" });
  const retry = await t.post();
  expect(retry.status).toBe(200);
  expect(retry.body).toEqual(first.body);
});
