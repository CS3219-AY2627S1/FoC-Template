// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-26
// Scope: Implemented the existing Errand-to-Estimation internal client and failure mapping.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import type { EstimateCreditRequest, EstimateCreditResponse } from '@relay/contracts'
import { ErrandErrors } from '@relay/contracts'
import { getEnv } from '../config/env.js'
import { ErrandServiceError } from '../types/errand.types.js'

export class CreditEstimationClient {
  async estimateCredit(request: EstimateCreditRequest): Promise<EstimateCreditResponse> {
    const env = getEnv()
    let response: Response

    try {
      response = await fetch(`${env.creditEstimationApiUrl}/internal/estimation/estimate-credit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-credit-estimation-service-token': env.creditEstimationServiceToken,
          'x-user-id': request.userId,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(env.estimationTimeoutMs),
      })
    } catch {
      throw new ErrandServiceError(
        ErrandErrors.CREDIT_ESTIMATION_UNAVAILABLE,
        'Credit estimation service is unavailable.',
        503,
      )
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => null)) as {
        code?: string
        message?: string
      } | null
      const isRateLimited = response.status === 429 || errorData?.code === 'RATE_LIMITED'
      const isInvalidRequest = response.status >= 400 && response.status < 500
      throw new ErrandServiceError(
        isRateLimited
          ? ErrandErrors.CREDIT_ESTIMATION_RATE_LIMITED
          : isInvalidRequest
            ? ErrandErrors.CREDIT_ESTIMATION_INVALID
            : ErrandErrors.CREDIT_ESTIMATION_UNAVAILABLE,
        isRateLimited || isInvalidRequest
          ? (errorData?.message ?? 'Credit estimation request failed.')
          : 'Credit estimation service is unavailable.',
        isRateLimited ? 429 : isInvalidRequest ? response.status : 503,
      )
    }

    const data = await response.json()
    return data as EstimateCreditResponse
  }
}
