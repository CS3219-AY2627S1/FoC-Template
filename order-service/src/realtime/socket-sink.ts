/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issues #6/#59 - applies order events to Socket.IO (room joins, one emit to the
 *        union of rooms, closing finished order rooms), and the worker -> API path over a
 *        plain Redis pub/sub channel with ioredis (George, 2026-10-20: "b, no need for
 *        dependency"). The API emits directly with io.to(...) after commit (George,
 *        2026-10-19); events relayed from the worker are applied with io.local on every
 *        replica, so the Redis adapter does not fan them out a second time. The channel
 *        name is by convention.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import type { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import {
  orderRoom,
  userRoom,
  type OrderEvent,
  type OrderEventPublisher,
} from './order-events.js';

export const ORDER_EVENTS_CHANNEL = 'order-events';

/** Called with each event at the moment it is broadcast (NFR5.1.1 measures to here). */
export type BroadcastHook = (event: OrderEvent, at: number) => void;

/** Applies events to this Socket.IO server. `local` skips the adapter fan-out. */
export function createSocketSink(
  io: Server,
  {
    local = false,
    onBroadcast,
  }: { local?: boolean; onBroadcast?: BroadcastHook } = {},
): OrderEventPublisher {
  const target = () => (local ? io.local : io);
  return {
    async publish(events) {
      for (const event of events) {
        for (const { userId, orderId } of event.joins ?? []) {
          target().in(userRoom(userId)).socketsJoin(orderRoom(orderId));
        }
        // One emit to the union of rooms: a socket in several of them gets it once.
        target().to(event.rooms).emit(event.name, event.payload);
        onBroadcast?.(event, Date.now());
        if (event.closeOrderRoom) {
          const room = orderRoom(event.closeOrderRoom);
          target().in(room).socketsLeave(room);
        }
      }
    },
  };
}

/** Worker side: hands events to the API processes over Redis pub/sub. */
export function createRedisEventPublisher(redis: Redis): OrderEventPublisher {
  return {
    async publish(events) {
      await redis.publish(ORDER_EVENTS_CHANNEL, JSON.stringify(events));
    },
  };
}

/**
 * API side: applies events published by the worker. `subscriber` must be a connection
 * dedicated to subscribing (Redis forbids other commands on it).
 */
export async function relayWorkerEvents(
  subscriber: Redis,
  sink: OrderEventPublisher,
  log: (message: string) => void = console.error,
): Promise<void> {
  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== ORDER_EVENTS_CHANNEL) return;
    let events: OrderEvent[];
    try {
      events = JSON.parse(message) as OrderEvent[];
    } catch {
      log('Ignored an unparseable order-events message.');
      return;
    }
    sink.publish(events).catch((err: unknown) => {
      log(
        `Relaying worker events failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  });
  await subscriber.subscribe(ORDER_EVENTS_CHANNEL);
}
