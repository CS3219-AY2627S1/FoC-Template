/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #6 - unit tests for the worker -> API Redis pub/sub path with fake Redis
 *        connections (no Redis in the test environment).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';
import type { OrderEvent } from './order-events.js';
import {
  createRedisEventPublisher,
  ORDER_EVENTS_CHANNEL,
  relayWorkerEvents,
} from './socket-sink.js';

const event: OrderEvent = {
  name: 'order:expired',
  rooms: ['order:o-1'],
  payload: { orderId: 'o-1', status: 'expired', version: 3, occurredAt: 'x' },
};

describe('worker -> API over Redis pub/sub', () => {
  it('the worker publishes the batch as JSON on the order-events channel', async () => {
    const publish = vi.fn(async () => 1);
    await createRedisEventPublisher({ publish } as unknown as Redis).publish([
      event,
    ]);
    expect(publish).toHaveBeenCalledWith(
      ORDER_EVENTS_CHANNEL,
      JSON.stringify([event]),
    );
  });

  it('the API subscribes and hands each batch to the sink', async () => {
    const subscriber = Object.assign(new EventEmitter(), {
      subscribe: vi.fn(async () => 1),
    });
    const sink = { publish: vi.fn(async () => {}) };
    await relayWorkerEvents(subscriber as unknown as Redis, sink);

    expect(subscriber.subscribe).toHaveBeenCalledWith(ORDER_EVENTS_CHANNEL);
    subscriber.emit('message', ORDER_EVENTS_CHANNEL, JSON.stringify([event]));
    subscriber.emit('message', 'some-other-channel', JSON.stringify([event]));
    expect(sink.publish).toHaveBeenCalledTimes(1);
    expect(sink.publish).toHaveBeenCalledWith([event]);
  });

  it('ignores a malformed message', async () => {
    const subscriber = Object.assign(new EventEmitter(), {
      subscribe: vi.fn(async () => 1),
    });
    const sink = { publish: vi.fn(async () => {}) };
    const log = vi.fn();
    await relayWorkerEvents(subscriber as unknown as Redis, sink, log);

    subscriber.emit('message', ORDER_EVENTS_CHANNEL, '{not json');
    expect(sink.publish).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });
});
