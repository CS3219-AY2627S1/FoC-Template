import { createClient } from 'redis';
import { env } from './env';

export const redis = createClient({
  url: env.REDIS_URL,
  socket: {
    reconnectStrategy(retries) {
      // Keep retrying through temporary outages; cap delay at 1s.
      return Math.min(retries * 100, 1000);
    },
  },
});

redis.on('error', (err) => {
  console.error('Redis client error:', err);
});

export async function connectRedis(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis.isOpen) {
    await redis.quit();
  }
}
