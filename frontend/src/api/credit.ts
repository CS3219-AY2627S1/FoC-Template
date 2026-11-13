// Frontend API client for the credit service.
import client from './http'

export type CreditHoldStatus = 'HELD' | 'RELEASED' | 'REFUNDED'

// credits the user can spend; credits on hold are already deducted
export interface CreditBalance {
  userId: number
  balance: number
}

// credits set aside for one errand the user requested: HELD until the errand ends,
// then RELEASED to the courier (completed) or REFUNDED to the requester (cancelled or expired)
export interface CreditHold {
  errandId: number
  requestorId: number
  courierId: number
  amount: number
  status: CreditHoldStatus
}

export async function getBalance (userId: number | string) {
  const response = await client.get<CreditBalance>(`/public/credit/credits/${userId}/balance`)
  return response.data
}

// every hold on errands this user requested, whatever its status
export async function listHolds (userId: number | string) {
  const response = await client.get<CreditHold[]>(`/public/credit/credits/${userId}/transactions`)
  return response.data
}
