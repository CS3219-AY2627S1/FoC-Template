// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-08
// Scope: Implemented the author-designed Redis-backed per-user/global rate limiting.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

/**
 * Redis-backed rolling-window limiter shared by every service instance.
 *
 * Checks and records the per-user and service-wide limits
 * atomically. Rejected requests are not added to either window.
 */

import { randomUUID } from 'node:crypto'
import { Redis } from 'ioredis'

export type RateLimitScope = 'user' | 'global'

export type RateLimitDecision =
  { allowed: true } | { allowed: false; scope: RateLimitScope; retryAfterMs: number }

export interface RateLimiterConfig {
  windowMs: number
  perUserMaxRequests: number
  globalMaxRequests: number
  redisUrl: string
  namespace?: string
}

type RedisClient = Pick<Redis, 'eval' | 'quit' | 'ping'>

const USER_LIMITED = 1
const GLOBAL_LIMITED = 2

export class DistributedRateLimiter {
  private readonly redis: RedisClient
  private readonly windowMs: number
  private readonly perUserMaxRequests: number
  private readonly globalMaxRequests: number
  private readonly namespace: string
  private readonly script: string

  constructor(config: RateLimiterConfig, redisClient?: RedisClient) {
    this.windowMs = config.windowMs
    this.perUserMaxRequests = config.perUserMaxRequests
    this.globalMaxRequests = config.globalMaxRequests
    this.namespace = config.namespace || 'credit_estimation'
    this.redis =
      redisClient ??
      new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy: (times) => Math.min(times * 50, 2000),
      })

    // KEYS use the same Redis hash tag so the script also works with Redis Cluster.
    this.script = `
      local now_ms = tonumber(ARGV[1])
      local window_ms = tonumber(ARGV[2])
      local user_limit = tonumber(ARGV[3])
      local global_limit = tonumber(ARGV[4])
      local request_id = ARGV[5]
      local cutoff = now_ms - window_ms

      redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
      redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)

      local user_count = redis.call('ZCARD', KEYS[1])
      local global_count = redis.call('ZCARD', KEYS[2])

      local function retry_after(key)
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        if oldest[2] == nil then
          return window_ms
        end
        return math.max(0, window_ms - (now_ms - tonumber(oldest[2])))
      end

      if user_count >= user_limit then
        return {0, ${USER_LIMITED}, retry_after(KEYS[1])}
      end

      if global_count >= global_limit then
        return {0, ${GLOBAL_LIMITED}, retry_after(KEYS[2])}
      end

      redis.call('ZADD', KEYS[1], now_ms, request_id)
      redis.call('ZADD', KEYS[2], now_ms, request_id)
      redis.call('PEXPIRE', KEYS[1], window_ms)
      redis.call('PEXPIRE', KEYS[2], window_ms)

      return {1, 0, 0}
    `
  }

  async tryAcquire(
    userId: string,
    nowMs: number = Date.now(),
    requestId: string = randomUUID(),
  ): Promise<RateLimitDecision> {
    const hashTag = `{${this.namespace}}`
    const userKey = `${hashTag}:user:${userId}`
    const globalKey = `${hashTag}:global`

    try {
      const result = (await this.redis.eval(
        this.script,
        2,
        userKey,
        globalKey,
        nowMs,
        this.windowMs,
        this.perUserMaxRequests,
        this.globalMaxRequests,
        requestId,
      )) as number[]

      if (result.length < 3) throw new Error('Invalid rate limiter response')
      if (result[0] === 1) return { allowed: true }

      const scope = result[1] === GLOBAL_LIMITED ? 'global' : 'user'
      return {
        allowed: false,
        scope,
        retryAfterMs: Math.max(0, Number(result[2]) || 0),
      }
    } catch {
      console.error('Redis rate limiter unavailable')
      // Estimation is optional and invokes a paid API. If the shared limiter
      // cannot be enforced, fail closed instead of allowing unbounded calls.
      throw new Error('Redis rate limiter unavailable')
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit()
  }

  async isConnected(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG'
    } catch {
      return false
    }
  }
}

export function createDistributedRateLimiter(
  redisUrl: string,
  perUserMaxRequests: number = 20,
  globalMaxRequests: number = 300,
): DistributedRateLimiter {
  return new DistributedRateLimiter({
    windowMs: 60 * 1000,
    perUserMaxRequests,
    globalMaxRequests,
    redisUrl,
  })
}
