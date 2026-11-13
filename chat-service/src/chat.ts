// AI-assisted (Claude), reviewed and tested by Maliha
// AI-assisted (Claude Opus 5.5), 2026-11-12: closesAt in the join reply; see ui/ai-usage/usage-log.md, entry 003
// Socket.IO side of the chat: join, send, read receipts.
//
// Client → server (each takes an ack callback):
//   chat:join  { orderId }        → { messages, canSend, closesAt, me, other } | { error }
//   chat:send  { orderId, text }  → { message, masked } | { error }
//   chat:read  { orderId }
// Server → room:
//   chat:message  Message
//   chat:read     { orderId, readerId }
import type { Server, Socket } from 'socket.io';
import { verifyToken, type AuthUser } from './auth';
import * as db from './db';
import { filterMessage } from './filter';
import { findMyOrder, OrderServiceDown, type Scope } from './orders';
import { chatAccess, closesAt } from './rules';

const MAX_LENGTH = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ack = (reply: object) => void;

type SocketData = {
  user: AuthUser;
  // which order-service scope each joined order was found in
  scopes: Record<string, Scope>;
};

const room = (orderId: string) => `order:${orderId}`;

// Error codes the UI turns into messages
type ChatError = 'invalid-input' | 'forbidden' | 'not-started' | 'closed' | 'blocked' | 'unavailable';

export function setupChat(io: Server) {
  // every socket needs a valid login token
  io.use((socket, next) => {
    const user = verifyToken(socket.handshake.auth?.token);
    if (!user) return next(new Error('unauthorized'));
    socket.data = { user, scopes: {} } satisfies SocketData;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData;
    const me = data.user;

    // Fresh order from order-service each time, since status changes mid-chat
    async function loadChat(orderId: unknown) {
      if (typeof orderId !== 'string' || !UUID.test(orderId)) return { error: 'invalid-input' as const };
      const found = await findMyOrder(orderId, me.token, data.scopes[orderId]);
      if (!found) return { error: 'forbidden' as const };
      data.scopes[orderId] = found.scope;

      const { order } = found;
      const access = chatAccess(order);
      if (!order.courierId) return { error: 'not-started' as const };
      if (!access.canRead) return { error: 'closed' as const };

      await db.saveChat(order);
      return { order, access };
    }

    // wraps a handler so a bad payload or a down service always gets an answer
    const handle = (fn: (payload: Record<string, unknown>) => Promise<object>) =>
      (payload: unknown, ack?: Ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        const body = typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : {};
        fn(body).then(reply).catch((err) => {
          if (!(err instanceof OrderServiceDown)) console.error('[chat]', err);
          reply({ error: 'unavailable' satisfies ChatError });
        });
      };

    socket.on('chat:join', handle(async ({ orderId }) => {
      const chat = await loadChat(orderId);
      if ('error' in chat) return chat;
      const { order, access } = chat;

      await socket.join(room(order.id));
      // opening the chat counts as reading it
      if (await db.markRead(order.id, me.id)) {
        socket.to(room(order.id)).emit('chat:read', { orderId: order.id, readerId: me.id });
      }

      const isRequester = order.requesterId === me.id;
      return {
        messages: await db.getMessages(order.id),
        canSend: access.canSend,
        // set once the errand ends, so the UI can say when the chat closes
        closesAt: closesAt(order),
        me: me.id,
        other: isRequester ? order.courierName : order.requesterName,
      };
    }));

    socket.on('chat:send', handle(async ({ orderId, text }) => {
      if (typeof orderId !== 'string' || !socket.rooms.has(room(orderId))) return { error: 'invalid-input' };
      const body = typeof text === 'string' ? text.trim() : '';
      if (!body || body.length > MAX_LENGTH) return { error: 'invalid-input' };

      const chat = await loadChat(orderId);
      if ('error' in chat) return chat;
      if (!chat.access.canSend) return { error: 'closed' };

      const { order } = chat;
      const userName = (order.requesterId === me.id ? order.requesterName : order.courierName) ?? 'Unknown';
      const result = filterMessage(body);

      if (result.action !== 'ok') {
        await db.addFlag({ orderId, userId: me.id, userName, originalText: body, action: result.action });
      }
      if (result.action === 'blocked') return { error: 'blocked' };

      const message = await db.addMessage(orderId, me.id, result.text);
      io.to(room(orderId)).emit('chat:message', message);
      return { message, masked: result.action === 'masked' };
    }));

    // the open chat got a new message while on screen
    socket.on('chat:read', handle(async ({ orderId }) => {
      if (typeof orderId !== 'string' || !socket.rooms.has(room(orderId))) return {};
      if (await db.markRead(orderId, me.id)) {
        socket.to(room(orderId)).emit('chat:read', { orderId, readerId: me.id });
      }
      return {};
    }));

    socket.on('chat:leave', ({ orderId }: { orderId?: string } = {}) => {
      if (typeof orderId === 'string') socket.leave(room(orderId));
    });
  });
}