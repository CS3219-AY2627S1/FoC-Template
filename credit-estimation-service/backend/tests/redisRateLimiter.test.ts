// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-09
// Scope: Generated tests for Redis per-user/global rate limiting and fallback behavior.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior; corrected tests where necessary.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DistributedRateLimiter } from '../src/clients/redisRateLimiter.js'

function createLimiter(evalResult: number[] | Error) {
  const evalMock =
    evalResult instanceof Error
      ? vi.fn().mockRejectedValue(evalResult)
      : vi.fn().mockResolvedValue(evalResult)
  const redis = {
    eval: evalMock,
    quit: vi.fn().mockResolvedValue('OK'),
    ping: vi.fn().mockResolvedValue('PONG'),
  }
  const limiter = new DistributedRateLimiter(
    {
      redisUrl: 'redis://unused',
      windowMs: 60_000,
      perUserMaxRequests: 20,
      globalMaxRequests: 50,
      namespace: 'credit_estimation_test',
    },
    redis as never,
  )
  return { limiter, evalMock }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DistributedRateLimiter', () => {
  it('atomically checks user and global keys', async () => {
    const { limiter, evalMock } = createLimiter([1, 0, 0])

    await expect(limiter.tryAcquire('user-1', 1_000, 'request-1')).resolves.toEqual({
      allowed: true,
    })
    expect(evalMock).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('ZCARD', KEYS[2])"),
      2,
      '{credit_estimation_test}:user:user-1',
      '{credit_estimation_test}:global',
      1_000,
      60_000,
      20,
      50,
      'request-1',
    )
  })

  it('reports a user limit rejection and retry delay', async () => {
    const { limiter } = createLimiter([0, 1, 12_500])

    await expect(limiter.tryAcquire('user-1')).resolves.toEqual({
      allowed: false,
      scope: 'user',
      retryAfterMs: 12_500,
    })
  })

  it('reports a global limit rejection and retry delay', async () => {
    const { limiter } = createLimiter([0, 2, 8_000])

    await expect(limiter.tryAcquire('user-2')).resolves.toEqual({
      allowed: false,
      scope: 'global',
      retryAfterMs: 8_000,
    })
  })

  it('fails closed when Redis cannot enforce the shared limit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { limiter } = createLimiter(new Error('Redis unavailable'))

    await expect(limiter.tryAcquire('user-1')).rejects.toThrow()
  })
})
