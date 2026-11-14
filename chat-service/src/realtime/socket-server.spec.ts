/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Verified socket authentication, expiry, room isolation and union broadcasts.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Verified read receipt room delivery and reader exclusion.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Tested on-demand chat rooms and acknowledgements.
 * Author review: tng wen xi
 * Scope (2026-11-09, Codex, model: GPT-6): Implemented or tested the team-specified system conversations.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or verified user-specified order message actor fields and toast filtering.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */
import type { PrismaClient } from "../db/prisma.js";
import { createServer } from "node:http";
import { io as connect, type Socket } from "socket.io-client";
import { createSocketServer } from "./socket-server.js";
import {
  createReadPublisher,
  createMessagePublisher,
  type SentMessage,
} from "./messages.js";
import type { TokenVerifier } from "../middleware/authenticate.js";
async function setup(
  verifyToken: TokenVerifier = async (token) => {
    if (token === "bad") throw new Error("invalid");
    return {
      user_id: token,
      role: "student",
      exp: Math.floor(Date.now() / 1000) + 60,
    };
  },
  prisma?: PrismaClient,
) {
  const http = createServer();
  const io = createSocketServer(http, { verifyToken, prisma });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const clients: Socket[] = [];
  const client = (token?: string) => {
    const socket = connect(`http://127.0.0.1:${address.port}`, {
      path: "/chat-socket.io",
      transports: ["websocket"],
      auth: token === undefined ? {} : { token },
      reconnection: false,
      autoConnect: false,
    });
    clients.push(socket);
    return socket;
  };
  const ready = (socket: Socket) =>
    new Promise<void>((resolve, reject) => {
      socket.once("ready", resolve);
      socket.once("connect_error", reject);
      socket.connect();
    });
  const close = async () => {
    clients.forEach((c) => c.disconnect());
    await io.close();
  };
  return { io, client, ready, close };
}
it.each([undefined, "", "bad", "SYSTEM"])(
  "rejects invalid handshake token %j",
  async (token) => {
    const t = await setup();
    try {
      const client = t.client(token);
      const error = new Promise<Error>((resolve) =>
        client.once("connect_error", resolve),
      );
      client.connect();
      expect((await error).message).toBe("unauthorized");
      expect(t.io.sockets.sockets.size).toBe(0);
    } finally {
      await t.close();
    }
  },
);
it("joins only the verified user's room and broadcasts once to the union of target rooms", async () => {
  const t = await setup();
  try {
    const a = t.client("a"),
      b = t.client("b");
    await Promise.all([t.ready(a), t.ready(b)]);
    const serverA = t.io.sockets.sockets.get(a.id!)!;
    expect([...serverA.rooms]).toEqual([a.id, "user:a"]);
    expect(t.io.sockets.sockets.get(b.id!)!.rooms.has("user:a")).toBe(false);
    // Direct join isolates union-broadcast behavior from the subscription tests below.
    await serverA.join("chat:c");
    let received = 0;
    a.on("message:sent", () => {
      received++;
    });
    const message: SentMessage = {
      messageId: "m",
      conversationId: "c",
      senderId: "a",
      type: "TEXT",
      content: "hello",
      triggeredByUserId: null,
      createdAt: new Date().toISOString(),
    };
    const gotA = new Promise<unknown>((resolve) =>
      a.once("message:sent", resolve),
    );
    const gotB = new Promise<unknown>((resolve) =>
      b.once("message:sent", resolve),
    );
    createMessagePublisher(t.io)(message, ["a", "b"]);
    expect(await gotA).toEqual(message);
    expect(await gotB).toEqual(message);
    // A subsequent acknowledged event fences the earlier delivery on this socket.
    t.io.to("user:a").emit("fence");
    await new Promise<void>((resolve) => a.once("fence", resolve));
    expect(received).toBe(1);
  } finally {
    await t.close();
  }
});
it("disconnects authenticated sockets at token expiry", async () => {
  const t = await setup(async () => ({
    user_id: "a",
    role: "student",
    exp: (Date.now() + 150) / 1000,
  }));
  try {
    const client = t.client("valid");
    await t.ready(client);
    const reason = await new Promise<string>((resolve) =>
      client.once("disconnect", resolve),
    );
    expect(reason).toBe("io server disconnect");
  } finally {
    await t.close();
  }
});

