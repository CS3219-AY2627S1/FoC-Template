import type { CreateErrandValues } from '../schemas/createErrand.schema'
import type { CreateOrderRequest } from '../types/errand.types'

export type PendingCreation = {
  userId: string
  input: CreateOrderRequest
  values: CreateErrandValues
}
const key = (userId: string) => `foc:pending-creation:${userId}`
export const saveCreation = (pending: PendingCreation) => {
  try {
    localStorage.setItem(key(pending.userId), JSON.stringify(pending))
    return true
  } catch {
    return false
  }
}
export const loadCreation = (userId: string): PendingCreation | null => {
  try {
    const pending = JSON.parse(
      localStorage.getItem(key(userId)) ?? 'null',
    ) as PendingCreation | null
    return pending?.userId === userId &&
      typeof pending.input.createRequestId === 'string' &&
      pending.values.pickup
      ? pending
      : null
  } catch {
    return null
  }
}
export const clearCreation = (userId: string, requestId?: string) => {
  if (requestId && loadCreation(userId)?.input.createRequestId !== requestId)
    return
  try {
    localStorage.removeItem(key(userId))
  } catch {
    /* Storage may be unavailable. */
  }
}
export const newCreation = (
  userId: string,
  values: CreateErrandValues,
): PendingCreation => ({
  userId,
  values,
  input: {
    createRequestId: crypto.randomUUID(),
    supplierId: values.pickup!.id,
    deliveryLocation: values.deliveryLocation,
    description: values.description,
    notes: values.notes,
    creditReward: values.creditReward,
    expiryMinutes: values.expiryMinutes,
  },
})
