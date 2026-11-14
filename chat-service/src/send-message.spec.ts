/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Tested the team-specified message sending contract and post-commit broadcasts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-09, Codex, model: GPT-6): Implemented or tested the team-specified system conversations.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or verified user-specified order message actor fields and toast filtering.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Removed image/video message types as instructed by the user.
 * Author review: tng wen xi
 */
import request from "supertest";
import { createApp } from "./app.js";
import type { PrismaClient } from "./db/prisma.js";
const conversationId = "0192f0c4-0000-7000-8000-000000000001";
const userId = "0192f0c4-0000-7000-8000-00000000000a";
const otherId = "0192f0c4-0000-7000-8000-00000000000b";
function setup() {
  const row = {
    status: "ACTIVE",
    participants: [
      { userId, revokedAt: null as Date | null },
      { userId: otherId, revokedAt: null as Date | null },
    ],
  };
  const findUnique = vi.fn().mockResolvedValue(row);
  const create = vi.fn().mockImplementation(async ({ data }) => ({
    ...data,
    id: otherId,
    triggeredByUserId: null,
  }));
  const update = vi.fn().mockResolvedValue({});
  let committed = false;
  const transaction = vi.fn().mockImplementation(async (callback) => {
    const result = await callback({
      conversation: { findUnique, update },
      message: { create },
    });
    committed = true;
    return result;
  });
  const publish = vi.fn().mockImplementation(() => {
    expect(committed).toBe(true);
  });
  const verifyToken = vi
    .fn()
    .mockResolvedValue({ user_id: userId, role: "student", exp: 9999999999 });
  const app = createApp({
    prisma: { $transaction: transaction } as unknown as PrismaClient,
    apiKey: "test-key",
    verifyToken,
    publish,
  });
  const post = (
    body: object = { type: "TEXT", content: " hello " },
    id = conversationId,
  ) =>
    request(app)
      .post(`/chat/conversations/${id}/messages`)
      .set("Authorization", "Bearer test")
      .send(body);
  return {
    row,
    findUnique,
    create,
    update,
    transaction,
    publish,
    verifyToken,
    app,
    post,
  };
}
it("persists authenticated identity and timestamp atomically, then broadcasts and returns the message", async () => {
  const t = setup();
  const res = await t.post({
    type: "TEXT",
    content: " hello ",
    senderId: otherId,
  });
  expect(res.status).toBe(201);
  expect(res.body).toEqual({
    messageId: otherId,
    conversationId,
    senderId: userId,
    type: "TEXT",
    content: " hello ",
    triggeredByUserId: null,
    createdAt: expect.any(String),
  });
  const time = t.create.mock.calls[0]![0].data.createdAt;
  expect(t.update).toHaveBeenCalledWith({
    where: { conversationId },
    data: { updatedAt: time },
  });
  expect(t.publish).toHaveBeenCalledWith(res.body, [userId, otherId]);
});
it.each([null, { status: "ACTIVE", participants: [] }])(
  "rejects missing or inaccessible conversations %j",
  async (row) => {
    const t = setup();
    t.findUnique.mockResolvedValue(row);
    expect((await t.post()).status).toBe(row === null ? 404 : 403);
    expect(t.create).not.toHaveBeenCalled();
    expect(t.publish).not.toHaveBeenCalled();
  },
);
it.each(["archived", "revoked"])(
  "rejects %s senders/conversations",
  async (kind) => {
    const t = setup();
    if (kind === "archived") t.row.status = "ARCHIVED";
    else t.row.participants[0]!.revokedAt = new Date();
    expect((await t.post()).status).toBe(409);
    expect(t.create).not.toHaveBeenCalled();
    expect(t.publish).not.toHaveBeenCalled();
  },
);
it.each([
  { type: "TEXT", content: "" },
  { type: "TEXT", content: " \n\t" },
  { type: "TEXT" },
  { type: "TEXT", content: null },
  { type: "bad", content: "x" },
  { content: "x" },
])("rejects invalid payload %j", async (body) => {
  const t = setup();
  expect((await t.post(body)).status).toBe(400);
  expect(t.create).not.toHaveBeenCalled();
  expect(t.publish).not.toHaveBeenCalled();
});
it("rejects user SYSTEM messages with 422", async () => {
  const t = setup();
  expect((await t.post({ type: "SYSTEM", content: "x" })).status).toBe(422);
  expect(t.create).not.toHaveBeenCalled();
});
it("requires authentication and a valid conversation UUID", async () => {
  const t = setup();
  expect(
    (
      await request(t.app)
        .post(`/chat/conversations/${conversationId}/messages`)
        .send({ type: "TEXT", content: "x" })
    ).status,
  ).toBe(401);
  t.verifyToken.mockRejectedValueOnce(new Error("invalid"));
  expect((await t.post()).status).toBe(401);
  expect((await t.post(undefined, "bad")).status).toBe(400);
  expect(t.transaction).not.toHaveBeenCalled();
});
it.each(["anything", "order-service", ""])(
  "allows service name %j with a valid key and null sender",
  async (name) => {
    const t = setup();
    t.row.participants[0]!.revokedAt = new Date();
    const res = await request(t.app)
      .post(`/chat/conversations/${conversationId}/messages`)
      .set("X-Service-Key", "test-key")
      .set("X-Service-Name", name)
      .send({ type: "TEXT", content: "service", senderId: userId });
    expect(res.status).toBe(201);
    expect(res.body.senderId).toBeNull();
    expect(res.body.type).toBe("TEXT");
    expect(t.verifyToken).not.toHaveBeenCalled();
    expect(t.publish.mock.calls[0]![1]).toEqual([otherId]);
  },
);
it("allows service senders with no memberships but rejects archived conversations", async () => {
  const t = setup();
  t.row.participants = [];
  const send = () =>
    request(t.app)
      .post(`/chat/conversations/${conversationId}/messages`)
      .set("X-Service-Key", "test-key")
      .send({ type: "TEXT", content: "service" });
  expect((await send()).status).toBe(201);
  t.row.status = "ARCHIVED";
  expect((await send()).status).toBe(409);
  expect(t.create).toHaveBeenCalledTimes(1);
});
it("rejects incorrect service credentials", async () => {
  const t = setup();
  expect(
    (
      await request(t.app)
        .post(`/chat/conversations/${conversationId}/messages`)
        .set("X-Service-Key", "wrong")
        .send({ type: "TEXT", content: "x" })
    ).status,
  ).toBe(401);
  expect(t.transaction).not.toHaveBeenCalled();
});
it("does not broadcast when the transaction fails to commit", async () => {
  const t = setup();
  t.transaction.mockImplementationOnce(async (callback) => {
    await callback({
      conversation: { findUnique: t.findUnique, update: t.update },
      message: { create: t.create },
    });
    throw new Error("commit failed");
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await t.post()).status).toBe(500);
    expect(t.publish).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
it("returns the committed message if broadcasting throws", async () => {
  const t = setup();
  t.publish.mockImplementationOnce(() => {
    throw new Error("socket error");
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await t.post()).status).toBe(201);
  } finally {
    log.mockRestore();
  }
});

// AI-generated
it("forbids participant sends to an orderless system conversation", async () => {
  const t = setup();
  t.findUnique.mockResolvedValue({ ...t.row, orderId: null });
  expect((await t.post()).status).toBe(403);
  expect(t.create).not.toHaveBeenCalled();
  expect(t.publish).not.toHaveBeenCalled();
});
