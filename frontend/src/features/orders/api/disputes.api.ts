import { axiosClient } from '#/lib/axiosClient'
import type {
  DisputeDecision,
  DisputePage,
  OrderDispute,
} from '../types/dispute.types'

const timeout = 15_000
export const reportDispute = async (orderId: string, complaint: string) =>
  (
    await axiosClient.post<OrderDispute>(
      `/orders/${orderId}/disputes`,
      { complaint },
      { timeout },
    )
  ).data

export const listDisputes = async (page: number, signal?: AbortSignal) =>
  (
    await axiosClient.get<DisputePage>('/orders/disputes', {
      params: { page, size: 20 },
      signal,
      timeout,
    })
  ).data

export const respondToDispute = async (id: string, response: string) =>
  (
    await axiosClient.post<OrderDispute>(
      `/orders/disputes/${id}/response`,
      { response },
      { timeout },
    )
  ).data

export const resolveDispute = async (
  id: string,
  decision: DisputeDecision,
  explanation: string,
) =>
  (
    await axiosClient.post<OrderDispute>(
      `/orders/disputes/${id}/resolve`,
      { decision, explanation },
      { timeout },
    )
  ).data
