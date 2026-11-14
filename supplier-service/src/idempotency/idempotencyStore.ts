/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented Phase 2 Task 6 Redis idempotency store, as specified in the plan.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import type { Redis } from 'ioredis';

const IN_FLIGHT_TTL_SECONDS = 60;
const COMPLETED_TTL_SECONDS = 24 * 60 * 60;

export interface CachedResponse {
  statusCode: number;
  body: unknown;
}

export type BeginResult = 'started' | 'in_flight' | CachedResponse;

export interface IdempotencyStore {
  begin(userId: string, key: string): Promise<BeginResult>;
  complete(userId: string, key: string, response: CachedResponse): Promise<void>;
  abandon(userId: string, key: string): Promise<void>;
}

/** Redis-backed store, keyed per user and per key (Arch §7.5, §9 item 21 (f)). */
export function createRedisIdempotencyStore(redis: Redis): IdempotencyStore {
  const redisKey = (userId: string, key: string) => `idempotency:${userId}:${key}`;

  return {
    async begin(userId, key) {
      const name = redisKey(userId, key);
      const started = await redis.set(name, JSON.stringify({ status: 'in_flight' }), 'EX', IN_FLIGHT_TTL_SECONDS, 'NX');
      if (started === 'OK') return 'started';

      const existing = await redis.get(name);
      if (existing === null) {
        // Expired between the two calls: treat as a fresh request.
        return this.begin(userId, key);
      }
      const state = JSON.parse(existing) as { status: 'in_flight' } | { status: 'completed'; response: CachedResponse };
      return state.status === 'completed' ? state.response : 'in_flight';
    },

    async complete(userId, key, response) {
      await redis.set(redisKey(userId, key), JSON.stringify({ status: 'completed', response }), 'EX', COMPLETED_TTL_SECONDS);
    },

    async abandon(userId, key) {
      await redis.del(redisKey(userId, key));
    },
  };
}
