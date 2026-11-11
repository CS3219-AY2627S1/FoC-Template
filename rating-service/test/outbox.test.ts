/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated tests for the outbox relay.
 * Reviewed by Ngooi Jun Sen.
 */

import { isNull, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import {
  type MessageSender,
  purgeSentOutbox,
  relayOutboxBatch,
  startOutboxPurge,
  startOutboxRelay,
} from '../src/messaging/outbox.js';
import { db, outbox } from './helpers.js';

function fakeSender(failOn?: number) {
  const sent: { topic: string; key: string; value: unknown }[] = [];
  const sender: MessageSender = {
    send: vi.fn(async ({ topic, messages }) => {
      if (failOn !== undefined && sent.length === failOn) throw new Error('broker down');
      for (const m of messages) sent.push({ topic, key: m.key, value: JSON.parse(m.value) });
    }),
  };
  return { sender, sent };
}

async function queue(n: number) {
  for (let i = 0; i < n; i += 1) {
    await db.insert(outbox).values({ topic: 'foc.user.rating', messageKey: `user-${i}`, payload: { i } });
  }
}

describe('relayOutboxBatch', () => {
  it('sends unsent rows in order and marks them sent', async () => {
    await queue(3);
    const { sender, sent } = fakeSender();

    expect(await relayOutboxBatch(sender)).toBe(3);
    expect(sent.map((s) => s.value)).toEqual([{ i: 0 }, { i: 1 }, { i: 2 }]);
    expect(sent[0]).toMatchObject({ topic: 'foc.user.rating', key: 'user-0' });
    expect(await db.select().from(outbox).where(isNull(outbox.sentAt))).toHaveLength(0);

    expect(await relayOutboxBatch(sender)).toBe(0);
  });

  it('respects the batch limit', async () => {
    await queue(3);
    const { sender } = fakeSender();
    expect(await relayOutboxBatch(sender, 2)).toBe(2);
    expect(await db.select().from(outbox).where(isNull(outbox.sentAt))).toHaveLength(1);
  });

  it('leaves the whole batch unsent when a send fails', async () => {
    await queue(3);
    const { sender } = fakeSender(1);
    await expect(relayOutboxBatch(sender)).rejects.toThrow('broker down');
    expect(await db.select().from(outbox).where(isNull(outbox.sentAt))).toHaveLength(3);
  });
});

describe('startOutboxRelay', () => {
  it('drains the outbox and reports errors without stopping', async () => {
    await queue(2);
    const { sender, sent } = fakeSender();
    const onError = vi.fn();
    const stop = startOutboxRelay(sender, 10, onError);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    stop();
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError when a pass fails', async () => {
    await queue(1);
    const { sender } = fakeSender(0);
    const onError = vi.fn();
    const stop = startOutboxRelay(sender, 10, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    stop();
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;

describe('purgeSentOutbox', () => {
  it('deletes rows sent before the retention window and keeps the rest', async () => {
    await queue(3);
    const [oldSent, recentSent] = await db.select().from(outbox).orderBy(outbox.outboxId);
    await db.update(outbox).set({ sentAt: sql`now() - interval '8 days'` }).where(sql`${outbox.outboxId} = ${oldSent!.outboxId}`);
    await db.update(outbox).set({ sentAt: sql`now() - interval '1 day'` }).where(sql`${outbox.outboxId} = ${recentSent!.outboxId}`);

    expect(await purgeSentOutbox(7 * DAY_MS)).toBe(1);

    const left = (await db.select().from(outbox)).map((row) => row.outboxId);
    expect(left).toHaveLength(2);
    expect(left).toContain(recentSent!.outboxId);
    expect(left).not.toContain(oldSent!.outboxId);
  });

  it('never deletes unsent rows, however old', async () => {
    await queue(1);
    await db.update(outbox).set({ createdAt: sql`now() - interval '30 days'` });
    expect(await purgeSentOutbox(0)).toBe(0);
    expect(await db.select().from(outbox)).toHaveLength(1);
  });
});

describe('startOutboxPurge', () => {
  it('purges on a timer until stopped', async () => {
    await queue(1);
    await db.update(outbox).set({ sentAt: sql`now() - interval '8 days'` });
    const onError = vi.fn();
    const stop = startOutboxPurge(10, 7 * DAY_MS, onError);
    await vi.waitFor(async () => expect(await db.select().from(outbox)).toHaveLength(0));
    stop();
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError when a purge fails', async () => {
    const onError = vi.fn();
    const stop = startOutboxPurge(10, Number.NaN, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    stop();
  });
});
