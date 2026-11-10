import type { Supplier } from '../suppliers/models'
import type { CaseAction, CreditOperation, CreditRejectionReason } from '../../api/orderOperations'

export type OrderStatus = 'init' | 'open' | 'accepted' | 'picked_up' | 'delivered' | 'received' | 'completed' | 'cancelled' | 'expired' | 'rejected'
export type Dispute = { id: string; order_id: string; kind: 'fulfilment' | 'financial'; reason: string; opened_by: string | null; created_at: string; closed_at: string | null; closed_by: string | null; resolution: 'refund' | 'pay' | 'recovered' | null; resolution_reason: string | null; available_actions?: CaseAction[] }
export const hasOpenDispute = (order: Order) => order.disputes?.some((case_) => !case_.closed_at) ?? false
export type OrderItem = { name: string; quantity: number }
export type Order = {
  id: string
  requester_id: string
  courier_id: string | null
  supplier_id: string
  supplier_snapshot: Supplier | null
  items: OrderItem[]
  pickup_notes: string | null
  credits: number
  status: OrderStatus
  credit_status: 'pending' | 'succeeded' | 'rejected'
  credit_operation: CreditOperation
  disputes: Dispute[]
  available_actions: (OrderAction | 'dispute')[]
  is_active: boolean
  review_category: 'fulfilment' | 'financial' | 'history'
  credit_reason?: CreditRejectionReason | null
  status_reason: string | null
  progress_due_at: string | null
  settlement_due_at: string | null
  created_at: string
  expires_at: string
  accepted_at: string | null
  updated_at: string
}
export type CreateOrderRequest = {
  supplier_id: string
  items: OrderItem[]
  pickup_notes: string | null
  credits: number
}
export type CreditBalance = { available_credits: number; reserved_credits: number }
export type OrderAction = 'accept' | 'cancel' | 'pickup' | 'deliver' | 'receive'

export const statusLabels: Record<OrderStatus, string> = {
  init: 'Reserving credits', open: 'Pending', accepted: 'Accepted', picked_up: 'Picked up',
  delivered: 'Delivered', received: 'Settlement outstanding', completed: 'Completed',
  cancelled: 'Cancelled', expired: 'Expired', rejected: 'Credit reservation declined',
}
export type OrderFilter = 'all' | 'disputed' | 'active' | 'finished'
export type OrderSort = 'newest' | 'oldest'
export const filterPersonalOrders = (orders: Order[], filter: OrderFilter, sort: OrderSort) =>
  orders.filter((order) => filter === 'all' || (filter === 'disputed' ? hasOpenDispute(order) : filter === 'active' ? order.is_active : !order.is_active))
    .sort((a, b) => (sort === 'oldest' ? Date.parse(a.created_at) - Date.parse(b.created_at) : Date.parse(b.created_at) - Date.parse(a.created_at)) || a.id.localeCompare(b.id))

export const disputeStatus = (case_: Dispute): 'open' | 'resolved' => case_.closed_at ? 'resolved' : 'open'
export const isAutomaticResolution = (case_: Dispute) => case_.resolution === 'recovered'
export const resolutionLabel = (case_: Dispute) => isAutomaticResolution(case_) ? 'Payment investigation automatically resolved' : case_.resolution === 'refund' ? 'Refund requester approved' : case_.resolution === 'pay' ? 'Courier payment approved' : 'Financial review closed'
export const settlementLabel = (order: Order) => {
  if (order.credit_operation === 'RESERVE' && order.credit_status === 'rejected' && order.credit_reason === 'ACCOUNT_NOT_FOUND') {
    return 'Wallet not ready — please submit a new order shortly'
  }
  const operation = order.credit_operation === 'RELEASE' ? 'Refund' : order.credit_operation === 'TRANSFER' ? 'Courier payment' : 'Credit reservation'
  return `${operation} ${order.credit_status === 'pending' ? 'processing' : order.credit_status === 'succeeded' ? 'completed' : order.credit_operation === 'RESERVE' ? 'declined' : 'rejected — needs financial review'}`
}

export const orderDeadline = (order: Order): { at: string; label: string; settlement: boolean } | null => {
  if (order.credit_operation !== 'RESERVE' && order.credit_status === 'pending' && order.settlement_due_at) {
    return { at: order.settlement_due_at, label: 'Credit settlement', settlement: true }
  }
  if (order.progress_due_at) {
    return { at: order.progress_due_at, label: order.status === 'accepted' ? 'Pickup' : order.status === 'picked_up' ? 'Delivery' : 'Receipt confirmation', settlement: false }
  }
  return null
}

export const isUnaccepted = (order: Order) => order.status === 'open' || order.status === 'init'
export const remainingSeconds = (order: Order, now: number) => Math.max(0, Math.ceil((Date.parse(order.expires_at) - now) / 1000))

export const matchesOpenFilters = (order: Order, now: number, location: string, minCredits: string, maxCredits: string) => {
  const pickup = `${order.supplier_snapshot?.name ?? ''} ${order.supplier_snapshot?.building ?? ''}`.toLowerCase()
  return order.status === 'open' && remainingSeconds(order, now) > 0 && pickup.includes(location.trim().toLowerCase()) && (!minCredits || order.credits >= Number(minCredits)) && (!maxCredits || order.credits <= Number(maxCredits))
}
