import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshSession } from './auth.api'
import { authenticatedFetch } from './auth.fetch'
import { clearAccessToken, getAccessToken, setAccessToken } from './auth.token'

vi.mock('./auth.api', () => ({
  refreshSession: vi.fn(),
}))

const fetchMock = vi.fn<typeof fetch>()
const refreshSessionMock = vi.mocked(refreshSession)

describe('authenticatedFetch', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    refreshSessionMock.mockReset()
    clearAccessToken()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('refreshes once after a 401 and retries with the new access token', async () => {
    setAccessToken('expired-token')
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    refreshSessionMock.mockResolvedValue({
      accessToken: 'new-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    })

    const response = await authenticatedFetch('http://supplier.test/suppliers')

    expect(response.status).toBe(200)
    expect(refreshSessionMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer expired-token',
    )
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe(
      'Bearer new-token',
    )
  })

  it('clears the access token when cookie refresh is rejected', async () => {
    setAccessToken('expired-token')
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }))
    refreshSessionMock.mockRejectedValue(new Error('expired refresh token'))

    const response = await authenticatedFetch('http://supplier.test/suppliers')

    expect(response.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBeNull()
  })
})
