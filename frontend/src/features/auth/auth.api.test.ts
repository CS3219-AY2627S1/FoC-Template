/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-14
 * Scope (AI-15): Implemented and tested the requested create-account UI.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { login, logout, refreshSession, register } from './auth.api'

const fetchMock = vi.fn<typeof fetch>()
const expectedBaseUrl = (import.meta.env.VITE_USER_API_URL ?? '').trim().replace(/\/+$/, '')

function tokenResponse(accessToken: string) {
  return new Response(
    JSON.stringify({ accessToken, tokenType: 'Bearer', expiresIn: 900 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('authentication API', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('logs in with credentials enabled and does not expect a refresh token in JSON', async () => {
    fetchMock.mockResolvedValue(tokenResponse('access-token'))

    const response = await login({ email: 'student@u.nus.edu', password: 'password' })

    expect(response).toEqual({ accessToken: 'access-token', tokenType: 'Bearer', expiresIn: 900 })
    expect(fetchMock).toHaveBeenCalledWith(
      `${expectedBaseUrl}/auth/login`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'student@u.nus.edu', password: 'password' }),
      }),
    )
  })

  it('registers an account with the backlog fields', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }))

    await expect(
      register({
        name: 'Alex Tan',
        email: 'alex@u.nus.edu',
        password: 'CampusCouriers123!',
      }),
    ).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledWith(
      `${expectedBaseUrl}/auth/register`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          name: 'Alex Tan',
          email: 'alex@u.nus.edu',
          password: 'CampusCouriers123!',
        }),
      }),
    )
  })

  it('uses the browser cookie for refresh and logout', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse('refreshed-token'))
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(refreshSession()).resolves.toMatchObject({ accessToken: 'refreshed-token' })
    await expect(logout('access-token')).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${expectedBaseUrl}/auth/refresh`,
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${expectedBaseUrl}/auth/logout`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      }),
    )
  })
})
