import type { Order, OrderStatus } from '@/api/order/order'

// What each status change the order-service allows is called, and what the student is told after
// it. Shared by the errand cards and the errand page, so both show the same buttons and texts.
// Which of these an account may do comes from the service (allowed_transitions), never from here.
export const STATUS_ACTIONS: Partial<
  Record<OrderStatus, { label: (order: Order) => string; success: string; confirm?: (order: Order) => string }>
> = {
  Cancelled: {
    label: () => 'Cancel request',
    confirm: () => 'Cancel this errand? Your reserved credits will be released.',
    success: 'Errand cancelled. Your credits are being released.',
  },
  PickedUp: { label: () => 'Mark picked up', success: 'Marked as picked up.' },
  Delivered: { label: () => 'Mark delivered', success: 'Marked as delivered. Waiting for the requester to confirm.' },
  Completed: {
    label: (order) => `Confirm delivery / Pay courier ${order.credit_reward} credits`,
    confirm: (order) => `Confirm you received everything? ${order.credit_reward} credits go to your courier.`,
    success: 'Delivery confirmed. Credits are on their way to your courier.',
  },
}

export const ACCEPT_LABEL = 'Accept errand'
