// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-25
// Scope: Implemented author-defined estimation flow, baseline clamping, and failure behavior, using author-defined values
// Author review: Reviewed every output, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import type { EstimateCreditRequest, EstimateCreditResponse } from '@relay/contracts'
import { CreditEstimationErrors } from '@relay/contracts'
import { EstimationServiceError } from '../types/estimation.types'
import { calculateTimeAdjustment, type TimeAdjustment } from './time-adjustment.service'
import { getAIClient } from '../clients/ai.client'
import { getBaselineForServiceType } from '../config/baselines'
import {
  limitReasonAtWord,
  MAX_AI_REASON_LENGTH,
  SHORT_TIME_EXPLANATION,
  LONG_TIME_EXPLANATION,
} from '../config/reason'

const GLOBAL_MIN_CREDITS = 10
const GLOBAL_MAX_CREDITS = 50

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function withTimeExplanation(reason: string, adjustment: TimeAdjustment): string {
  const normalizedReason = limitReasonAtWord(
    reason.replace(/\s+/g, ' ').trim(),
    MAX_AI_REASON_LENGTH,
  )
  if (adjustment.creditDelta === 0) return normalizedReason

  const timeExplanation =
    adjustment.creditDelta > 0 ? SHORT_TIME_EXPLANATION : LONG_TIME_EXPLANATION
  const reasonWithoutEnding = normalizedReason.replace(/[.!?]+$/, '')
  return reasonWithoutEnding ? `${reasonWithoutEnding}. ${timeExplanation}` : timeExplanation
}

function logEstimate(result: EstimateCreditResponse, adjustment: TimeAdjustment): void {
  console.info('Credit estimation result', {
    minCredits: result.minCredits,
    maxCredits: result.maxCredits,
    reason: result.reason,
    creditsRemovedDueToTime: Math.max(0, -adjustment.creditDelta),
  })
}

export async function estimateCredit(
  request: EstimateCreditRequest,
  now: Date = new Date(),
): Promise<EstimateCreditResponse> {
  const baseline = getBaselineForServiceType(request.serviceType)
  const timeAdjustment = calculateTimeAdjustment({
    startAt: request.startAt,
    expiresAt: request.expiresAt,
    now,
    baseline,
  })

  const aiClient = getAIClient()
  if (!aiClient) {
    throw new EstimationServiceError(
      CreditEstimationErrors.SERVICE_UNAVAILABLE,
      'Credit estimation service is unavailable.',
      503,
    )
  }

  try {
    const aiResult = await aiClient.estimateCredit(request, baseline)

    if (aiResult.minCredits === -1 || aiResult.maxCredits === -1) {
      return {
        minCredits: -1,
        maxCredits: -1,
        reason: aiResult.reason,
      }
    }

    const adjustedMinCredits = clamp(
      aiResult.minCredits + timeAdjustment.creditDelta,
      GLOBAL_MIN_CREDITS,
      GLOBAL_MAX_CREDITS,
    )
    const adjustedMaxCredits = clamp(
      aiResult.maxCredits + timeAdjustment.creditDelta,
      adjustedMinCredits,
      GLOBAL_MAX_CREDITS,
    )
    const adjustedResult: EstimateCreditResponse = {
      minCredits: adjustedMinCredits,
      maxCredits: adjustedMaxCredits,
      reason: withTimeExplanation(aiResult.reason, timeAdjustment),
    }

    // Ensure the estimated range is within the available credit balance
    const availableWholeCredits = Math.floor(request.availableCredit)
    let finalResult = adjustedResult
    if (
      availableWholeCredits >= adjustedResult.minCredits &&
      availableWholeCredits < adjustedResult.maxCredits
    ) {
      finalResult = { ...adjustedResult, maxCredits: availableWholeCredits }
    }

    logEstimate(finalResult, timeAdjustment)
    return finalResult
  } catch (error) {
    if (error instanceof Error && error.message === 'RATE_LIMITED') {
      throw new EstimationServiceError(
        CreditEstimationErrors.RATE_LIMITED,
        'Credit estimation is temporarily rate limited.',
        429,
      )
    }

    console.warn('AI estimation failed:', error)
    throw new EstimationServiceError(
      CreditEstimationErrors.SERVICE_UNAVAILABLE,
      'Credit estimation service is unavailable.',
      503,
    )
  }
}
