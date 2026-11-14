/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-10
 * Scope: Tested the team-specified order chat archive endpoint.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */
import request from "supertest";
import { createApp } from "./app.js";
import type { PrismaClient } from "./db/prisma.js";
const id = "0192f0c4-0000-7000-8000-000000000001";
const userId = "0192f0c4-0000-7000-8000-00000000000a";
function setup() {
  const findUnique = vi
    .fn()
    .mockResolvedValue({ conversationId: id, participants: [{ userId }] });
  const update = vi.fn().mockResolvedValue({});
  const app = createApp({
    prisma: { conversation: { findUnique, update } } as unknown as PrismaClient,
    apiKey: "test",
    verifyToken: async (token) => {
      if (token !== "valid") throw new Error("invalid");
      return { user_id: userId, role: "student", exp: 9999999999 };
    },
  });
  const post = (orderId = id) =>
    request(app).post(`/chat/orders/${orderId}/archive`);
  return { post, findUnique, update };
}
it("archives by order ID with a service key and accepts repeat calls", async () => {
  const t = setup();
  for (let i = 0; i < 2; i++)
    expect((await t.post().set("X-Service-Key", "test")).status).toBe(200);
  expect(t.findUnique).toHaveBeenCalledWith(
    expect.objectContaining({ where: { orderId: id } }),
  );
  expect(t.update).toHaveBeenCalledWith({
    where: { conversationId: id },
    data: { status: "ARCHIVED" },
  });
});
it("permits a participant using user authentication", async () => {
  const t = setup();
  expect((await t.post().set("Authorization", "Bearer valid")).status).toBe(
    200,
  );
  expect(t.findUnique).toHaveBeenCalledWith(
    expect.objectContaining({
      select: expect.objectContaining({
        participants: { where: { userId }, select: { userId: true } },
      }),
    }),
  );
});
it("rejects nonparticipants without writing", async () => {
  const t = setup();
  t.findUnique.mockResolvedValue({ conversationId: id, participants: [] });
  expect((await t.post().set("Authorization", "Bearer valid")).status).toBe(
    403,
  );
  expect(t.update).not.toHaveBeenCalled();
});
it("returns 404 for a missing conversation", async () => {
  const t = setup();
  t.findUnique.mockResolvedValue(null);
  expect((await t.post().set("X-Service-Key", "test")).status).toBe(404);
  expect(t.update).not.toHaveBeenCalled();
});
it("returns 400 for a malformed UUID", async () => {
  const t = setup();
  expect((await t.post("bad").set("X-Service-Key", "test")).status).toBe(400);
  expect(t.findUnique).not.toHaveBeenCalled();
});
it.each([undefined, "wrong"])(
  "rejects missing or invalid credentials: %s",
  async (key) => {
    const t = setup();
    const req = t.post();
    if (key) req.set("X-Service-Key", key);
    expect((await req).status).toBe(401);
    expect(t.update).not.toHaveBeenCalled();
  },
);
