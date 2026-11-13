import { isAxiosError } from 'axios'
import { orderErrorMessage } from './orderErrors'

export const disputeStatusLabels = {
  OPEN: 'Open',
  PROCESSING: 'Processing',
  RESOLVED: 'Resolved',
  NEEDS_ATTENTION: 'Needs attention',
}
export const disputeDecisionLabels = {
  PAY_COURIER: 'Pay courier',
  RELEASE_CREDITS: 'Cancel and release credits',
  DISMISS: 'Dismiss dispute',
}
export const disputeErrorMessage = (error: unknown) => {
  if (
    isAxiosError<{ code?: string; message?: string } | null | undefined>(
      error,
    ) &&
    ['ORDER_CONFLICT', 'ORDER_REQUEST_FAILED'].includes(
      error.response?.data?.code ?? '',
    )
  ) {
    return error.response?.data?.message ?? orderErrorMessage(error)
  }
  return orderErrorMessage(error)
}
