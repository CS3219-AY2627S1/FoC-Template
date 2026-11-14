/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Tested the team-specified system notification endpoint.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested the team-specified order chat delivery and message ID deduplication.
 * Author review: tng wen xi
 * Scope (2026-11-09, Codex, model: GPT-6): Implemented or tested the team-specified system conversations.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or verified user-specified order message actor fields and toast filtering.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Updated the system notification response assertion to the documented actor field.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Combined existing translation and chat branch changes during merge resolution.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */
import request from "supertest";
import { createApp } from "./app.js";
import type { PrismaClient } from "./db/prisma.js";
const id = "0192f0c4-0000-7000-8000-000000000001";
const userId = "0192f0c4-0000-7000-8000-00000000000a";
function setup() {
  const findMessage = vi.fn().mockResolvedValue(null);
  const findOrder = vi.fn().mockResolvedValue({ conversationId: id });
  const findUnique = vi.fn().mockResolvedValue({
    status: "ACTIVE",
    participants: [
      { userId, revokedAt: null },
      { userId: id, revokedAt: new Date() },
    ],
  });
  const create = vi
    .fn()
    .mockImplementation(async ({ data }) => ({ ...data, id }));
  const update = vi.fn().mockResolvedValue({});
  const findSystem = vi.fn().mockResolvedValue(null);
  const createConversation = vi.fn().mockResolvedValue({ conversationId: id });
  const createSystem = vi.fn().mockImplementation(async ({ data }) => data);
  let committed = false;
  const transaction = vi.fn().mockImplementation(async (fn) => {
    const result = await fn({
      conversation: { findUnique, update, create: createConversation },
      systemChat: { create: createSystem },
      message: { create },
    });
    committed = true;
    return result;
  });
  const publish = vi.fn().mockImplementation(() => {
    expect(committed).toBe(true);
  });
  const app = createApp({
    prisma: {
      conversation: { findUnique: findOrder },
      systemChat: { findUnique: findSystem },
      message: { findUnique: findMessage },
      $transaction: transaction,
    } as unknown as PrismaClient,
    apiKey: "test",
    publish,
    verifyToken: async (token) => {
      if (token !== "valid") throw new Error("invalid");
      return { user_id: userId, role: "student", exp: 9999999999 };
    },
  });
  const post = (
    body: object = { orderId: id, messageId: id, message: "  Order ready  " },
  ) =>
    request(app)
      .post("/chat/send-system-notification")
      .set("X-Service-Key", "test")
      .send(body);
  return {
    app,
    findSystem,
    createConversation,
    createSystem,
    findMessage,
    post,
    findOrder,
    findUnique,
    create,
    update,
    transaction,
    publish,
  };
}
it("looks up the order, persists SYSTEM and publishes the returned message after commit", async () => {
  const t = setup();
  const response = await t.post();
  expect(response.status).toBe(201);
  expect(t.findOrder).toHaveBeenCalledWith({
    where: { orderId: id },
    select: { conversationId: true },
  });
  expect(response.body).toEqual({
    messageId: id,
    conversationId: id,
    senderId: null,
    type: "SYSTEM",
    content: "  Order ready  ",
    triggeredByUserId: null,
    createdAt: expect.any(String),
  });
  expect(t.create).toHaveBeenCalledWith({
    data: {
      id,
      chatId: id,
      senderId: null,
      type: "SYSTEM",
      content: "  Order ready  ",
      triggeredByUserId: null,
      createdAt: expect.any(Date),
    },
  });
  expect(t.update).toHaveBeenCalledWith({
    where: { conversationId: id },
    data: { updatedAt: new Date(response.body.createdAt) },
  });
  expect(t.publish).toHaveBeenCalledWith(response.body, [userId]);
});
it.each([
  {},
  { messageId: id, orderId: "bad", message: "hello" },
  { messageId: id, orderId: id },
  { messageId: id, orderId: id, message: "" },
  { messageId: id, orderId: id, message: " \n " },
  { messageId: id, orderId: id, message: 1 },
])("rejects invalid input %j", async (body) => {
  const t = setup();
  expect((await t.post(body)).status).toBe(400);
  expect(t.findOrder).not.toHaveBeenCalled();
});
it.each([
  [undefined, undefined, 401],
  [undefined, "valid", 403],
  [undefined, "invalid", 401],
  ["wrong", "valid", 401],
  ["test", "invalid", 201],
])("checks key %s and token %s", async (key, token, status) => {
  const t = setup();
  const req = request(t.app).post("/chat/send-system-notification");
  if (key) req.set("X-Service-Key", String(key));
  if (token) req.set("Authorization", `Bearer ${token}`);
  expect(
    (await req.send({ orderId: id, messageId: id, message: "hello" })).status,
  ).toBe(status);
  if (status !== 201) expect(t.findOrder).not.toHaveBeenCalled();
});
it.each(["missing order", "missing conversation", "archived"])(
  "rejects %s",
  async (scenario) => {
    const t = setup();
    if (scenario === "missing order") t.findOrder.mockResolvedValue(null);
    if (scenario === "missing conversation")
      t.findUnique.mockResolvedValue(null);
    if (scenario === "archived")
      t.findUnique.mockResolvedValue({ status: "ARCHIVED", participants: [] });
    expect((await t.post()).status).toBe(scenario === "archived" ? 409 : 404);
    expect(t.create).not.toHaveBeenCalled();
    expect(t.publish).not.toHaveBeenCalled();
  },
);
it.each(["lookup", "insert", "update", "broadcast"])(
  "handles %s failure",
  async (stage) => {
    const t = setup();
    const target = {
      lookup: t.findOrder,
      insert: t.create,
      update: t.update,
      broadcast: t.publish,
    }[stage]!;
    target.mockImplementation(() => {
      throw new Error("failure");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await t.post()).status).toBe(stage === "broadcast" ? 201 : 500);
      if (stage !== "broadcast") expect(t.publish).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  },
);

