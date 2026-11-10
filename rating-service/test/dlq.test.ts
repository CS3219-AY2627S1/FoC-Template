/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Tests for sending skipped messages to foc.rating.dlq and replaying them, with the replay cap.
 * Reviewed by Ngooi Jun Sen.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  type DeadLetter,
  type DeadLetterSender,
  readDeadLetter,
  replayDeadLetter,
  sendToDeadLetter,
} from '../src/messaging/dlq.js';
import { handlerFor } from '../src/messaging/handlers.js';
import { db, grantMessage, ratingGrant } from './helpers.js';

// A topic whose handler always throws, standing in for a database outage.
vi.mock('../src/messaging/handlers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/messaging/handlers.js')>();
  return {
    handlerFor: (topic: string) =>
      topic === 'test.broken'
        ? async () => {
            throw new Error('still down');
          }
        : topic === 'test.rejects'
          ? async () => Promise.reject('boom')
          : actual.handlerFor(topic),
  };
});

type Sent = Parameters<DeadLetterSender['send']>[0];

function fakeSender() {
  const sent: Sent[] = [];
  return { sent, sender: { send: vi.fn(async (record: Sent) => sent.push(record)) } };
}

const FAILED_AT = '2026-11-09T00:00:00.000Z';
const SOON = new Date('2026-11-10T00:00:00.000Z');

const letter = (overrides: Partial<DeadLetter> = {}): DeadLetter => ({
  topic: 'foc.rating.commands',
  partition: 2,
  offset: '42',
  raw: '{}',
  reason: 'failed',
  error: 'database down',
  replays: 0,
  firstFailedAt: FAILED_AT,
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
  it('sends the original message to foc.rating.dlq with where it came from in headers', async () => {
    const { sent, sender } = fakeSender();
    await sendToDeadLetter(sender, letter());
    expect(sent).toEqual([
      {
        topic: 'foc.rating.dlq',
        messages: [
          {
            key: 'foc.rating.commands:2',
            value: '{}',
            headers: {
              'x-original-topic': 'foc.rating.commands',
              'x-original-partition': '2',
              'x-original-offset': '42',
              'x-reason': 'failed',
              'x-error': 'database down',
              'x-replay-count': '0',
              'x-first-failed-at': FAILED_AT,
            },
          },
        ],
      },
    ]);
  });

  it('starts a new dead letter at no replays, failing now, with no error header when invalid', async () => {
    const { sent, sender } = fakeSender();
    const before = Date.now();
    await sendToDeadLetter(sender, { topic: 't', partition: 0, offset: '1', raw: 'x', reason: 'invalid', error: null });
    const headers = sent[0]!.messages[0]!.headers;
    expect(headers).not.toHaveProperty('x-error');
    expect(headers['x-replay-count']).toBe('0');
    expect(Date.parse(headers['x-first-failed-at']!)).toBeGreaterThanOrEqual(before);
  });
});

