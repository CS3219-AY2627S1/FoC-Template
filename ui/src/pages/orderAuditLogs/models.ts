/*
AI Assistance Disclosure:
Tool: Gemini, date: 2026-10-29
Scope: Added order audit-log types, descriptions, and timestamp formatting
Author review: I reviewed correctness and edited the changes to fit the project
*/

export type OrderAuditAction =
  | 'open' | 'accepted' | 'picked_up' | 'delivered'
  | 'received' | 'completed' | 'cancelled' | 'expired'
  | 'disputed' | 'init' | 'rejected'

export type OrderAuditLog = {
  log_id: string
  order_id: string
  actor_id: string | null
  action: OrderAuditAction
  reason: string | null
  created_at: string
}

const actionDetails: Record<OrderAuditAction, { label: string, description: string }> = {
  init: { label: 'Order initialized', description: 'The order request was created and pending reservation.' },
  open: { label: 'Order published', description: 'The order is now open for couriers to accept.' },
  accepted: { label: 'Order accepted', description: 'A courier has accepted the order.' },
  picked_up: { label: 'Order picked up', description: 'The courier has picked up the items.' },
  delivered: { label: 'Order delivered', description: 'The items have been delivered to the destination.' },
  received: { label: 'Order received', description: 'The requester confirmed receipt and settled the payment.' },
  completed: { label: 'Order completed', description: 'The order process is fully complete.' },
  cancelled: { label: 'Order cancelled', description: 'The order was cancelled and credits were released.' },
  expired: { label: 'Order expired', description: 'The order was not fulfilled within the time limit.' },
  disputed: { label: 'Order disputed', description: 'The order was disputed and frozen for review.' },
  rejected: { label: 'Order rejected', description: 'The order was rejected by the system.' },
}

export const orderAuditDetails = (log: OrderAuditLog) => {
  return actionDetails[log.action] || {
    label: log.action.toUpperCase(),
    description: `Order status updated to ${log.action}.`
  }
}

export const orderAuditTimestamp = (createdAt: string) =>
  /(?:Z|[+-]\d{2}:\d{2})$/i.test(createdAt) ? createdAt : `${createdAt}Z`