// AI-generated
function storedMessage(overrides: object = {}) {
  return {
    id,
    chatId: id,
    senderId: null,
    type: "SYSTEM",
    content: "  Order ready  ",
    metadata: null,
    createdAt: new Date("2026-11-08T00:00:00Z"),
    conversation: { orderId: id },
    ...overrides,
  };
}
it("returns the existing message on retry without writing or broadcasting", async () => {
  const t = setup();
  t.findMessage.mockResolvedValue(storedMessage());
  const response = await t.post();
  expect(response.status).toBe(200);
  expect(response.body.messageId).toBe(id);
  expect(t.transaction).not.toHaveBeenCalled();
  expect(t.publish).not.toHaveBeenCalled();
});
it.each([
  { content: "different" },
  { conversation: { orderId: userId } },
  { type: "TEXT" },
  { senderId: userId },
])("rejects message ID collision %j", async (overrides) => {
  const t = setup();
  t.findMessage.mockResolvedValue(storedMessage(overrides));
  expect((await t.post()).status).toBe(409);
  expect(t.transaction).not.toHaveBeenCalled();
  expect(t.publish).not.toHaveBeenCalled();
});
it.each([false, true])(
  "handles a concurrent primary-key collision (conflict=%s)",
  async (conflict) => {
    const t = setup();
    t.findMessage
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        storedMessage(conflict ? { content: "different" } : {}),
      );
    t.create.mockRejectedValue({ code: "P2002" });
    expect((await t.post()).status).toBe(conflict ? 409 : 200);
    expect(t.update).not.toHaveBeenCalled();
    expect(t.publish).not.toHaveBeenCalled();
  },
);
it.each([undefined, "bad"])(
  "requires a UUID messageId (%s)",
  async (messageId) => {
    const t = setup();
    expect(
      (await t.post({ orderId: id, message: "hello", messageId })).status,
    ).toBe(400);
    expect(t.findMessage).not.toHaveBeenCalled();
  },
);