describe('readDeadLetter', () => {
  it('reads back what was sent', async () => {
    const { value, headers } = await asReceived(letter({ replays: 3 }));
    expect(readDeadLetter(value, headers)).toEqual(letter({ replays: 3 }));
  });

  it('takes the first value of a repeated header, and an empty value for a null message', () => {
    const headers = {
      'x-original-topic': ['foc.rating.commands', 'other'],
      'x-original-partition': '0',
      'x-original-offset': '1',
      'x-reason': 'invalid',
      'x-replay-count': '1',
      'x-first-failed-at': FAILED_AT,
    };
    expect(readDeadLetter(null, headers)).toEqual(
      letter({ partition: 0, offset: '1', raw: '', reason: 'invalid', error: null, replays: 1 }),
    );
  });

  it('treats a missing or unreadable replay count and failure time as no replays, failing now', () => {
    const before = Date.now();
    const base = { 'x-original-topic': 't', 'x-original-partition': '0', 'x-original-offset': '1', 'x-reason': 'failed' };
    for (const extra of [{}, { 'x-replay-count': 'many', 'x-first-failed-at': 'yesterday' }, { 'x-replay-count': '-1' }]) {
      const read = readDeadLetter(Buffer.from('{}'), { ...base, ...extra })!;
      expect(read.replays).toBe(0);
      expect(Date.parse(read.firstFailedAt)).toBeGreaterThanOrEqual(before);
    }
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
    const message = grantMessage();
    const { value, headers } = await asReceived(letter({ raw: JSON.stringify(message) }));
    const { sent, sender } = fakeSender();

    expect(await replayDeadLetter(sender, value, headers, SOON)).toMatchObject({ outcome: 'replayed' });
    expect(await db.select().from(ratingGrant)).toHaveLength(1);
    expect(sent).toHaveLength(0);
  });

  it('changes nothing for a message that had got through after all', async () => {
    const message = grantMessage();
    await handlerFor('foc.rating.commands')!(JSON.stringify(message));
    const { value, headers } = await asReceived(letter({ raw: JSON.stringify(message) }));

    expect(await replayDeadLetter(fakeSender().sender, value, headers, SOON)).toMatchObject({ outcome: 'replayed' });
    expect(await db.select().from(ratingGrant)).toHaveLength(1);
  });

  it('re-queues a message that still fails, counting the replay and keeping the first failure time', async () => {
    const { value, headers } = await asReceived(letter({ topic: 'test.broken', replays: 1 }));
    const { sent, sender } = fakeSender();

    expect(await replayDeadLetter(sender, value, headers, SOON)).toMatchObject({ outcome: 'requeued' });
    expect(sent[0]!.messages[0]!.headers).toMatchObject({
      'x-original-topic': 'test.broken',
      'x-original-offset': '42',
      'x-reason': 'failed',
      'x-error': 'still down',
      'x-replay-count': '2',
      'x-first-failed-at': FAILED_AT,
    });
  });

  it('re-queues a message that is still invalid', async () => {
    const { value, headers } = await asReceived(letter({ raw: 'not json', reason: 'invalid', error: null }));
    const { sent, sender } = fakeSender();

    expect(await replayDeadLetter(sender, value, headers, SOON)).toMatchObject({ outcome: 'requeued' });
    expect(sent[0]!.messages[0]!.headers).toMatchObject({ 'x-reason': 'invalid', 'x-replay-count': '1' });
  });

  it("records a non-Error throw by its text", async () => {
    const { value, headers } = await asReceived(letter({ topic: 'test.rejects' }));
    const { sent, sender } = fakeSender();

    expect(await replayDeadLetter(sender, value, headers, SOON)).toMatchObject({ outcome: 'requeued' });
    expect(sent[0]!.messages[0]!.headers).toMatchObject({ 'x-error': 'boom' });
  });

  it('expires a message on its fifth failed replay instead of re-queueing it', async () => {
    const { value, headers } = await asReceived(letter({ topic: 'test.broken', replays: 4 }));
    const { sent, sender } = fakeSender();

    const result = await replayDeadLetter(sender, value, headers, SOON);

    expect(result).toEqual({
      outcome: 'expired',
      letter: letter({ topic: 'test.broken', replays: 5, error: 'still down' }),
    });
    expect(sent).toHaveLength(0);
  });

  it('expires a message first skipped longer ago than the topic keeps dead letters', async () => {
    const { value, headers } = await asReceived(letter({ raw: 'not json', reason: 'invalid', error: null }));
    const { sent, sender } = fakeSender();

    const later = new Date(Date.parse(FAILED_AT) + 30 * 24 * 60 * 60 * 1000);
    expect(await replayDeadLetter(sender, value, headers, later)).toMatchObject({ outcome: 'expired' });
    expect(sent).toHaveLength(0);
  });

  it('drops a dead letter with unreadable headers or a topic Rating has no handler for', async () => {
    const { sender } = fakeSender();
    expect(await replayDeadLetter(sender, Buffer.from('{}'), undefined)).toEqual({ outcome: 'dropped', letter: null });
    const unknown = await asReceived(letter({ topic: 'some.other.topic' }));
    expect(await replayDeadLetter(sender, unknown.value, unknown.headers)).toMatchObject({
      outcome: 'dropped',
      letter: { topic: 'some.other.topic' },
    });
    expect(sender.send).not.toHaveBeenCalled();
  });
});
