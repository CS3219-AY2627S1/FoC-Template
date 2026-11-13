// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-09
// Scope: Generated tests for the author-defined time adjustment.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior. Corrected tests where necessary.

import { describe, expect, it } from 'vitest'
import { getBaselineForServiceType } from '../src/config/baselines'
import { calculateTimeAdjustment } from '../src/services/time-adjustment.service'

const now = new Date('2026-11-09T09:00:00.000Z')
const foodBaseline = getBaselineForServiceType(0)

function calculate(startAt: string, expiresAt: string) {
  return calculateTimeAdjustment({ startAt, expiresAt, now, baseline: foodBaseline })
}

describe('calculateTimeAdjustment', () => {
  it('does not adjust a service-standard window', () => {
    expect(calculate('2026-11-09T10:00:00.000Z', '2026-11-09T11:30:00.000Z')).toEqual({
      availableMinutes: 90,
      baselineMinutes: 90,
      adjustmentPercent: 0,
      creditDelta: 0,
    })
  })

  it('adds credits when the window is half the service baseline', () => {
    const result = calculate('2026-11-09T10:00:00.000Z', '2026-11-09T10:45:00.000Z')

    expect(result.adjustmentPercent).toBeCloseTo(0.2)
    expect(result.creditDelta).toBe(3)
  })

  it('removes credits when the window is twice the service baseline', () => {
    const result = calculate('2026-11-09T10:00:00.000Z', '2026-11-09T13:00:00.000Z')

    expect(result.adjustmentPercent).toBeCloseTo(-0.2)
    expect(result.creditDelta).toBe(-3)
  })

  it('caps the increase for an extremely short window', () => {
    const result = calculate('2026-11-09T10:00:00.000Z', '2026-11-09T10:05:00.000Z')

    expect(result.adjustmentPercent).toBe(0.4)
    expect(result.creditDelta).toBe(6)
  })

  it('caps the decrease for an extremely long window', () => {
    const result = calculate('2026-11-09T10:00:00.000Z', '2026-11-09T22:00:00.000Z')

    expect(result.adjustmentPercent).toBe(-0.3)
    expect(result.creditDelta).toBe(-5)
  })

  it('uses the current time when the selected start is in the past', () => {
    const result = calculate('2026-11-09T08:00:00.000Z', '2026-11-09T09:45:00.000Z')

    expect(result.availableMinutes).toBe(45)
    expect(result.creditDelta).toBe(3)
  })

  it('rejects a deadline before the effective start', () => {
    expect(() => calculate('2026-11-09T08:00:00.000Z', '2026-11-09T08:30:00.000Z')).toThrow(
      'Errand deadline must be after its effective start time',
    )
  })
})
