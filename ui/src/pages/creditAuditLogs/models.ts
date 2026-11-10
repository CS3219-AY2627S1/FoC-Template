/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-10-27
Scope: Added credit audit-log types, descriptions, and timestamp formatting
Author review: I reviewed correctness and edited the changes to fit the project
*/

export type CreditAuditAction = 'INITIAL_ALLOCATION' | 'RESERVE' | 'RELEASE' | 'TRANSFER'
  | 'ADMIN_CHARGE_RESERVED' | 'ADMIN_COVER_RESERVED'

export type CreditAuditLog = {
  log_id: string
  user_id: string
  recipient_user_id: string | null
  order_id: string | null
  action: CreditAuditAction
  amount: number
  created_at: string
  reason: string | null
  actor_id: string | null
  request_id: string | null
  before: Record<string, number> | null
  after: Record<string, number> | null
}

const actionDetails = {
  INITIAL_ALLOCATION: { label: 'Initial allocation', description: 'Welcome credits added to your available balance.' },
  RESERVE: { label: 'Credits reserved', description: 'Moved from your available balance to reserved credits.' },
  RELEASE: { label: 'Credits released', description: 'Returned from reserved credits to your available balance.' },
  ADMIN_CHARGE_RESERVED: { label: 'Reservation funded', description: 'Your available credits were used to cover a reservation shortfall.' },
  ADMIN_COVER_RESERVED: { label: 'Reservation covered', description: 'The platform funded a reservation shortfall without charging you.' },
}

export const creditAuditDetails = (log: CreditAuditLog, userId: string) => {
  if (log.action === 'TRANSFER') {
    return log.recipient_user_id === userId
      ? { label: 'Credits received', description: 'Payment added to your available balance.' }
      : { label: 'Credits sent', description: 'Courier paid from your reserved credits.' }
  }
  return actionDetails[log.action]
}

export const creditAuditTimestamp = (createdAt: string) =>
  /(?:Z|[+-]\d{2}:\d{2})$/i.test(createdAt) ? createdAt : `${createdAt}Z`
