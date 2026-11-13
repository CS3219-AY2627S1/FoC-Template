// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-09
// Scope: Generated tests for estimation environment parsing and limits.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior. Corrected tests where necessary.

import { afterEach, describe, expect, it } from 'vitest'
import { getEnv } from '../src/config/env.js'

const originalGlobalLimit = process.env.AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE

afterEach(() => {
  if (originalGlobalLimit === undefined) {
    delete process.env.AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE
  } else {
    process.env.AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE = originalGlobalLimit
  }
})

describe('credit estimation environment', () => {
  it('defaults the shared global rate limit to 300 requests per minute', () => {
    delete process.env.AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE
    expect(getEnv().aiGlobalRateLimitRequestsPerMinute).toBe(300)
  })

  it('accepts a configured shared global rate limit', () => {
    process.env.AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE = '75'
    expect(getEnv().aiGlobalRateLimitRequestsPerMinute).toBe(75)
  })

  it('falls back to 300 for an invalid shared global rate limit', () => {
    process.env.AI_GLOBAL_RATE_LIMIT_REQUESTS_PER_MINUTE = '0'
    expect(getEnv().aiGlobalRateLimitRequestsPerMinute).toBe(300)
  })
})
