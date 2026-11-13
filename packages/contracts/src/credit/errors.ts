export type CreditErrorCode =
  | 'INVALID_REQUEST' // 400
  | 'UNAUTHENTICATED' // 401
  | 'FORBIDDEN' // 403
  | 'USER_NOT_FOUND' // 404
  | 'TRANSACTION_CONFLICT' // 409
  | 'INVALID_CREDIT_AMOUNT' // 422
  | 'INSUFFICIENT_CREDITS' // 422

export type CreditError = {
  code: CreditErrorCode
  message: string
}
