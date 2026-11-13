import { afterEach, expect, it, vi } from 'vitest'

import { refreshSession } from '../api/refreshSession.api'
import type { AccessTokenResponse } from '../types/auth.types'
import {
  getAccessToken,
  getCurrentUserId,
  setAccessToken,
} from './accessTokenStore'
import { invalidateRefresh, refreshAccessToken } from './refreshAccessToken'
import { AuthRequestError } from './authRequest'

vi.mock('../api/refreshSession.api', () => ({ refreshSession: vi.fn() }))

const token = (sub: string, revision: number) =>
  `header.${btoa(JSON.stringify({ sub, revision }))}.signature`

afterEach(() => {
  setAccessToken(null)
  vi.mocked(refreshSession).mockReset()
})

it.each(['success', '401', 'service error'])(
  'does not overwrite a new login with an obsolete refresh %s',
  async (outcome) => {
    let resolve!: (value: AccessTokenResponse) => void
    let reject!: (error: unknown) => void
    vi.mocked(refreshSession).mockReturnValue(
      new Promise((done, fail) => {
        resolve = done
        reject = fail
      }),
    )
    const pending = refreshAccessToken()
    expect(invalidateRefresh()).toBe(pending)
    setAccessToken('new-login')

    if (outcome === 'success')
      resolve({ accessToken: 'stale', expiresAt: 'unused' })
    else reject(new AuthRequestError(outcome === '401' ? 401 : 502))

    expect(await pending).toBe('new-login')
    expect(getAccessToken()).toBe('new-login')
  },
)

it('rotates the token while preserving the user identity', async () => {
  setAccessToken(token('A', 1))
  const next = token('A', 2)
  vi.mocked(refreshSession).mockResolvedValue({
    accessToken: next,
    expiresAt: 'unused',
  })

  expect(await refreshAccessToken()).toBe(next)
  expect(getAccessToken()).toBe(next)
  expect(getCurrentUserId()).toBe('A')
})

it('rejects a refreshed identity from another account before installing its token', async () => {
  const original = token('A', 1)
  setAccessToken(original)
  vi.mocked(refreshSession).mockResolvedValue({
    accessToken: token('B', 1),
    expiresAt: 'unused',
  })

  await expect(refreshAccessToken()).rejects.toMatchObject({
    name: 'AuthRequestError',
    status: 401,
  })
  expect(getAccessToken()).toBe(original)
})

it('allows initial cookie recovery when there is no previous identity', async () => {
  setAccessToken(null)
  const restored = token('B', 1)
  vi.mocked(refreshSession).mockResolvedValue({
    accessToken: restored,
    expiresAt: 'unused',
  })

  expect(await refreshAccessToken()).toBe(restored)
  expect(getAccessToken()).toBe(restored)
})
