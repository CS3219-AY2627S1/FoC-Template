/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
 * Scope: Tested the team-specified translation toggle route, enqueue-on-send, the translation
 *        job and the per-user translatedContent in message history.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import request from "supertest";
import { createApp } from "./app.js";
import type { PrismaClient } from "./db/prisma.js";
import { createTranslationProcessor } from "./translation/worker.js";
import { systemPrompt } from "./translation/gemini.js";

const conversationId = "0192f0c4-0000-7000-8000-000000000001";
const userId = "0192f0c4-0000-7000-8000-00000000000a";
const otherId = "0192f0c4-0000-7000-8000-00000000000b";
const messageId = "0192f0c4-0000-7000-8000-000000000009";
const time = "2026-11-09T00:00:00.000Z";

function toggleSetup(translateTo: string | null = null, revokedAt: Date | null = null) {
  const tx = {
    translatedMessage: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    chatParticipant: { update: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    conversation: {
      findUnique: vi.fn().mockResolvedValue({
        participants: [
          { id: "p1", userId, revokedAt, translateTo },
          { id: "p2", userId: otherId, revokedAt: null, translateTo: null },
        ],
      }),
    },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const verifyToken = vi
    .fn()
    .mockResolvedValue({ user_id: userId, role: "student", exp: 9999999999 });
  const app = createApp({
    prisma: prisma as unknown as PrismaClient,
    apiKey: "test",
    verifyToken,
    enqueueTranslation: enqueue,
  });
  const post = (body: unknown, id = conversationId) =>
    request(app)
      .post(`/chat/conversations/${id}/translation`)
      .set("Authorization", "Bearer test")
      .send(body as object);
  return { tx, prisma, enqueue, app, post };
}

describe("POST /chat/conversations/:id/translation", () => {
  it("turns translation on, stores the language and queues a backfill", async () => {
    const t = toggleSetup();
    const res = await t.post({ enabled: true, language: "es" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ conversationId, userId, translateTo: "es" });
    expect(t.tx.chatParticipant.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { translateTo: "es" },
    });
    expect(t.tx.translatedMessage.deleteMany).not.toHaveBeenCalled();
    expect(t.enqueue).toHaveBeenCalledWith([
      { conversationId, userId, language: "es" },
    ]);
  });

  it("turns translation off by clearing translate_to without queueing", async () => {
    const t = toggleSetup("es");
    const res = await t.post({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.translateTo).toBeNull();
    expect(t.tx.chatParticipant.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { translateTo: null },
    });
    expect(t.enqueue).not.toHaveBeenCalled();
  });

  it("discards stored translations when the language changes", async () => {
    const t = toggleSetup("es");
    await t.post({ enabled: true, language: "zh" });
    expect(t.tx.translatedMessage.deleteMany).toHaveBeenCalledWith({
      where: { userId, message: { chatId: conversationId } },
    });
  });

  it.each([
    {},
    { enabled: true },
    { enabled: true, language: "fr" },
    { enabled: "yes" },
  ])("rejects invalid body %j", async (body) => {
    const t = toggleSetup();
    expect((await t.post(body)).status).toBe(400);
    expect(t.prisma.conversation.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a malformed conversation id and missing authentication", async () => {
    const t = toggleSetup();
    expect((await t.post({ enabled: false }, "bad")).status).toBe(400);
    expect(
      (
        await request(t.app)
          .post(`/chat/conversations/${conversationId}/translation`)
          .send({ enabled: false })
      ).status,
    ).toBe(401);
  });

  it("returns 404, 403 and 409 like the read endpoint", async () => {
    const missing = toggleSetup();
    missing.prisma.conversation.findUnique.mockResolvedValue(null);
    expect((await missing.post({ enabled: false })).status).toBe(404);
    const stranger = toggleSetup();
    stranger.prisma.conversation.findUnique.mockResolvedValue({
      participants: [],
    });
    expect((await stranger.post({ enabled: false })).status).toBe(403);
    const revoked = toggleSetup(null, new Date(time));
    expect((await revoked.post({ enabled: false })).status).toBe(409);
  });

  it("still succeeds when queueing the backfill fails", async () => {
    const t = toggleSetup();
    t.enqueue.mockRejectedValue(new Error("redis down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await t.post({ enabled: true, language: "ta" })).status).toBe(200);
    spy.mockRestore();
  });
});

describe("queueing on send", () => {
  it("queues one job per active recipient with translation on, never the sender", async () => {
    const tx = {
      conversation: {
        findUnique: vi.fn().mockResolvedValue({
          status: "ACTIVE",
          participants: [
            { userId, revokedAt: null, translateTo: "zh" },
            { userId: otherId, revokedAt: null, translateTo: "es" },
            {
              userId: "0192f0c4-0000-7000-8000-00000000000c",
              revokedAt: new Date(time),
              translateTo: "hi",
            },
          ],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      message: {
        create: vi.fn().mockResolvedValue({
          id: messageId,
          chatId: conversationId,
          senderId: userId,
          type: "TEXT",
          content: "Hello",
          metadata: null,
          createdAt: new Date(time),
        }),
      },
    };
    const prisma = { $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const app = createApp({
      prisma: prisma as unknown as PrismaClient,
      apiKey: "test",
      verifyToken: vi
        .fn()
        .mockResolvedValue({ user_id: userId, role: "student", exp: 9999999999 }),
      enqueueTranslation: enqueue,
    });
    const res = await request(app)
      .post(`/chat/conversations/${conversationId}/messages`)
      .set("Authorization", "Bearer test")
      .send({ type: "TEXT", content: "Hello" });
    expect(res.status).toBe(201);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith([
      { conversationId, userId: otherId, language: "es", messageIds: [messageId] },
    ]);
  });
});

describe("translation job", () => {
  const job = { conversationId, userId, language: "es" as const };
  function processorSetup(translateTo: string | null = "es") {
    const prisma = {
      chatParticipant: {
        findFirst: vi.fn().mockResolvedValue(
          translateTo === undefined ? null : { translateTo },
        ),
      },
      message: {
        findMany: vi.fn().mockResolvedValue([
          { id: "m1", content: "Hello" },
          { id: "m2", content: "Hola" },
        ]),
      },
      translatedMessage: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    const translate = vi.fn().mockResolvedValue({ m1: "Hola", m2: "SAME" });
    const publish = vi.fn();
    const run = createTranslationProcessor({
      prisma: prisma as unknown as PrismaClient,
      translate,
      publish,
    });
    return { prisma, translate, publish, run };
  }

  it("stores translations (including SAME) and signals each one to the user", async () => {
    const t = processorSetup();
    expect(await t.run(job)).toBe(2);
    expect(t.translate).toHaveBeenCalledWith("es", { m1: "Hello", m2: "Hola" });
    expect(t.prisma.translatedMessage.createMany).toHaveBeenCalledWith({
      data: [
        { messageId: "m1", userId, content: "Hola" },
        { messageId: "m2", userId, content: "SAME" },
      ],
      skipDuplicates: true,
    });
    expect(t.publish).toHaveBeenCalledWith({
      messageId: "m1",
      conversationId,
      userId,
      translatedContent: "Hola",
    });
    expect(t.publish).toHaveBeenCalledTimes(2);
    // Only received, untranslated text messages are selected.
    expect(t.prisma.message.findMany.mock.calls[0]![0].where).toMatchObject({
      OR: [{ senderId: null }, { senderId: { not: userId } }],
      translations: { none: { userId } },
    });
  });

  it("restricts a per-message job to its message ids", async () => {
    const t = processorSetup();
    await t.run({ ...job, messageIds: ["m1"] });
    expect(t.prisma.message.findMany.mock.calls[0]![0].where.id).toEqual({
      in: ["m1"],
    });
  });

  it("does nothing when translation was turned off or the language changed", async () => {
    for (const translateTo of [null, "zh"]) {
      const t = processorSetup(translateTo);
      expect(await t.run(job)).toBe(0);
      expect(t.translate).not.toHaveBeenCalled();
    }
  });

  it("leaves messages the model omitted untranslated", async () => {
    const t = processorSetup();
    t.translate.mockResolvedValue({ m1: "Hola" });
    expect(await t.run(job)).toBe(1);
    expect(t.prisma.translatedMessage.createMany.mock.calls[0]![0].data).toEqual([
      { messageId: "m1", userId, content: "Hola" },
    ]);
  });

  it("lets model errors fail the job so the queue retries it", async () => {
    const t = processorSetup();
    t.translate.mockRejectedValue(new Error("llm down"));
    await expect(t.run(job)).rejects.toThrow("llm down");
    expect(t.prisma.translatedMessage.createMany).not.toHaveBeenCalled();
  });
});

it("names the target language and the SAME sentinel in the system prompt", () => {
  const prompt = systemPrompt("ta");
  expect(prompt).toContain("Tamil");
  expect(prompt).toContain('"SAME"');
});
