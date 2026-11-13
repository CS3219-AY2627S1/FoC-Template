// AI Assistance Disclosure: Claude Opus (Cursor), 2026-11-05.
// Prompt: improve index.ts to ensure supplier/order pub-sub works for the supplier cache.
// Scope: generated fail-fast Redis client and startup readiness wait.
// Author review: lgtm redis client by @sunpterodactyl.
import { Redis } from 'ioredis';

// Fail fast instead of queueing: a cache read that cannot run should fall through to gRPC
// rather than hold an order request. ioredis keeps reconnecting in the background.
export function createRedisClient(url: string): Redis {
  const redis = new Redis(url, { enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: 500 });
  let lastError: string | undefined;
  redis.on('error', (error: Error) => {
    if (error.message === lastError) return;
    lastError = error.message;
    console.warn('Redis unavailable; supplier lookups use gRPC', { message: error.message });
  });
  redis.on('ready', () => {
    lastError = undefined;
    console.info('Redis connected');
  });
  return redis;
}

export function waitForRedis(redis: Redis, timeoutMs: number): Promise<boolean> {
  if (redis.status === 'ready') return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { redis.off('ready', onReady); resolve(false); }, timeoutMs);
    const onReady = () => { clearTimeout(timer); resolve(true); };
    redis.once('ready', onReady);
  });
}
