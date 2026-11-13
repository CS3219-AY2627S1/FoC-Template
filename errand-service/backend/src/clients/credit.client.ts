import type { ReserveCreditRequest } from '@relay/contracts'
import { ErrandErrors } from '@relay/contracts'
import { getEnv } from '../config/env.js'
import { ErrandServiceError } from '../types/errand.types.js'

export class CreditClient {
  async reserve(errandId: string, userId: string, amount: number): Promise<void> {
    const env = getEnv()
    const request: ReserveCreditRequest = {
      transactionReference: { service: 'errand', id: errandId, type: 'CREDIT_RESERVE' },
      userId,
      amount,
    }
    let response: Response
    try {
      response = await fetch(`${env.creditApiUrl}/internal/credit/reserve`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-credit-service-token': env.creditServiceToken,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new ErrandServiceError(
        ErrandErrors.INTERNAL_ERROR,
        'Credit reservation is unavailable; the errand will be recovered.',
        503,
      )
    }
    if (response.ok) return
    if (response.status === 422) {
      throw new ErrandServiceError(
        ErrandErrors.INSUFFICIENT_CREDIT,
        'Insufficient credit to create this errand.',
        422,
      )
    }
    throw new ErrandServiceError(
      ErrandErrors.INTERNAL_ERROR,
      'Credit reservation failed; the errand will be recovered.',
      503,
    )
  }
}
