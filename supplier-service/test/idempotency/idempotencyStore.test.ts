/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented Phase 2 Task 6 Redis idempotency store tests, as specified in the plan.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/idempotency/idempotencyStore.test.ts to test/idempotency/idempotencyStore.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { createRedisIdempotencyStore } from '../../src/idempotency/idempotencyStore.js';

function fakeRedis() {
  const data = new Map<string, { value: string; ttl: number }>();
  const redis = {
    async set(key: string, value: string, _ex: 'EX', ttl: number, nx?: 'NX') {
      if (nx === 'NX' && data.has(key)) return null;
      data.set(key, { value, ttl });
      return 'OK';
    },
    async get(key: string) {
      return data.get(key)?.value ?? null;
    },
    async del(key: string) {
      return data.delete(key) ? 1 : 0;
    },
  };
  return { redis: redis as unknown as Redis, data };
}

const KEY = '9b2f5a80-4c1e-4f70-9d7e-2f3a1c6b8e11';

describe('idempotency store', () => {
  it('starts a new request and marks it in flight for 60 s, per user and key', async () => {
    const { redis, data } = fakeRedis();
    const store = createRedisIdempotencyStore(redis);

    expect(await store.begin('u-1', KEY)).toBe('started');
    expect(data.get(`idempotency:u-1:${KEY}`)?.ttl).toBe(60);
  });

  it('reports an in-flight replay', async () => {
    const store = createRedisIdempotencyStore(fakeRedis().redis);
    await store.begin('u-1', KEY);
    expect(await store.begin('u-1', KEY)).toBe('in_flight');
  });

  it('caches the completed response for 24 h and replays it', async () => {
    const { redis, data } = fakeRedis();
    const store = createRedisIdempotencyStore(redis);
    await store.begin('u-1', KEY);
    await store.complete('u-1', KEY, { statusCode: 201, body: { id: 7 } });

    expect(data.get(`idempotency:u-1:${KEY}`)?.ttl).toBe(86_400);
    expect(await store.begin('u-1', KEY)).toEqual({ statusCode: 201, body: { id: 7 } });
  });

  it('keeps different users independent even with the same key', async () => {
    const store = createRedisIdempotencyStore(fakeRedis().redis);
    await store.begin('u-1', KEY);
    expect(await store.begin('u-2', KEY)).toBe('started');
  });

  it('abandon frees the key so the client can retry', async () => {
    const store = createRedisIdempotencyStore(fakeRedis().redis);
    await store.begin('u-1', KEY);
    await store.abandon('u-1', KEY);
    expect(await store.begin('u-1', KEY)).toBe('started');
  });
});
