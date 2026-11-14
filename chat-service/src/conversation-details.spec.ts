/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Tested the team-specified conversation details contract.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-09, Codex, model: GPT-6): Implemented or tested the team-specified system conversations.
 * Author review: tng wen xi
 */
import request from "supertest";
import { createApp } from "./app.js";
import type { PrismaClient } from "./db/prisma.js";

const conversationId = "0192f0c4-0000-7000-8000-000000000001";
const userId = "0192f0c4-0000-7000-8000-00000000000a";
const time = "2026-11-08T00:00:00.000Z";
function setup() {
  const row = {
    conversationId,
    orderId: "0192f0c4-0000-7000-8000-000000000002",
    status: "ACTIVE",
    title: "Alice · Coffee from Deck",
    participants: [
      { userId, role: "REQUESTER", joinedAt: new Date(time) },
      {
        userId: "0192f0c4-0000-7000-8000-00000000000b",
        role: "COURIER",
        joinedAt: new Date(time),
      },
    ],
    createdAt: new Date(time),
    updatedAt: new Date(time),
  };
  const findUnique = vi.fn().mockResolvedValue(row);
  const verifyToken = vi
    .fn()
    .mockResolvedValue({ user_id: userId, role: "student", exp: 9999999999 });
  const app = createApp({
    prisma: { conversation: { findUnique } } as unknown as PrismaClient,
    apiKey: "test",
    verifyToken,
  });
  const get = (id = conversationId) =>
    request(app)
      .get(`/chat/conversations/${id}`)
      .set("Authorization", "Bearer test");
  return { row, findUnique, verifyToken, app, get };
}
it("requires Bearer authentication before validation or database access", async () => {
  const t = setup();
  expect(
    (
      await request(t.app)
        .get("/chat/conversations/bad")
        .set("X-Service-Key", "test")
    ).status,
  ).toBe(401);
  t.verifyToken.mockRejectedValueOnce(new Error("invalid token"));
  expect((await t.get()).status).toBe(401);
  expect(t.findUnique).not.toHaveBeenCalled();
});
it.each(["bad", "conv_123", "0192f0c4-0000-7000-8000-00000000000g"])(
  "rejects malformed ID %s",
  async (id) => {
    const t = setup();
    expect((await t.get(id)).status).toBe(400);
    expect(t.findUnique).not.toHaveBeenCalled();
  },
);
it("returns 404 for an unknown conversation", async () => {
  const t = setup();
  t.findUnique.mockResolvedValueOnce(null);
  expect((await t.get()).status).toBe(404);
});
it("returns 403 without conversation details for a non-participant", async () => {
  const t = setup();
  t.verifyToken.mockResolvedValueOnce({
    user_id: "outsider",
    role: "admin",
    exp: 9999999999,
  });
  const response = await t.get();
  expect(response.status).toBe(403);
  expect(response.text).not.toContain(t.row.title);
});
it.each(["REQUESTER", "COURIER"])(
  "returns the exact response for a %s participant, including revoked membership",
  async (role) => {
    const t = setup();
    const member = t.row.participants.find((p) => p.role === role)!;
    t.verifyToken.mockResolvedValueOnce({
      user_id: member.userId,
      role: "student",
      exp: 9999999999,
    });
    const response = await t.get();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...t.row,
      createdAt: time,
      updatedAt: time,
      participants: t.row.participants.map((p) => ({ ...p, joinedAt: time })),
    });
    // Access checks must not filter revoked memberships out of the selected participants.
    expect(t.findUnique).toHaveBeenCalledWith({
      where: { conversationId },
      select: {
        conversationId: true,
        orderId: true,
        status: true,
        title: true,
        participants: { select: { userId: true, role: true, joinedAt: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
  },
);
it("preserves archived status", async () => {
  const t = setup();
  t.row.status = "ARCHIVED";
  expect((await t.get()).body.status).toBe("ARCHIVED");
});
it("handles database errors", async () => {
  const t = setup();
  t.findUnique.mockRejectedValueOnce(new Error("database unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await t.get()).status).toBe(500);
  } finally {
    log.mockRestore();
  }
});

// AI-generated
it("returns nullable order and role for the owner and denies another user", async () => {
  const t = setup();
  t.findUnique.mockResolvedValue({
    ...t.row,
    orderId: null,
    title: "FoC",
    participants: [{ userId, role: null, joinedAt: new Date(time) }],
  });
  const response = await t.get();
  expect(response.status).toBe(200);
  expect(response.body.orderId).toBeNull();
  expect(response.body.participants[0].role).toBeNull();
  t.verifyToken.mockResolvedValue({
    user_id: "outsider",
    role: "student",
    exp: 9999999999,
  });
  expect((await t.get()).status).toBe(403);
});
