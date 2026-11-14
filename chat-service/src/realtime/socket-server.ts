/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Implemented the team-specified message sending and realtime delivery.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented team-specified chat room subscriptions and realtime frontend updates.
 * Author review: tng wen xi
 * Scope (2026-11-09, Codex, model: GPT-6): Implemented or tested the team-specified system conversations.
 * Author review: tng wen xi
 */
import { STATUS_CODES } from "node:http";
import { z } from "zod";
import type { PrismaClient } from "../db/prisma.js";
import type { Server as HttpServer } from "node:http";
import { Server, type ServerOptions } from "socket.io";
import type {
  TokenVerifier,
  VerifiedToken,
} from "../middleware/authenticate.js";
// Connection and JWT lifecycle follow order-service/src/realtime/socket-server.ts.
export function createSocketServer(
  httpServer: HttpServer,
  {
    verifyToken,
    prisma,
    options = {},
  }: {
    verifyToken: TokenVerifier;
    prisma?: PrismaClient;
    options?: Partial<ServerOptions>;
  },
): Server {
  const io = new Server(httpServer, {
    path: "/chat-socket.io",
    transports: ["websocket"],
    ...options,
  });
  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== "string" || token === "") {
      next(new Error("unauthorized"));
      return;
    }
    try {
      socket.data.user = await verifyToken(token);
      if (socket.data.user.user_id === "SYSTEM")
        throw new Error("unauthorized");
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
  io.on("connection", async (socket) => {
    const { user_id: userId, exp } = socket.data.user as VerifiedToken;
    const expiry = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, exp * 1000 - Date.now()),
    );
    socket.on("disconnect", () => clearTimeout(expiry));
    await socket.join(`user:${userId}`);
    socket.emit("ready");
    // AI-generated
    // Preserve join/leave order when membership lookups are still in flight.
    let roomOperations = Promise.resolve();
    for (const event of ["chat:join", "chat:leave"] as const) {
      socket.on(
        event,
        (conversationId: unknown, ack?: (response: unknown) => void) => {
          roomOperations = roomOperations
            .then(async () => {
              const fail = (code: number) =>
                ack?.({
                  success: false,
                  error: {
                    code,
                    message:
                      code === 500
                        ? "Internal server error."
                        : STATUS_CODES[code],
                  },
                });
              if (typeof ack !== "function") ack = undefined;
              if (!z.uuid().safeParse(conversationId).success) {
                fail(400);
                return;
              }
              const id = conversationId as string;
              try {
                // Leaving always permits cleanup, even if access was revoked since joining.
                if (event === "chat:join") {
                  if (!prisma)
                    throw new Error("Participant lookup unavailable");
                  const conversation = await prisma.conversation.findUnique({
                    where: { conversationId: id },
                    select: {
                      participants: {
                        where: { userId },
                        select: { revokedAt: true },
                      },
                    },
                  });
                  if (!conversation) {
                    fail(404);
                    return;
                  }
                  const member = conversation.participants[0];
                  if (!member) {
                    fail(403);
                    return;
                  }
                  if (member.revokedAt !== null) {
                    fail(409);
                    return;
                  }
                  if (!socket.connected) return;
                  await socket.join(`chat:${id}`);
                } else await socket.leave(`chat:${id}`);
                ack?.({ success: true, conversationId: id });
              } catch (error) {
                console.error(error);
                fail(500);
              }
            })
            .catch((error) => console.error(error));
        },
      );
    }
  });
  return io;
}
