// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-07
// Scope: Generated tests for author-defined estimation orchestration and failure behavior.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior. Corrected tests where necessary.

import type { EstimateCreditRequest } from '@relay/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupAIClient, setAIClient } from '../src/clients/ai.client'
import { estimateCredit } from '../src/services/estimation.service'

const now = new Date('2026-11-06T09:00:00.000Z')
const baseRequest: EstimateCreditRequest = {
  name: 'Pick up lunch',
  description: 'Collect one meal and deliver it.',
  serviceType: 0,
  instructions: '',
  startAt: '2026-11-06T10:00:00.000Z',
  expiresAt: '2026-11-06T11:30:00.000Z',
  userId: 'user-1',
  availableCredit: 100,
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await cleanupAIClient()
})

describe('estimateCredit', () => {
  it('returns service unavailable when AI is not configured', async () => {
    await expect(estimateCredit(baseRequest, now)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
    })
  })

  it('passes the request and service baseline to the AI client', async () => {
    const received: unknown[] = []
    setAIClient({
      estimateCredit: async (...args) => {
        received.push(args)
        return {
          minCredits: 20,
          maxCredits: 28,
          reason: 'The task requires a straightforward collection.',
        }
      },
      rateLimiter: { tryAcquire: () => true },
    })

    const request: EstimateCreditRequest = {
      ...baseRequest,
      name: 'Deliver notes',
      description: 'Please deliver these before class.',
      serviceType: 1,
      instructions: 'Call when downstairs.',
      startAt: '2026-11-06T10:00:00.000Z',
      expiresAt: '2026-11-06T11:00:00.000Z',
    }
    const result = await estimateCredit(request, now)

    expect(result).toEqual({
      minCredits: 20,
      maxCredits: 28,
      reason: 'The task requires a straightforward collection.',
    })
    expect(received[0]).toMatchObject([
      request,
      {
        base: 10,
        min: 8,
        max: 20,
        name: 'Drink',
        standardWindowMinutes: 60,
      },
    ])
  })

  it('applies the deterministic time adjustment after the AI estimate', async () => {
    setAIClient({
      estimateCredit: async () => ({
        minCredits: 15,
        maxCredits: 20,
        reason: 'The task requires a straightforward collection.',
      }),
      rateLimiter: { tryAcquire: () => true },
    })

    await expect(
      estimateCredit(
        {
          ...baseRequest,
          startAt: '2026-11-06T10:00:00.000Z',
          expiresAt: '2026-11-06T10:45:00.000Z',
        },
        now,
      ),
    ).resolves.toEqual({
      minCredits: 18,
      maxCredits: 23,
      reason:
        'The task requires a straightforward collection. Shorter availability also increased the suggested range.',
    })
  })

  it('caps the adjusted upper estimate when the balance can cover the minimum', async () => {
    setAIClient({
      estimateCredit: async () => ({
        minCredits: 20,
        maxCredits: 28,
        reason: 'The task requires a straightforward collection.',
      }),
      rateLimiter: { tryAcquire: () => true },
    })

    await expect(
      estimateCredit(
        {
          ...baseRequest,
          startAt: '2026-11-06T10:00:00.000Z',
          expiresAt: '2026-11-06T10:45:00.000Z',
          availableCredit: 24.9,
        },
        now,
      ),
    ).resolves.toEqual({
      minCredits: 23,
      maxCredits: 24,
      reason:
        'The task requires a straightforward collection. Shorter availability also increased the suggested range.',
    })
  })

  it('keeps the explanation complete and logs time credits separately', async () => {
    setAIClient({
      estimateCredit: async () => ({
        minCredits: 15,
        maxCredits: 20,
        reason:
          'Mala hotpot with multiple protein and veggie items and noodles suggests a substantial order, warranting a moderate range.',
      }),
      rateLimiter: { tryAcquire: () => true },
    })

    const result = await estimateCredit(
      {
        ...baseRequest,
        startAt: '2026-11-06T10:00:00.000Z',
        expiresAt: '2026-11-06T13:00:00.000Z',
      },
      now,
    )

    expect(result).toEqual({
      minCredits: 12,
      maxCredits: 17,
      reason:
        'Mala hotpot with multiple protein and veggie items and noodles suggests a substantial order. Longer availability also reduced the suggested range.',
    })
    expect(result.reason).not.toContain('…')
    expect(result.reason.length).toBeLessThanOrEqual(160)
    expect(console.info).toHaveBeenCalledWith('Credit estimation result', {
      minCredits: 12,
      maxCredits: 17,
      reason: result.reason,
      creditsRemovedDueToTime: 3,
    })
  })

  it('does not apply a time adjustment to an invalid AI result', async () => {
    setAIClient({
      estimateCredit: async () => ({
        minCredits: -1,
        maxCredits: -1,
        reason: 'The errand details are not specific enough.',
      }),
      rateLimiter: { tryAcquire: () => true },
    })

    await expect(
      estimateCredit(
        {
          ...baseRequest,
          expiresAt: '2026-11-06T10:05:00.000Z',
        },
        now,
      ),
    ).resolves.toEqual({
      minCredits: -1,
      maxCredits: -1,
      reason: 'The errand details are not specific enough.',
    })
  })

  it('preserves the fair range when the balance is below its minimum', async () => {
    setAIClient({
      estimateCredit: async () => ({
        minCredits: 20,
        maxCredits: 28,
        reason: 'The task requires a straightforward collection.',
      }),
      rateLimiter: { tryAcquire: () => true },
    })

    await expect(
      estimateCredit(
        {
          ...baseRequest,
          serviceType: 1,
          startAt: '2026-11-06T10:00:00.000Z',
          expiresAt: '2026-11-06T11:00:00.000Z',
          availableCredit: 7,
        },
        now,
      ),
    ).resolves.toEqual({
      minCredits: 20,
      maxCredits: 28,
      reason: 'The task requires a straightforward collection.',
    })
  })

  it('returns rate limited error when AI client throws rate limit error', async () => {
    setAIClient({
      estimateCredit: async () => {
        throw new Error('RATE_LIMITED')
      },
      rateLimiter: { tryAcquire: () => true },
    })

    await expect(estimateCredit(baseRequest, now)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      statusCode: 429,
    })
  })

  it('returns service unavailable when AI client throws generic error', async () => {
    setAIClient({
      estimateCredit: async () => {
        throw new Error('Unknown error')
      },
      rateLimiter: { tryAcquire: () => true },
    })

    await expect(estimateCredit(baseRequest, now)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
    })
  })
})
