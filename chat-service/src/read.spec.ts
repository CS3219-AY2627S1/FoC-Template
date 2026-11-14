/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Tested the team-specified read endpoint and concurrent cursor updates.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */
import request from "supertest";
import { createApp } from "./app.js";
import type { PrismaClient } from "./db/prisma.js";
const conversationId = "0192f0c4-0000-7000-8000-000000000001";
const userId = "0192f0c4-0000-7000-8000-00000000000a";
const targetId = "0192f0c4-0000-7000-8000-000000000010";
const newerId = "0192f0c4-0000-7000-8000-000000000020";
function setup() {
  const participant = {
    id: userId,
    userId,
    revokedAt: null as Date | null,
    lastReadMessageId: null as string | null,
  };
  const conversation = { participants: [participant] };
  const findUnique = vi.fn().mockResolvedValue(conversation);
  const message = {
    id: targetId,
    chatId: conversationId,
    createdAt: new Date("2026-11-08T00:00:00Z"),
  };
  const findMessage = vi.fn().mockResolvedValue(message);
  const findFirst = vi.fn().mockResolvedValue(null);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const publishRead = vi.fn();
  const app = createApp({
    prisma: {
      conversation: { findUnique },
      message: { findUnique: findMessage, findFirst },
      chatParticipant: { updateMany },
    } as unknown as PrismaClient,
    apiKey: "test",
    verifyToken: async () => ({
      user_id: userId,
      role: "student",
      exp: 9999999999,
    }),
    publishRead,
  });
  const post = (
    body: object = { lastReadMessageId: targetId },
    id = conversationId,
  ) =>
    request(app)
      .post(`/chat/conversations/${id}/read`)
      .set("Authorization", "Bearer test")
      .send(body);
  return {
    participant,
    conversation,
    findUnique,
    findMessage,
    findFirst,
    updateMany,
    publishRead,
    app,
    post,
    message,
  };
}
it("advances the authenticated participant cursor and emits the exact response after persistence", async () => {
  const t = setup();
  t.publishRead.mockImplementation(() =>
    expect(t.updateMany).toHaveBeenCalled(),
  );
  const response = await t.post({
    lastReadMessageId: targetId,
    userId: newerId,
  });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    conversationId,
    userId,
    lastReadMessageId: targetId,
  });
  expect(t.updateMany).toHaveBeenCalledWith({
    where: { id: userId, lastReadMessageId: null, revokedAt: null },
    data: { lastReadMessageId: targetId },
  });
  expect(t.publishRead).toHaveBeenCalledWith(response.body);
});
it.each(["same", "older"])(
  "emits retained cursor for %s position",
  async (kind) => {
    const t = setup();
    t.participant.lastReadMessageId = kind === "same" ? targetId : newerId;
    if (kind === "older") t.findFirst.mockResolvedValue({ id: newerId });
    const response = await t.post();
    expect(response.status).toBe(200);
    expect(response.body.lastReadMessageId).toBe(
      t.participant.lastReadMessageId,
    );
    expect(t.publishRead).toHaveBeenCalledWith(response.body);
  },
);
it("rechecks a concurrent cursor change before writing", async () => {
  const t = setup();
  t.updateMany.mockImplementationOnce(async () => {
    t.participant.lastReadMessageId = newerId;
    t.findFirst.mockResolvedValue({ id: newerId });
    return { count: 0 };
  });
  const response = await t.post();
  expect(response.body.lastReadMessageId).toBe(newerId);
  expect(t.updateMany).toHaveBeenCalledTimes(2);
  expect(t.publishRead).toHaveBeenCalledTimes(1);
});
it.each([
  "missing conversation",
  "nonparticipant",
  "revoked",
  "missing message",
  "wrong conversation",
])("rejects %s without write or event", async (scenario) => {
  const t = setup();
  const status = {
    "missing conversation": 404,
    nonparticipant: 403,
    revoked: 409,
    "missing message": 404,
    "wrong conversation": 400,
  }[scenario];
  if (scenario === "missing conversation") t.findUnique.mockResolvedValue(null);
  if (scenario === "nonparticipant") t.conversation.participants = [];
  if (scenario === "revoked") t.participant.revokedAt = new Date();
  if (scenario === "missing message") t.findMessage.mockResolvedValue(null);
  if (scenario === "wrong conversation") t.message.chatId = newerId;
  expect((await t.post()).status).toBe(status);
  expect(t.updateMany).not.toHaveBeenCalled();
  expect(t.publishRead).not.toHaveBeenCalled();
});
it.each([{}, { lastReadMessageId: "bad" }, { lastReadMessageId: null }])(
  "rejects invalid body %j",
  async (body) => {
    const t = setup();
    expect((await t.post(body)).status).toBe(400);
    expect(t.findUnique).not.toHaveBeenCalled();
  },
);
it("requires authentication and a valid conversation id", async () => {
  const t = setup();
  expect(
    (
      await request(t.app)
        .post(`/chat/conversations/${conversationId}/read`)
        .send({ lastReadMessageId: targetId })
    ).status,
  ).toBe(401);
  expect((await t.post(undefined, "bad")).status).toBe(400);
});
