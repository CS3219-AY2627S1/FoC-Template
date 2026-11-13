// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-09
// Scope: Generated tests for request validation and prompt-safety behavior.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior. Corrected tests where necessary.

import { describe, expect, it } from 'vitest'
import type { EstimateCreditRequest } from '@relay/contracts'
import { validateEstimateRequest } from '../src/validators/estimation.validator'

const validRequest: EstimateCreditRequest = {
  name: 'Pick up lunch',
  description: 'Collect one meal and deliver it.',
  serviceType: 0,
  instructions: '',
  startAt: '2026-11-09T10:00:00.000Z',
  expiresAt: '2026-11-09T12:00:00.000Z',
  userId: 'user-1',
  availableCredit: 37,
}

const now = new Date('2026-11-09T09:00:00.000Z')

describe('validateEstimateRequest available credit', () => {
  it('accepts zero and fractional balances', () => {
    expect(() =>
      validateEstimateRequest({ ...validRequest, availableCredit: 0 }, now),
    ).not.toThrow()
    expect(() =>
      validateEstimateRequest({ ...validRequest, availableCredit: 12.5 }, now),
    ).not.toThrow()
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid balance %s',
    (availableCredit) => {
      expect(() => validateEstimateRequest({ ...validRequest, availableCredit }, now)).toThrowError(
        expect.objectContaining({
          code: 'INVALID_INPUT',
          fieldErrors: {
            availableCredit: 'Available credit must be a nonnegative number',
          },
        }),
      )
    },
  )
})

describe('validateEstimateRequest user identity', () => {
  it.each([undefined, '', '   '])('rejects missing user ID %s', (userId) => {
    expect(() =>
      validateEstimateRequest({ ...validRequest, userId } as unknown as EstimateCreditRequest, now),
    ).toThrowError(
      expect.objectContaining({
        code: 'INVALID_INPUT',
        fieldErrors: { userId: 'User ID is required' },
      }),
    )
  })
})

describe('validateEstimateRequest text limits', () => {
  it.each([
    ['name', 200],
    ['description', 5000],
    ['instructions', 5000],
  ] as const)('accepts %s at its %i-character limit', (field, limit) => {
    expect(() =>
      validateEstimateRequest({ ...validRequest, [field]: 'a'.repeat(limit) }, now),
    ).not.toThrow()
  })

  it.each([
    ['name', 200],
    ['description', 5000],
    ['instructions', 5000],
  ] as const)('rejects %s above its %i-character limit', (field, limit) => {
    expect(() =>
      validateEstimateRequest({ ...validRequest, [field]: 'a'.repeat(limit + 1) }, now),
    ).toThrowError(
      expect.objectContaining({
        code: 'INVALID_INPUT',
        fieldErrors: expect.objectContaining({ [field]: expect.any(String) }),
      }),
    )
  })
})

describe('validateEstimateRequest time window', () => {
  it.each(['startAt', 'expiresAt'] as const)('requires %s', (field) => {
    const request = { ...validRequest, [field]: undefined } as unknown as EstimateCreditRequest

    expect(() => validateEstimateRequest(request, now)).toThrowError(
      expect.objectContaining({
        code: 'INVALID_INPUT',
        fieldErrors: { [field]: `${field} must be a valid date string` },
      }),
    )
  })

  it('rejects a deadline before the selected start time', () => {
    expect(() =>
      validateEstimateRequest(
        {
          ...validRequest,
          startAt: '2026-11-09T12:00:00.000Z',
          expiresAt: '2026-11-09T11:00:00.000Z',
        },
        now,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'INVALID_INPUT',
        fieldErrors: {
          expiresAt: 'Deadline must be after the start time and in the future',
        },
      }),
    )
  })

  it('rejects a deadline that has already passed', () => {
    expect(() =>
      validateEstimateRequest(
        {
          ...validRequest,
          startAt: '2026-11-09T07:00:00.000Z',
          expiresAt: '2026-11-09T08:00:00.000Z',
        },
        now,
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }))
  })
})
