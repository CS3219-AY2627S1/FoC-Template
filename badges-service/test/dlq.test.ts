/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Tests for sending skipped messages to foc.badges.dlq and replaying them.
 * Author review: Ngooi Jun Sen to validate before merge.
 */

import { describe, expect, it, vi } from 'vitest';
import { type DeadLetter, type DeadLetterSender, readDeadLetter, replayDeadLetter, sendToDeadLetter } from '../src/messaging/dlq.js';
import { handlerFor } from '../src/messaging/handlers.js';
import { metricsOf, orderMessage } from './helpers.js';

// A topic whose handler always throws, standing in for a database outage.
vi.mock('../src/messaging/handlers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/messaging/handlers.js')>();
  return {
    handlerFor: (topic: string) =>
      topic === 'test.broken'
        ? async () => {
            throw new Error('still down');
          }
        : actual.handlerFor(topic),
  };
});

type Sent = Parameters<DeadLetterSender['send']>[0];

function fakeSender() {
  const sent: Sent[] = [];
  return { sent, sender: { send: vi.fn(async (record: Sent) => sent.push(record)) } };
}

const letter = (overrides: Partial<DeadLetter> = {}): DeadLetter => ({
  topic: 'foc.order.status',
  partition: 2,
  offset: '42',
  raw: '{}',
  reason: 'failed',
  error: 'database down',
  ...overrides,
});

// What the replay consumer receives for a dead letter: the value and headers as Buffers.
async function asReceived(input: DeadLetter) {
  const { sent, sender } = fakeSender();
  await sendToDeadLetter(sender, input);
  const message = sent[0]!.messages[0]!;
  const headers = Object.fromEntries(Object.entries(message.headers).map(([k, v]) => [k, Buffer.from(v)]));
  return { value: Buffer.from(message.value), headers };
}

describe('sendToDeadLetter', () => {
  it('sends the original message to foc.badges.dlq with where it came from in headers', async () => {
    const { sent, sender } = fakeSender();
    await sendToDeadLetter(sender, letter());
    expect(sent).toEqual([
      {
        topic: 'foc.badges.dlq',
        messages: [
          {
            key: 'foc.order.status:2',
            value: '{}',
            headers: {
              'x-original-topic': 'foc.order.status',
              'x-original-partition': '2',
              'x-original-offset': '42',
              'x-reason': 'failed',
              'x-error': 'database down',
            },
          },
        ],
      },
    ]);
  });

  it('leaves out the error header for an invalid message', async () => {
    const { sent, sender } = fakeSender();
    await sendToDeadLetter(sender, letter({ reason: 'invalid', error: null }));
    expect(sent[0]!.messages[0]!.headers).not.toHaveProperty('x-error');
  });
});

describe('readDeadLetter', () => {
  it('reads back what was sent', async () => {
    const { value, headers } = await asReceived(letter());
    expect(readDeadLetter(value, headers)).toEqual(letter());
  });

  it('takes the first value of a repeated header, and an empty value for a null message', () => {
    const headers = {
      'x-original-topic': ['foc.order.status', 'other'],
      'x-original-partition': '0',
      'x-original-offset': '1',
      'x-reason': 'invalid',
    };
    expect(readDeadLetter(null, headers)).toEqual(
      letter({ partition: 0, offset: '1', raw: '', reason: 'invalid', error: null }),
    );
  });

  it.each([
    ['no headers', undefined],
    ['no original topic', { 'x-original-partition': '0', 'x-original-offset': '1', 'x-reason': 'failed' }],
    ['a partition that is not a number', { 'x-original-topic': 't', 'x-original-partition': 'x', 'x-original-offset': '1', 'x-reason': 'failed' }],
    ['no offset', { 'x-original-topic': 't', 'x-original-partition': '0', 'x-reason': 'failed' }],
    ['an unknown reason', { 'x-original-topic': 't', 'x-original-partition': '0', 'x-original-offset': '1', 'x-reason': 'other' }],
  ])('returns null for %s', (_label, headers) => {
    expect(readDeadLetter(Buffer.from('{}'), headers)).toBeNull();
  });
});

describe('replayDeadLetter', () => {
  it('applies a message that now succeeds', async () => {
    const message = orderMessage();
    const { value, headers } = await asReceived(letter({ raw: JSON.stringify(message) }));
    const { sent, sender } = fakeSender();

    expect(await replayDeadLetter(sender, value, headers)).toBe('replayed');
    expect(await metricsOf(message.courierId as string)).toMatchObject({ completedDeliveries: 1 });
    expect(sent).toHaveLength(0);
  });

  it('changes nothing for a message that had got through after all', async () => {
    const message = orderMessage();
    await handlerFor('foc.order.status')!(JSON.stringify(message));
    const { value, headers } = await asReceived(letter({ raw: JSON.stringify(message) }));

    expect(await replayDeadLetter(fakeSender().sender, value, headers)).toBe('replayed');
    expect(await metricsOf(message.courierId as string)).toMatchObject({ completedDeliveries: 1 });
  });

  it('re-queues a message that still fails, with the new error', async () => {
    const { value, headers } = await asReceived(letter({ topic: 'test.broken' }));
    const { sent, sender } = fakeSender();

    expect(await replayDeadLetter(sender, value, headers)).toBe('requeued');
    expect(sent[0]!.messages[0]!.headers).toMatchObject({
      'x-original-topic': 'test.broken',
      'x-original-offset': '42',
      'x-reason': 'failed',
      'x-error': 'still down',
    });
  });

  it('re-queues a message that is still invalid', async () => {
    const { value, headers } = await asReceived(letter({ raw: 'not json', reason: 'invalid', error: null }));
    const { sent, sender } = fakeSender();

    expect(await replayDeadLetter(sender, value, headers)).toBe('requeued');
    expect(sent[0]!.messages[0]!.headers).toMatchObject({ 'x-reason': 'invalid' });
  });

  it('drops a dead letter with unreadable headers or a topic Badges has no handler for', async () => {
    const { sender } = fakeSender();
    expect(await replayDeadLetter(sender, Buffer.from('{}'), undefined)).toBe('dropped');
    const unknown = await asReceived(letter({ topic: 'some.other.topic' }));
    expect(await replayDeadLetter(sender, unknown.value, unknown.headers)).toBe('dropped');
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("re-queues with the thrown value's text when the handler throws a non-Error", async () => {
    vi.doMock('../src/messaging/handlers.js', () => ({ handlerFor: () => async () => Promise.reject('boom') }));
    vi.resetModules();
    const { replayDeadLetter: replay, sendToDeadLetter: send } = await import('../src/messaging/dlq.js');
    const { sent: out, sender: capture } = fakeSender();
    await send(capture, letter());
    const message = out[0]!.messages[0]!;
    const headers = Object.fromEntries(Object.entries(message.headers).map(([k, v]) => [k, Buffer.from(v)]));
    const { sent, sender } = fakeSender();

    expect(await replay(sender, Buffer.from(message.value), headers)).toBe('requeued');
    expect(sent[0]!.messages[0]!.headers).toMatchObject({ 'x-error': 'boom' });
    vi.doUnmock('../src/messaging/handlers.js');
  });
});
