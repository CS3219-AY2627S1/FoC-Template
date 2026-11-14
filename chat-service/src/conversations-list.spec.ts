/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Added tests for the team-specified conversation listing and reused authentication.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-09, Codex, model: GPT-6): Implemented or tested the team-specified system conversations.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Removed image/video message types as instructed by the user.
 * Author review: tng wen xi
 */

import request from "supertest";
import { createApp } from "./app.js";
import type { PrismaClient } from "./db/prisma.js";
const userId = "0192f0c4-0000-7000-8000-00000000000a";
const id = (n: number) =>
  `0192f0c4-0000-7000-8000-${String(n).padStart(12, "0")}`;
const time = "2026-11-08T00:00:00.000Z";
const row = (n: number) => ({
  conversationId: id(n),
  orderId: id(n + 100),
  updatedAt: new Date(time),
  participants: [
    { userId, lastReadMessageId: null, revokedAt: new Date(time) },
  ],
  messages: [],
});
function setup(rows: any[] = []) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const count = vi.fn().mockResolvedValue(0);
  const findFirstOrThrow = vi.fn();
  const verifyToken = vi
    .fn()
    .mockResolvedValue({ user_id: userId, role: "student", exp: 9999999999 });
  const app = createApp({
    prisma: {
      conversation: { findMany },
      message: { count, findFirstOrThrow },
    } as unknown as PrismaClient,
    apiKey: "test",
    verifyToken,
  });
  const get = (query: object = {}) =>
    request(app)
      .get("/chat/conversations")
      .set("Authorization", "Bearer test")
      .query(query);
  return { app, get, findMany, count, findFirstOrThrow, verifyToken };
}
it("requires a validated user, ignoring a supplied service key", async () => {
  const t = setup();
  const res = await request(t.app)
    .get("/chat/conversations")
    .set("X-Service-Key", "test");
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ message: "Unauthorized", code: "UNAUTHORIZED" });
  expect(t.findMany).not.toHaveBeenCalled();
  t.verifyToken.mockRejectedValueOnce(new Error("expired"));
  expect((await t.get()).status).toBe(401);
  expect(t.findMany).not.toHaveBeenCalled();
});
it("returns an empty final page and defaults to 20 conversations", async () => {
  const t = setup();
  expect((await t.get()).body).toEqual({
    conversations: [],
    nextCursor: null,
    hasMore: false,
  });
  expect(t.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      take: 21,
      where: { participants: { some: { userId } } },
      orderBy: [{ updatedAt: "desc" }, { conversationId: "desc" }],
    }),
  );
});
it("includes revoked memberships and represents an empty chat with null lastMessage", async () => {
  const t = setup([row(1)]);
  const res = await t.get();
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    conversations: [
      {
        id: id(1),
        orderId: id(101),
        updatedAt: time,
        lastMessage: null,
        unreadCount: 0,
      },
    ],
    nextCursor: null,
    hasMore: false,
  });
  expect(t.count.mock.calls[0]![0]).toEqual({
    where: {
      chatId: id(1),
      AND: [{ OR: [{ senderId: null }, { senderId: { not: userId } }] }],
    },
  });
  expect(t.findFirstOrThrow).not.toHaveBeenCalled();
});
it("applies both filters to the validated participant and conversation", async () => {
  const t = setup();
  await t.get({ status: "archived", role: "courier", limit: 50 });
  expect(t.findMany.mock.calls[0]![0]).toMatchObject({
    take: 51,
    where: {
      participants: {
        some: {
          userId,
          OR: [
            { role: "COURIER" },
            { role: null, conversation: { orderId: null } },
          ],
        },
      },
      status: "ARCHIVED",
    },
  });
  await t.get({ status: "active", role: "requester" });
  expect(t.findMany.mock.calls[1]![0]).toMatchObject({
    where: {
      participants: {
        some: {
          userId,
          OR: [
            { role: "REQUESTER" },
            { role: null, conversation: { orderId: null } },
          ],
        },
      },
      status: "ACTIVE",
    },
  });
});
it("uses a lookahead and emits the last returned row as a reusable cursor", async () => {
  const t = setup([row(3), row(2), row(1)]);
  const res = await t.get({ limit: 2 });
  expect(res.body.conversations.map((c: any) => c.id)).toEqual([id(3), id(2)]);
  expect(res.body.nextCursor).toEqual({ updatedAt: time, id: id(2) });
  expect(res.body.hasMore).toBe(true);
  expect(t.count).toHaveBeenCalledTimes(2);
  const cursor = Buffer.from(JSON.stringify(res.body.nextCursor)).toString(
    "base64",
  );
  await t.get({ limit: 2, cursor });
  expect(t.findMany.mock.calls[1]![0].where.OR).toEqual([
    { updatedAt: { lt: new Date(time) } },
    { updatedAt: new Date(time), conversationId: { lt: id(2) } },
  ]);
});
it.each(["TEXT", "SYSTEM"])(
  "returns %s last messages and uses the timestamp/id read boundary",
  async (type) => {
    const r: any = row(1);
    r.participants[0].lastReadMessageId = id(20);
    r.messages = [{ content: null, type, createdAt: new Date(time) }];
    const t = setup([r]);
    t.findFirstOrThrow.mockResolvedValue({
      createdAt: new Date(time),
      id: id(20),
    });
    t.count.mockResolvedValue(3);
    const res = await t.get();
    expect(res.body.conversations[0]).toMatchObject({
      lastMessage: { content: null, type, createdAt: time },
      unreadCount: 3,
    });
    expect(t.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: id(20), chatId: id(1) },
      select: { createdAt: true, id: true },
    });
    expect(t.count.mock.calls[0]![0].where.AND[1]).toEqual({
      OR: [
        { createdAt: { gt: new Date(time) } },
        { createdAt: new Date(time), id: { gt: id(20) } },
      ],
    });
    expect(t.findMany.mock.calls[0]![0].include.messages).toEqual({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1,
    });
  },
);
it.each([
  { limit: 0 },
  { limit: 51 },
  { limit: -1 },
  { limit: 1.5 },
  { limit: "abc" },
  { limit: "" },
  { limit: ["1", "2"] },
  { status: "bad" },
  { role: "bad" },
  { cursor: "bad" },
  { cursor: "" },
  { cursor: Buffer.from("{}").toString("base64") },
  {
    cursor: Buffer.from(
      JSON.stringify({ updatedAt: "bad", id: id(1) }),
    ).toString("base64"),
  },
  {
    cursor: Buffer.from(
      JSON.stringify({ updatedAt: time, id: "bad" }),
    ).toString("base64"),
  },
  { userId: id(2) },
])("rejects invalid query %j before accessing conversations", async (query) => {
  const t = setup();
  const res = await t.get(query);
  expect(res.status).toBe(400);
  expect(res.body.code).toBe("VALIDATION_ERROR");
  expect(t.findMany).not.toHaveBeenCalled();
});
it("returns a JSON error when the database fails", async () => {
  const t = setup();
  t.findMany.mockRejectedValueOnce(new Error("database unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const res = await t.get();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Internal server error." });
  } finally {
    log.mockRestore();
  }
});
