import { CreditEstimationErrors } from '@relay/contracts'

export class EstimationServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message)
  }
}

export function translateEstimationError(error: Error): EstimationServiceError {
  if (error instanceof EstimationServiceError) {
    return error
  }
  console.error('Unexpected error in estimation service:', error)
  return new EstimationServiceError(
    CreditEstimationErrors.INTERNAL_ERROR,
    'Internal server error',
    500,
  )
}
