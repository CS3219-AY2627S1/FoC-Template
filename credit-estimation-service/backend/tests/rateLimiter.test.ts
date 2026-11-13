// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-03
// Scope: Generated tests for the initial rate limiter.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior. Corrected tests where necessary.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SlidingWindowRateLimiter } from '../src/clients/rateLimiter.js'

function setTime(time: number) {
  vi.useFakeTimers()
  vi.setSystemTime(time)
}

describe('SlidingWindowRateLimiter', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows up to maxRequests within window', () => {
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 5 })

    // First 5 requests should succeed
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryAcquire()).toBe(true)
    }

    // 6th request should fail
    expect(limiter.tryAcquire()).toBe(false)
  })

  it('resets after window expires', () => {
    setTime(0)
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 3, windowMs: 1000 })

    // Exhaust the limit
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false)

    // Move time forward by window + 1ms
    vi.setSystemTime(1001)

    // Should be able to make requests again
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
  })

  it('sliding window removes old requests', () => {
    setTime(0)
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 3, windowMs: 1000 })

    // Make 3 requests at t=0
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false)

    // Move time forward by 500ms - requests still within window
    vi.setSystemTime(500)
    expect(limiter.tryAcquire()).toBe(false)

    // Move time forward by 1000ms (total 1000ms) - oldest request expires
    // windowStart = 1000 - 1000 = 0, so request at t=0 is now outside window
    vi.setSystemTime(1000)
    expect(limiter.tryAcquire()).toBe(true) // Should succeed now (1st)
    expect(limiter.tryAcquire()).toBe(true) // 2nd
    expect(limiter.tryAcquire()).toBe(true) // 3rd
    expect(limiter.tryAcquire()).toBe(false) // 4th should fail
  })

  it('getRemaining returns correct count', () => {
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 5 })

    expect(limiter.getRemaining()).toBe(5)

    limiter.tryAcquire()
    limiter.tryAcquire()
    limiter.tryAcquire()

    expect(limiter.getRemaining()).toBe(2)
  })

  it('getNextReset returns 0 when no requests made', () => {
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 10 })
    expect(limiter.getNextReset()).toBe(0)
  })

  it('default config (20 requests per 60 seconds)', () => {
    const limiter = new SlidingWindowRateLimiter()

    // Should allow 20 requests
    for (let i = 0; i < 20; i++) {
      expect(limiter.tryAcquire()).toBe(true)
    }

    // 21st should fail
    expect(limiter.tryAcquire()).toBe(false)
  })
})