// AI-generated
it("delivers read receipts only to other sockets in the conversation room", async () => {
  const t = await setup();
  try {
    const reader = t.client("reader");
    const recipient = t.client("recipient");
    const outsider = t.client("outsider");
    await Promise.all([t.ready(reader), t.ready(recipient), t.ready(outsider)]);
    await t.io.in("user:reader").socketsJoin("chat:conversation");
    await t.io.in("user:recipient").socketsJoin("chat:conversation");
    const readerEvent = vi.fn();
    const outsiderEvent = vi.fn();
    reader.on("messsage:read", readerEvent);
    outsider.on("messsage:read", outsiderEvent);
    const received = new Promise((resolve) =>
      recipient.once("messsage:read", resolve),
    );
    const receipt = {
      conversationId: "conversation",
      userId: "reader",
      lastReadMessageId: "message",
    };
    createReadPublisher(t.io)(receipt);
    expect(await received).toEqual(receipt);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(readerEvent).not.toHaveBeenCalled();
    expect(outsiderEvent).not.toHaveBeenCalled();
  } finally {
    await t.close();
  }
});

// AI-generated
it("joins authorized conversations on demand, receives broadcasts, and leaves with acknowledgements", async () => {
  const id = "0192f0c4-0000-7000-8000-000000000001";
  const findUnique = vi
    .fn()
    .mockResolvedValue({ participants: [{ revokedAt: null }] });
  const t = await setup(undefined, {
    conversation: { findUnique },
  } as unknown as PrismaClient);
  try {
    const client = t.client("member");
    await t.ready(client);
    const server = t.io.sockets.sockets.get(client.id!)!;
    expect(server.rooms.has(`chat:${id}`)).toBe(false);
    expect(await client.emitWithAck("chat:join", id)).toEqual({
      success: true,
      conversationId: id,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { conversationId: id },
      select: {
        participants: {
          where: { userId: "member" },
          select: { revokedAt: true },
        },
      },
    });
    const received = new Promise((resolve) =>
      client.once("message:sent", resolve),
    );
    const message = {
      messageId: "m",
      conversationId: id,
      senderId: "other",
      type: "TEXT" as const,
      content: "Live message",
      triggeredByUserId: null,
      createdAt: new Date().toISOString(),
    };
    createMessagePublisher(t.io)(message, []);
    expect(await received).toEqual(message);
    expect(await client.emitWithAck("chat:leave", id)).toEqual({
      success: true,
      conversationId: id,
    });
    expect(server.rooms.has(`chat:${id}`)).toBe(false);
  } finally {
    await t.close();
  }
});
it.each([
  ["invalid", null, 400, "Bad Request"],
  ["0192f0c4-0000-7000-8000-000000000001", null, 404, "Not Found"],
  [
    "0192f0c4-0000-7000-8000-000000000001",
    { participants: [] },
    403,
    "Forbidden",
  ],
  [
    "0192f0c4-0000-7000-8000-000000000001",
    { participants: [{ revokedAt: new Date() }] },
    409,
    "Conflict",
  ],
])(
  "rejects inaccessible room %s with HTTP error semantics",
  async (id, row, code, message) => {
    const t = await setup(undefined, {
      conversation: { findUnique: vi.fn().mockResolvedValue(row) },
    } as unknown as PrismaClient);
    try {
      const client = t.client("member");
      await t.ready(client);
      expect(await client.emitWithAck("chat:join", id)).toEqual({
        success: false,
        error: { code, message },
      });
      expect(
        t.io.sockets.sockets.get(client.id!)!.rooms.has(`chat:${id}`),
      ).toBe(false);
    } finally {
      await t.close();
    }
  },
);
