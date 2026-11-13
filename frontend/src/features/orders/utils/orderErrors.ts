import { isAxiosError } from 'axios'
import { getApiErrorCode } from '#/lib/httpErrors'
import type { OrderErrorResponse } from '../types/errand.types'

export const creationErrorOrderId = (error: unknown): string | undefined => {
  if (!isAxiosError<OrderErrorResponse>(error)) return undefined
  const data = error.response?.data
  return data &&
    ['ORDER_CREATION_UNCONFIRMED', 'ORDER_CREATION_ERROR'].includes(data.code)
    ? data.errandId
    : undefined
}
export const orderErrorReason = (error: unknown): string | undefined => {
  switch (getApiErrorCode(error)) {
    case 'ORDER_CREATION_UNCONFIRMED':
      return 'Creation is not confirmed. Check the order and retry if needed.'
    case 'ORDER_CREATION_ERROR':
      return 'Unable to finish creating this errand. Check its current status.'
    case 'CREDIT_ACCOUNT_PENDING':
      return 'Your credit account is being prepared. Please wait and try again.'
    case 'ORDER_CONFLICT':
      return 'This errand has changed or the request conflicts with an earlier submission. Refresh to see its current status.'
    case 'FORBIDDEN':
      return 'You do not have permission to view or change this errand.'
    case 'DELIVERY_PHOTO_INVALID': {
      const message = isAxiosError<{ message?: unknown } | null | undefined>(
        error,
      )
        ? error.response?.data?.message
        : undefined
      return typeof message === 'string' && message.trim()
        ? message.trim()
        : 'This photo could not be used. Try a different JPEG or PNG.'
    }
    case 'ORDER_NOT_FOUND':
      return 'This errand could not be found.'
    case 'INVALID_REQUEST':
    case 'VALIDATION_FAILED':
      return 'Please check the request details.'
    case 'ORDER_REQUEST_FAILED': {
      const message = isAxiosError<{ message?: unknown } | null | undefined>(
        error,
      )
        ? error.response?.data?.message
        : undefined
      return typeof message === 'string' && message.trim()
        ? message.trim()
        : undefined
    }
    default:
      return undefined
  }
}
export const orderErrorMessage = (error: unknown) =>
  orderErrorReason(error) ?? 'Unable to complete the request. Please try again.'
export const inaccessibleOrder = (error: unknown) =>
  isAxiosError(error) && [401, 403, 404].includes(error.response?.status ?? 0)
export const definiteCreationRejection = (error: unknown) =>
  isAxiosError(error) &&
  [400, 401, 403, 404, 409].includes(error.response?.status ?? 0)
