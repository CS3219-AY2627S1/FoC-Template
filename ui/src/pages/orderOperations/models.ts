import type { Dispute, Order } from '../orders/models'

import type { CreditAccount, FinancialAudit } from '../../api/orderOperations'

export type OperationsFilter = 'all' | 'fulfilment' | 'financial' | 'history'

export const caseTitle = (case_: Dispute) => case_.kind === 'financial' ? 'Payment investigation'
  : case_.opened_by ? 'Reported fulfilment problem' : 'Fulfilment overdue'

export const reporterRole = (order: Order, case_: Dispute) => !case_.opened_by ? 'System review'
  : case_.opened_by === order.courier_id ? 'Courier · reporting this problem'
    : case_.opened_by === order.requester_id ? 'Requester · reporting this problem' : 'Reported problem'

export const heldMismatch = (account: CreditAccount) => !account.missing && !account.consistent

export const rejectionGuidance = (reason?: string | null) => ({
  BALANCE_INCONSISTENT: 'Investigate the confirmed mismatch. For missing held credits, choose whether to charge the requester again or have the platform cover them, then retry the rejected operation.',
  INSUFFICIENT_CREDITS: 'Insufficient funds are not proof of corruption. Establish entitlement before considering any credit adjustment.',
  ACCOUNT_NOT_FOUND: 'Investigate the missing credit account. A balance adjustment alone cannot create the account.',
  RESERVATION_NOT_FOUND: 'Inspect the reservation and earlier outcomes. Do not invent replacement held funds.',
  RESERVATION_CONFLICT: 'The reservation conflicts with this operation. Inspect its owner, amount and settlement history.',
  ALREADY_TRANSFERRED: 'Funds were already transferred. Inspect the settlement; retrying does not reverse it.',
  ALREADY_RELEASED: 'Funds were already released. Inspect the settlement; retrying does not reverse it.',
  INVALID_OPERATION: 'This operation needs technical investigation, not an arbitrary balance edit.',
}[reason ?? ''] ?? 'Investigate the recorded rejection before making any correction or retry.')

export const movementLabel = (entry: FinancialAudit, userId: string) => {
  const amount = `${entry.amount} credits`
  switch (entry.action) {
    case 'RESERVE': return `${amount} moved from available to held`
    case 'RELEASE': return `${amount} returned from held to available`
    case 'TRANSFER': return entry.recipient_user_id === userId ? `+${amount} received from requester` : `${amount} paid from held to courier`
    case 'ADMIN_CHARGE_RESERVED': return `${amount} charged from available to fund missing held credits`
    case 'ADMIN_COVER_RESERVED': return `${amount} newly issued by platform to cover missing held credits — requester not charged`
    default: return `${entry.action} · ${amount}`
  }
}

