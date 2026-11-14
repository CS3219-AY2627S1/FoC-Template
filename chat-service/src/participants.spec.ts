/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Tested the team-specified participant endpoint.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Tested requester and non-revoked courier limits.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Removed the conversation-ID participant endpoint per user instruction.
 * Author review: tng wen xi
 */
import request from "supertest";
import { createApp } from "./app.js";
import type { PrismaClient } from "./db/prisma.js";
const id = "0192f0c4-0000-7000-8000-000000000001";
const userId = "0192f0c4-0000-7000-8000-00000000000a";
function setup() {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findUnique = vi.fn().mockResolvedValue({ participants: [] });
  const create = vi.fn().mockImplementation(async ({ data }) => ({
    ...data,
    id,
    joinedAt: new Date("2026-11-08T00:00:00Z"),
  }));
  const tx = {
    conversation: {
      updateMany,
      findUnique: (args: { where: { orderId?: string } }) =>
        args.where.orderId ? Promise.resolve({ conversationId: id }) : findUnique(args),
    },
    chatParticipant: { create },
  };
  const transaction = vi.fn().mockImplementation(async (fn) => fn(tx));
  const app = createApp({
    prisma: { $transaction: transaction } as unknown as PrismaClient,
    apiKey: "test",
    verifyToken: async (token) => {
      if (token !== "valid") throw new Error("invalid");
      return { user_id: userId, role: "student", exp: 9999999999 };
    },
  });
  const post = (
    body: object = { userId, role: "COURIER" },
    orderId = id,
  ) =>
    request(app)
      .post(`/chat/orders/${orderId}/participants`)
      .set("X-Service-Key", "test")
      .send(body);
  return { app, post, updateMany, findUnique, create, transaction };
}
it.each(["COURIER", "REQUESTER"])("adds %s with key alone", async (role) => {
  const t = setup();
  const response = await t.post({ userId, role });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    conversationParticipantId: id,
    conversationId: id,
    userId,
    joinedAt: "2026-11-08T00:00:00.000Z",
    role,
  });
  expect(t.create).toHaveBeenCalledWith({ data: { chatId: id, userId, role } });
});
it.each(["existing", "revoked", "archived", "missing"])(
  "rejects %s without inserting",
  async (scenario) => {
    const t = setup();
    if (scenario === "missing") {
      t.updateMany.mockResolvedValue({ count: 0 });
      t.findUnique.mockResolvedValue(null);
    } else if (scenario === "archived")
      t.updateMany.mockResolvedValue({ count: 0 });
    else
      t.findUnique.mockResolvedValue({
        participants: [
          { id: userId, revokedAt: scenario === "revoked" ? new Date() : null },
        ],
      });
    expect((await t.post()).status).toBe(scenario === "missing" ? 404 : 409);
    expect(t.create).not.toHaveBeenCalled();
  },
);
it.each([
  {},
  { userId, role: "ADMIN" },
  { userId: "courier_123", role: "COURIER" },
  { userId },
  { userId: null, role: "REQUESTER" },
])("rejects invalid body %j", async (body) => {
  const t = setup();
  expect((await t.post(body)).status).toBe(400);
  expect(t.transaction).not.toHaveBeenCalled();
});
it("rejects invalid order ID", async () => {
  const t = setup();
  expect((await t.post(undefined, "bad")).status).toBe(400);
  expect(t.transaction).not.toHaveBeenCalled();
});
it.each([
  [undefined, undefined, 401],
  [undefined, "valid", 403],
  [undefined, "invalid", 401],
  ["wrong", "valid", 401],
])("checks key %s and token %s", async (key, token, status) => {
  const t = setup();
  const req = request(t.app).post(`/chat/orders/${id}/participants`);
  if (key) req.set("X-Service-Key", String(key));
  if (token) req.set("Authorization", `Bearer ${token}`);
  expect((await req.send({ userId, role: "COURIER" })).status).toBe(status);
  expect(t.transaction).not.toHaveBeenCalled();
});
it("returns 500 on persistence failure", async () => {
  const t = setup();
  t.create.mockRejectedValue(new Error("database failure"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await t.post()).status).toBe(500);
  } finally {
    log.mockRestore();
  }
});

// AI-generated
it.each([
  ["REQUESTER", "REQUESTER", null, 409],
  ["REQUESTER", "REQUESTER", new Date(), 409],
  ["COURIER", "COURIER", null, 409],
  ["COURIER", "COURIER", new Date(), 200],
  ["COURIER", "REQUESTER", null, 200],
  ["REQUESTER", "COURIER", null, 200],
])(
  "adding %s with existing %s revokedAt=%s returns %s",
  async (role, existingRole, revokedAt, status) => {
    const t = setup();
    t.findUnique.mockImplementation(async ({ select }) => {
      const where = select.participants.where;
      expect(where).toEqual({
        OR: [
          { userId },
          role === "REQUESTER"
            ? { role: "REQUESTER" }
            : { role: "COURIER", revokedAt: null },
        ],
      });
      // Apply the selected predicates to a different user's existing membership.
      const existing = { id, userId: id, role: existingRole, revokedAt };
      const matches = where.OR.some(
        (predicate: { userId?: string; role?: string; revokedAt?: null }) =>
          (predicate.userId === undefined ||
            predicate.userId === existing.userId) &&
          (predicate.role === undefined || predicate.role === existing.role) &&
          (!("revokedAt" in predicate) ||
            predicate.revokedAt === existing.revokedAt),
      );
      return { participants: matches ? [existing] : [] };
    });
    expect((await t.post({ userId, role })).status).toBe(status);
    expect(t.create).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
  },
);
