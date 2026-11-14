/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issues #6/#59 - the Socket.IO server in order-service, per George's decisions
 *        (2026-10-19/20): the JWT arrives in the handshake `auth` payload and is verified
 *        in io.use() (failure -> connect_error "unauthorized"); the server disconnects the
 *        socket at the token's exp; on connect the server joins user:{id} and the
 *        order:{id} rooms of the user's active orders (from the DB; clients never name
 *        rooms); `listing:subscribe` / `listing:unsubscribe` opt in to the open-request
 *        feed. Websocket transport only. Tokens are checked with Wen Xi's JWKS verifier
 *        (the REST middleware's check), so any failure is "unauthorized". The
 *        active-status set is by convention.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import type { Server as HttpServer } from 'node:http';
import { Server, type ServerOptions } from 'socket.io';
import type {
  TokenVerifier,
  VerifiedToken,
} from '../middleware/authenticate.js';
import type { PrismaClient } from '../db/prisma.js';
import type { RequestStatus } from '../generated/prisma/client.js';
import { LISTING_ROOM, orderRoom, userRoom } from './order-events.js';

/** Statuses in which an order is still live for its requester and courier. */
const ACTIVE_STATUSES: RequestStatus[] = [
  'open',
  'accepted',
  'picked_up',
  'delivered',
];

interface SocketDeps {
  prisma: PrismaClient;
  verifyToken: TokenVerifier;
  options?: Partial<ServerOptions>;
  clock?: () => number;
  log?: (message: string) => void;
}

export function createSocketServer(
  httpServer: HttpServer,
  {
    prisma,
    verifyToken,
    options = {},
    clock = Date.now,
    log = console.error,
  }: SocketDeps,
): Server {
  const io = new Server(httpServer, { transports: ['websocket'], ...options });

  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token === '') {
      next(new Error('unauthorized'));
      return;
    }
    try {
      socket.data.user = await verifyToken(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const { user_id: userId, exp } = socket.data.user as VerifiedToken;

    // Disconnect at the token's expiry; the client reconnects with a fresh token.
    const expiry = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, exp * 1000 - clock()),
    );
    socket.on('disconnect', () => clearTimeout(expiry));

    socket.on('listing:subscribe', () => void socket.join(LISTING_ROOM));
    socket.on('listing:unsubscribe', () => void socket.leave(LISTING_ROOM));

    await socket.join(userRoom(userId));
    try {
      const active = await prisma.orderRequest.findMany({
        where: {
          status: { in: ACTIVE_STATUSES },
          OR: [{ requesterId: userId }, { courierId: userId }],
        },
        select: { id: true },
      });
      await socket.join(active.map((o) => orderRoom(o.id)));
    } catch (err) {
      // The user room still works; REST remains the source of truth.
      log(
        `Could not join order rooms for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    socket.emit('ready'); // rooms are in place
  });

  return io;
}
