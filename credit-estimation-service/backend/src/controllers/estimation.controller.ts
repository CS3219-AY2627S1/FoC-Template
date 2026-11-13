// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-25
// Scope: Integrated author-defined estimation controller with request validation and service method.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation details to fit project requirements.

import { validateEstimateRequest } from '../validators/estimation.validator'
import { estimateCredit } from '../services/estimation.service'
import { EstimateCreditRequest, EstimateCreditResponse } from '@relay/contracts'

export async function handleEstimateCredit(
  request: EstimateCreditRequest,
): Promise<EstimateCreditResponse> {
  const {
    name,
    description,
    serviceType,
    instructions,
    startAt,
    expiresAt,
    userId,
    availableCredit,
  } = request

  validateEstimateRequest(request)

  return estimateCredit({
    name,
    description,
    serviceType,
    instructions,
    startAt,
    expiresAt,
    userId,
    availableCredit,
  })
}