// AI-generated
const orderless = (recipient = userId, messageId = id) => ({
  orderId: null,
  recipient,
  messageId,
  message: "Schedule failed",
});
it("lazily creates FoC with a single nullable-role participant and emits the message", async () => {
  const t = setup();
  const response = await t.post(orderless());
  expect(response.status).toBe(201);
  expect(t.createConversation).toHaveBeenCalledWith({
    data: {
      orderId: null,
      title: "FoC",
      participants: { create: { userId, role: null } },
    },
  });
  expect(t.createSystem).toHaveBeenCalledWith({
    data: { userId, conversationId: id },
  });
  expect(t.findOrder).not.toHaveBeenCalled();
  expect(t.publish).toHaveBeenCalledWith(response.body, [userId]);
});
it("reuses a user's system conversation", async () => {
  const t = setup();
  t.findSystem.mockResolvedValue({ userId, conversationId: id });
  expect((await t.post(orderless())).status).toBe(201);
  expect((await t.post(orderless(userId, userId))).status).toBe(201);
  expect(t.createConversation).not.toHaveBeenCalled();
});
it("creates separate mappings for different recipients", async () => {
  const t = setup();
  await t.post(orderless());
  await t.post(orderless(id, userId));
  expect(t.createSystem.mock.calls.map(([arg]) => arg.data.userId)).toEqual([
    userId,
    id,
  ]);
});
it("reuses the winning mapping after a concurrent unique-user collision", async () => {
  const t = setup();
  t.findSystem
    .mockResolvedValueOnce(null)
    .mockResolvedValue({ userId, conversationId: id });
  t.createSystem.mockRejectedValue({ code: "P2002" });
  expect((await t.post(orderless())).status).toBe(201);
  expect(t.findSystem).toHaveBeenCalledTimes(2);
  expect(t.create).toHaveBeenCalledTimes(1);
});
it.each([userId, id])(
  "checks recipient identity on duplicate system message (%s)",
  async (recipient) => {
    const t = setup();
    t.findMessage.mockResolvedValue(
      storedMessage({
        content: "Schedule failed",
        conversation: { orderId: null, systemChat: { userId } },
      }),
    );
    expect((await t.post(orderless(recipient))).status).toBe(
      recipient === userId ? 200 : 409,
    );
    expect(t.createConversation).not.toHaveBeenCalled();
    expect(t.publish).not.toHaveBeenCalled();
  },
);
it.each([undefined, "bad", null])(
  "requires a UUID recipient for orderless requests (%s)",
  async (recipient) => {
    const t = setup();
    expect((await t.post({ ...orderless(), recipient })).status).toBe(400);
    expect(t.findSystem).not.toHaveBeenCalled();
  },
);

// AI-generated
it("routes simultaneous orderless notifications through one winning unique-user mapping", async () => {
  const t = setup();
  let mapping: { userId: string; conversationId: string } | null = null;
  let lookups = 0;
  let release!: () => void;
  const bothLookedUp = new Promise<void>((resolve) => {
    release = resolve;
  });
  t.findSystem.mockImplementation(async () => {
    if (++lookups <= 2) {
      if (lookups === 2) release();
      await bothLookedUp;
      return null;
    }
    return mapping;
  });
  t.createSystem.mockImplementation(async ({ data }) => {
    if (mapping) throw { code: "P2002" };
    mapping = data;
    return data;
  });
  const responses = await Promise.all([
    t.post(orderless()),
    t.post(orderless(userId, userId)),
  ]);
  expect(responses.map((response) => response.status)).toEqual([201, 201]);
  expect(mapping).toEqual({ userId, conversationId: id });
  expect(responses.map((response) => response.body.conversationId)).toEqual([
    id,
    id,
  ]);
});
