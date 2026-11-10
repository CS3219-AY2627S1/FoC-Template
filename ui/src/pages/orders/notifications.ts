import { isAutomaticResolution, type Order } from './models'

export type OrderNotice = { id: string; title: string; message: string; order: Order }

// Only announce observed changes, not historical orders on initial load.
export const orderNotice = (previous: Order | undefined, order: Order, userId: string): OrderNotice | null => {
  if (!previous) return null
  if (order.requester_id !== userId && order.courier_id !== userId) return null
  const resolutions = order.disputes?.filter((case_) => case_.closed_at && previous.disputes?.some((prior) => prior.id === case_.id && !prior.closed_at)) ?? []
  const resolved = resolutions.find((case_) => !isAutomaticResolution(case_))
  if (resolved) {
    return { id: `${order.id}:dispute:${resolved.id}:resolved`, title: 'Dispute resolved by administrator', message: 'An administrator recorded a decision. View the resolution reason and current credit settlement on your order.', order }
  }
  if (previous.status === 'init' && order.status === 'open' && order.requester_id === userId) {
    return { id: `${order.id}:open`, title: 'Your request is up!', message: `${order.credits} credits have been reserved. They will only be taken once your order is completed.`, order }
  }
  const paymentConfirmed = order.credit_operation === 'TRANSFER' && order.credit_status === 'succeeded'
    && (previous.credit_operation !== 'TRANSFER' || previous.credit_status !== 'succeeded')
  if (paymentConfirmed && order.courier_id === userId) {
    return { id: `${order.id}:completed`, title: 'Credits received!', message: `${order.disputes?.some((case_) => case_.closed_at && case_.resolution === 'pay') ? 'Administrator-approved payment completed.' : 'Your delivery is complete.'} ${order.credits} credits have been added to your available balance.`, order }
  }
  const automatic = resolutions.find(isAutomaticResolution)
  if (automatic) {
    return { id: `${order.id}:dispute:${automatic.id}:resolved`, title: 'Payment issue resolved automatically', message: 'The credit service confirmed successful recovery. No administrator decision was needed. View the current credit settlement on your order.', order }
  }
  return null
}
