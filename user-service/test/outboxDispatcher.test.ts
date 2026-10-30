import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { CREDIT_USER_QUEUE } from '@foc/messaging';
import { dispatchPending, startDispatcher } from '../src/events/outboxDispatcher';
import type { OutboxStorePort } from '../src/events/outboxDispatcher';
import type { UnpublishedOutboxRow } from '../src/events/outboxStore';

function row(overrides: Partial<UnpublishedOutboxRow> = {}): UnpublishedOutboxRow {
  return {
    eventId: '11111111-1111-4111-8111-111111111111',
    queue: CREDIT_USER_QUEUE,
    body: JSON.stringify({
      type: 'user.created',
      eventId: '11111111-1111-4111-8111-111111111111',
      occurredAt: '2026-10-21T00:00:00.000Z',
      userId: '550e8400-e29b-41d4-a716-446655440000',
    }),
    ...overrides,
  };
}

function store(rows: UnpublishedOutboxRow[]): OutboxStorePort & {
  published: string[];
  failures: { eventId: string; message: string }[];
} {
  const published: string[] = [];
  const failures: { eventId: string; message: string }[] = [];
  return {
    published,
    failures,
    findUnpublished: async () => rows,
    markPublished: async (eventId) => {
      published.push(eventId);
    },
    recordFailure: async (eventId, message) => {
      failures.push({ eventId, message });
    },
  };
}

describe('dispatchPending', () => {
  it('publishes with the stored eventId and marks published only after confirm', async () => {
    const outbox = store([row()]);
    const publishToQueue = mock.fn(async () => true);

    await dispatchPending(outbox, { publishToQueue }, 10);

    assert.equal(publishToQueue.mock.callCount(), 1);
    const args = publishToQueue.mock.calls[0].arguments;
    assert.equal(args[0], CREDIT_USER_QUEUE);
    assert.equal(args[2], '11111111-1111-4111-8111-111111111111');
    assert.deepEqual(outbox.published, ['11111111-1111-4111-8111-111111111111']);
    assert.deepEqual(outbox.failures, []);
  });

  it('treats a false publish result as a failure and does not mark published', async () => {
    const outbox = store([row()]);
    await dispatchPending(outbox, { publishToQueue: async () => false }, 10);

    assert.deepEqual(outbox.published, []);
    assert.equal(outbox.failures.length, 1);
    assert.equal(outbox.failures[0].message, 'publish-rejected');
  });

  it('continues after one row fails', async () => {
    const first = row({ eventId: '11111111-1111-4111-8111-111111111111' });
    const second = row({
      eventId: '22222222-2222-4222-8222-222222222222',
      body: JSON.stringify({
        type: 'user.created',
        eventId: '22222222-2222-4222-8222-222222222222',
        occurredAt: '2026-10-21T00:00:00.000Z',
        userId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    });
    const outbox = store([first, second]);
    const publishToQueue = mock.fn(async (_queue: string, _body: object, eventId?: string) => {
      if (eventId === first.eventId) throw new Error('broker down');
      return true;
    });

    await dispatchPending(outbox, { publishToQueue }, 10);

    assert.deepEqual(outbox.published, [second.eventId]);
    assert.equal(outbox.failures.length, 1);
    assert.equal(outbox.failures[0].eventId, first.eventId);
  });

  it('does not throw when recordFailure itself fails', async () => {
    const outbox: OutboxStorePort = {
      findUnpublished: async () => [row()],
      markPublished: async () => {
        throw new Error('should not mark');
      },
      recordFailure: async () => {
        throw new Error('db down writing failure');
      },
    };

    await dispatchPending(outbox, { publishToQueue: async () => false }, 10);
  });
});

describe('startDispatcher', () => {
  it('skips a tick while the previous one is still running', async () => {
    let calls = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });

    const outbox: OutboxStorePort = {
      findUnpublished: async () => {
        calls += 1;
        await blocked;
        return [];
      },
      markPublished: async () => {},
      recordFailure: async () => {},
    };

    const stop = startDispatcher({
      store: outbox,
      broker: { publishToQueue: async () => true },
      intervalMs: 20,
      batchSize: 10,
    });

    await new Promise((r) => setTimeout(r, 70));
    assert.equal(calls, 1);
    release();
    stop();
  });
});
