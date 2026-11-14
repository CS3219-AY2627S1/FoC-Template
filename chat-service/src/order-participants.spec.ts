/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Tested the team-specified order-based participant endpoint.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Removed the conversation-ID participant endpoint per user instruction.
 * Author review: tng wen xi
 */
import request from "supertest";
import { createApp } from "./app.js";
import type { PrismaClient } from "./db/prisma.js";
const orderId = "0192f0c4-0000-7000-8000-000000000001";
const conversationId = "0192f0c4-0000-7000-8000-000000000002";
const userId = "0192f0c4-0000-7000-8000-000000000003";
function setup() {
  const findUnique = vi
    .fn()
    .mockImplementation(async ({ where }) =>
      where.orderId ? { conversationId } : { participants: [] },
    );
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const create = vi.fn().mockImplementation(async ({ data }) => ({
    ...data,
    id: userId,
    joinedAt: new Date("2026-11-08T00:00:00Z"),
  }));
  const tx = {
    conversation: { findUnique, updateMany },
    chatParticipant: { create },
  };
  const app = createApp({
    apiKey: "test",
    prisma: {
      $transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
    } as unknown as PrismaClient,
    verifyToken: async () => ({
      user_id: userId,
      role: "student",
      exp: 9999999999,
    }),
  });
  const post = (id = orderId, body: object = { userId, role: "COURIER" }) =>
    request(app)
      .post(`/chat/orders/${id}/participants`)
      .set("X-Service-Key", "test")
      .send(body);
  return { app, post, findUnique, updateMany, create };
}
it.each(["COURIER", "REQUESTER"])(
  "adds %s using the order ID and returns the conversation ID",
  async (role) => {
    const t = setup();
    const response = await t.post(orderId, { userId, role });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ conversationId, userId, role });
    expect(t.findUnique).toHaveBeenCalledWith({
      where: { orderId },
      select: { conversationId: true },
    });
    expect(t.updateMany).toHaveBeenCalledWith({
      where: { conversationId, status: "ACTIVE" },
      data: { conversationId },
    });
    expect(t.create).toHaveBeenCalledWith({
      data: { chatId: conversationId, userId, role },
    });
  },
);
it("returns 404 for a missing order conversation", async () => {
  const t = setup();
  t.findUnique.mockResolvedValue(null);
  expect((await t.post()).status).toBe(404);
  expect(t.create).not.toHaveBeenCalled();
});
it.each(["archived", "occupied"])("returns 409 for %s", async (state) => {
  const t = setup();
  if (state === "archived") t.updateMany.mockResolvedValue({ count: 0 });
  else
    t.findUnique.mockImplementation(async ({ where }) =>
      where.orderId ? { conversationId } : { participants: [{ id: userId }] },
    );
  expect((await t.post()).status).toBe(409);
  expect(t.create).not.toHaveBeenCalled();
});
it("validates UUIDs and body", async () => {
  const t = setup();
  expect((await t.post("invalid")).status).toBe(400);
  expect(
    (await t.post(orderId, { userId: "invalid", role: "COURIER" })).status,
  ).toBe(400);
  expect((await t.post(orderId, { userId, role: "ADMIN" })).status).toBe(400);
  expect(t.create).not.toHaveBeenCalled();
});
it.each([
  [undefined, undefined, 401],
  ["wrong", undefined, 401],
  [undefined, "token", 403],
])("preserves service-only authentication", async (key, token, status) => {
  const t = setup();
  const req = request(t.app).post(`/chat/orders/${orderId}/participants`);
  if (key) req.set("X-Service-Key", String(key));
  if (token) req.set("Authorization", `Bearer ${token}`);
  expect((await req.send({ userId, role: "COURIER" })).status).toBe(status);
  expect(t.create).not.toHaveBeenCalled();
});

// AI-generated (edited by <name>).
it("does not expose the removed conversation-ID participant endpoint", async () => {
  const t = setup();
  const response = await request(t.app)
    .post(`/chat/conversations/${conversationId}/participants`)
    .set("X-Service-Key", "test")
    .send({ userId, role: "COURIER" });
  expect(response.status).toBe(404);
  expect(t.findUnique).not.toHaveBeenCalled();
  expect(t.create).not.toHaveBeenCalled();
});
