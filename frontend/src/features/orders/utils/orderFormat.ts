import type { Errand, ErrandStatus } from '../types/errand.types'

export const formatOrderTime = (value: string) =>
  new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore',
  }).format(new Date(value))
export const expiryLabel = (minutes: number) =>
  minutes === 30
    ? '30 minutes'
    : `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`
export const remainingTime = (expiresAt: string, now: number) => {
  const minutes = Math.ceil((Date.parse(expiresAt) - now) / 60000)
  return minutes <= 0 ? 'Acceptance period ended' : `Expires in ${minutes} min`
}

export const statusLabels: Record<ErrandStatus, string> = {
  CREATING: 'Creating',
  CREATE_FAILED: 'Creation failed',
  OPEN: 'Open',
  ACCEPTED: 'Accepted',
  PICKED_UP: 'Picked up',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}

// can request post again ended errand with same info
export const canRequestAgain = (order: Errand, userId: string) =>
  order.requester.id === userId &&
  ['COMPLETED', 'CANCELLED', 'EXPIRED', 'CREATE_FAILED'].includes(order.status)

// adjust the errand id be more readable
export const shortOrderId = (id: string) => id.split('-')[0].toUpperCase()
