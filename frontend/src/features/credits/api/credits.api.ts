import { axiosClient } from '#/lib/axiosClient'
import type { CreditBalance } from '../types/credit.types'

export const getCreditBalance = async (signal?: AbortSignal) =>
  (
    await axiosClient.get<CreditBalance>('/credits/me', {
      signal,
      timeout: 15_000,
    })
  ).data
