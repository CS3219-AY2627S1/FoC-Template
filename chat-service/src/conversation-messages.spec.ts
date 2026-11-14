/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Tested the team-specified message listing contract.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented or tested team-specified participant read positions in message history.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-09, Codex, model: GPT-6): Implemented or tested the team-specified system conversations.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or verified user-specified order message actor fields and toast filtering.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
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
      {
        userId,
        role: "REQUESTER",
        joinedAt: new Date(time),
        lastReadMessageId: null,
      },
      {
        userId: "0192f0c4-0000-7000-8000-00000000000b",
        role: "COURIER",
        lastReadMessageId: conversationId,
        joinedAt: new Date(time),
      },
    ],
    createdAt: new Date(time),
    updatedAt: new Date(time),
  };
  const findUnique = vi.fn().mockResolvedValue(row);
  const findMany = vi.fn().mockResolvedValue([]);
  const verifyToken = vi
    .fn()
    .mockResolvedValue({ user_id: userId, role: "student", exp: 9999999999 });
  const app = createApp({
    prisma: {
      conversation: { findUnique },
      message: { findMany },
    } as unknown as PrismaClient,
    apiKey: "test",
    verifyToken,
  });
  const get = (id = conversationId) =>
    request(app)
      .get(`/chat/conversations/${id}/messages`)
      .set("Authorization", "Bearer test");
  return { findMany, row, findUnique, verifyToken, app, get };
}
it("returns an empty final page and defaults to 20", async () => {
  const t = setup();
  const res = await t.get();
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    participants: t.row.participants.map((p) => ({ ...p, joinedAt: time })),
    data: [],
    pagination: { nextCursor: null, hasMore: false },
  });
  expect(t.findMany.mock.calls[0]![0]).toMatchObject({
    take: 21,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
});
it.each([null, { participants: [] }])(
  "denies unauthorized message access %j",
  async (row) => {
    const t = setup();
    t.findUnique.mockResolvedValue(row);
    expect((await t.get()).status).toBe(row === null ? 404 : 403);
    expect(t.findMany).not.toHaveBeenCalled();
  },
);
it("requires bearer auth and a valid UUID", async () => {
  const t = setup();
  expect(
    (await request(t.app).get(`/chat/conversations/${conversationId}/messages`))
      .status,
  ).toBe(401);
  expect((await t.get("bad")).status).toBe(400);
  expect(t.findUnique).not.toHaveBeenCalled();
});
it.each([
  { limit: "0" },
  { limit: "51" },
  { limit: "1.5" },
  { cursor: "bad" },
  { extra: "x" },
])("rejects invalid queries %j", async (query) => {
  const t = setup();
  expect((await t.get().query(query)).status).toBe(400);
  expect(t.findMany).not.toHaveBeenCalled();
});
it("maps system messages and emits a reusable last-row cursor", async () => {
  const t = setup();
  const row = {
    id: conversationId,
    chatId: conversationId,
    senderId: null,
    type: "SYSTEM",
    content: null,
    triggeredByUserId: null,
    createdAt: new Date(time),
    translations: [],
  };
  t.findMany.mockResolvedValue([row, row]);
  const res = await t.get().query({ limit: "1" });
  expect(res.body).toEqual({
    participants: t.row.participants.map((p) => ({ ...p, joinedAt: time })),
    data: [
      {
        messageId: conversationId,
        conversationId,
        senderId: null,
        type: "SYSTEM",
        content: null,
        triggeredByUserId: row.triggeredByUserId,
        createdAt: time,
        translatedContent: null,
      },
    ],
    pagination: {
      nextCursor: { createdAt: time, id: conversationId },
      hasMore: true,
    },
  });
  t.findMany.mockResolvedValue([row]);
  const cursor = Buffer.from(
    JSON.stringify(res.body.pagination.nextCursor),
  ).toString("base64");
  expect((await t.get().query({ cursor, limit: "1" })).body.pagination).toEqual(
    { nextCursor: null, hasMore: false },
  );
  expect(t.findMany.mock.calls[1]![0]).toMatchObject({
    where: {
      chatId: conversationId,
      OR: [
        { createdAt: { lt: new Date(time) } },
        { createdAt: new Date(time), id: { lt: conversationId } },
      ],
    },
  });
});
it("retains revoked participant access", async () => {
  const t = setup();
  Object.assign(t.row.participants[0]!, { revokedAt: new Date(time) });
  expect((await t.get()).status).toBe(200);
  expect(t.findUnique.mock.calls[0]![0]).toEqual({
    where: { conversationId },
    select: {
      participants: {
        select: {
          userId: true,
          role: true,
          joinedAt: true,
          lastReadMessageId: true,
          translateTo: true,
        },
      },
    },
  });
});
it("handles database errors", async () => {
  const t = setup();
  t.findMany.mockRejectedValue(new Error("unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await t.get()).status).toBe(500);
  } finally {
    log.mockRestore();
  }
});
// AI-generated (edited by <name>).
it("exposes each participant's translateTo in history", async () => {
  const t = setup();
  Object.assign(t.row.participants[0]!, { translateTo: "es" });
  const res = await t.get();
  expect(res.body.participants[0].translateTo).toBe("es");
});
// AI-generated (edited by <name>).
it("returns the requesting user's own translation, scoped by user id", async () => {
  const t = setup();
  t.findMany.mockResolvedValue([
    {
      id: conversationId,
      chatId: conversationId,
      senderId: "0192f0c4-0000-7000-8000-00000000000b",
      type: "TEXT",
      content: "Hello",
      metadata: null,
      createdAt: new Date(time),
      translations: [{ content: "Hola" }],
    },
  ]);
  const res = await t.get();
  expect(res.body.data[0].translatedContent).toBe("Hola");
  expect(t.findMany.mock.calls[0]![0].select.translations).toEqual({
    where: { userId },
    select: { content: true },
  });
});

// AI-generated
it("allows only the owner to read system conversation history", async () => {
  const t = setup();
  t.findUnique.mockResolvedValue({
    ...t.row,
    orderId: null,
    participants: [
      { userId, role: null, joinedAt: new Date(time), lastReadMessageId: null },
    ],
  });
  expect((await t.get()).status).toBe(200);
  t.verifyToken.mockResolvedValue({
    user_id: "outsider",
    role: "student",
    exp: 9999999999,
  });
  expect((await t.get()).status).toBe(403);
});
