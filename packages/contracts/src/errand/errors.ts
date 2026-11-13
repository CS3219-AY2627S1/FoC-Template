/** Machine-readable errors returned by the Errand Service. */
export const ErrandErrors = {
  INVALID_ERRAND: 'INVALID_ERRAND',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  INSUFFICIENT_CREDIT: 'INSUFFICIENT_CREDIT',
  SUPPLIER_UNAVAILABLE: 'SUPPLIER_UNAVAILABLE',
  SUPPLIER_INACTIVE: 'SUPPLIER_INACTIVE',
  SERVICE_TYPE_NOT_OFFERED: 'SERVICE_TYPE_NOT_OFFERED',
  REQUESTER_DELETED: 'REQUESTER_DELETED',
  CREDIT_ESTIMATION_INVALID: 'CREDIT_ESTIMATION_INVALID',
  CREDIT_ESTIMATION_UNAVAILABLE: 'CREDIT_ESTIMATION_UNAVAILABLE',
  CREDIT_ESTIMATION_RATE_LIMITED: 'CREDIT_ESTIMATION_RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrandErrorCode = (typeof ErrandErrors)[keyof typeof ErrandErrors]

export type ErrandError = {
  code: ErrandErrorCode
  message: string
  fieldErrors?: Record<string, string>
}

/** Machine-readable errors for supplier event processing. */
export const SupplierEventErrors = {
  INVALID_EVENT: 'INVALID_EVENT',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type SupplierEventErrorCode = (typeof SupplierEventErrors)[keyof typeof SupplierEventErrors]

export type SupplierEventError = {
  code: SupplierEventErrorCode
  message: string
  fieldErrors?: Record<string, string>
}
