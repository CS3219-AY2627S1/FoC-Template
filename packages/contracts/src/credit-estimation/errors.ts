/** Machine-readable errors returned by the Credit Estimation Service. */
export const CreditEstimationErrors = {
  INVALID_INPUT: 'INVALID_INPUT',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type CreditEstimationErrorCode =
  (typeof CreditEstimationErrors)[keyof typeof CreditEstimationErrors]

export type CreditEstimationError = {
  code: CreditEstimationErrorCode
  message: string
}
