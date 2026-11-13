// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-09
// Scope: Implemented the author-defined available-duration credit adjustment formula.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import type { ServiceTypeBaseline } from '../config/baselines'

const MIN_ADJUSTMENT_PERCENT = -0.3
const MAX_ADJUSTMENT_PERCENT = 0.4
const ADJUSTMENT_SENSITIVITY = 0.2
const MILLISECONDS_PER_MINUTE = 60_000

export type TimeAdjustment = {
  availableMinutes: number
  baselineMinutes: number
  adjustmentPercent: number
  creditDelta: number
}

type CalculateTimeAdjustmentOptions = {
  startAt: string
  expiresAt: string
  now: Date
  baseline: ServiceTypeBaseline
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Calculates a credit adjustment based on the available time window relative to the service's standard window.
 * An adjustment cap prevents timing from overly dominating the credit estimation, while still allowing for meaningful adjustments.
 */
export function calculateTimeAdjustment({
  startAt,
  expiresAt,
  now,
  baseline,
}: CalculateTimeAdjustmentOptions): TimeAdjustment {
  const startTimestamp = Date.parse(startAt)
  const expiryTimestamp = Date.parse(expiresAt)

  if (!Number.isFinite(startTimestamp) || !Number.isFinite(expiryTimestamp)) {
    throw new Error('Invalid estimation timestamps')
  }

  const effectiveStartTimestamp = Math.max(startTimestamp, now.getTime())
  if (expiryTimestamp <= effectiveStartTimestamp) {
    throw new Error('Errand deadline must be after its effective start time')
  }

  const availableMinutes = (expiryTimestamp - effectiveStartTimestamp) / MILLISECONDS_PER_MINUTE
  const durationRatio = availableMinutes / baseline.standardWindowMinutes
  const calculatedAdjustmentPercent = clamp(
    -ADJUSTMENT_SENSITIVITY * Math.log2(durationRatio),
    MIN_ADJUSTMENT_PERCENT,
    MAX_ADJUSTMENT_PERCENT,
  )
  const adjustmentPercent = Object.is(calculatedAdjustmentPercent, -0)
    ? 0
    : calculatedAdjustmentPercent
  const rawCreditDelta = baseline.base * adjustmentPercent
  const calculatedCreditDelta = Math.sign(rawCreditDelta) * Math.round(Math.abs(rawCreditDelta))

  return {
    availableMinutes,
    baselineMinutes: baseline.standardWindowMinutes,
    adjustmentPercent,
    creditDelta: Object.is(calculatedCreditDelta, -0) ? 0 : calculatedCreditDelta,
  }
}
