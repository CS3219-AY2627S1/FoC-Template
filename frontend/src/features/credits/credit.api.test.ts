import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticatedFetch } from '../auth/auth.fetch'
import { getAvailableBalance } from './credit.api'

vi.mock('../auth/auth.fetch', () => ({
  authenticatedFetch: vi.fn(),
}))

const authenticatedFetchMock = vi.mocked(authenticatedFetch)

describe('getAvailableBalance', () => {
  beforeEach(() => authenticatedFetchMock.mockReset())

  it('loads the authenticated wallet balance and forwards cancellation', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ availableBalance: 30 }), { status: 200 }),
    )
    const signal = new AbortController().signal

    await expect(getAvailableBalance(signal)).resolves.toBe(30)

    const baseUrl = (import.meta.env.VITE_CREDIT_API_URL ?? '').trim().replace(/\/+$/, '')
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/wallets/availableBalance`,
      { headers: { Accept: 'application/json' }, signal },
    )
  })

  it('uses problem details for an unsuccessful response', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Wallet not found' }), { status: 404 }),
    )

    await expect(getAvailableBalance()).rejects.toMatchObject({
      name: 'CreditApiError',
      message: 'Wallet not found',
      status: 404,
    })
  })
})
