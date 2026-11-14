/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Test for getFullEmail (GET /users/:id/full-email), per instructions.md Stage 20b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 26c/26e - getFullEmail is now POST with a reason body, replacing the GET call.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Per author direction in chat (instructions.md Stage 26 "Reasons" amendment):
 *        getFullEmail no longer takes or sends a reason; its request body is now empty.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 27c of instructions.md - tests for updateUserStatus/updateUserRole attaching
 *        Elevated-Token when a token is held (and sending no such header when none is), and
 *        clearing the stored token on an ELEVATION_REQUIRED response, per the stage's "a token
 *        rejected with ELEVATION_REQUIRED is also removed" rule. Switched the api/http mock to
 *        spread the real module (vi.importActual) rather than replacing it outright, so
 *        decodeAccessTokenClaims - which utils/elevation.js needs to validate a token's exp -
 *        stays real instead of undefined.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/api/http', async () => {
  const actual = await vi.importActual('../../src/api/http')
  return { ...actual, request: vi.fn() }
})

import { request } from '../../src/api/http'
import { getFullEmail, updateUserRole, updateUserStatus } from '../../src/api/users'
import { clearElevationToken, getElevationToken, setElevationToken } from '../../src/utils/elevation'

function fakeToken(expiresInSeconds = 900) {
  const b64 = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  const payload = { sub: 'admin-1', role: 'admin', sid: 'sid-1', exp: Math.floor(Date.now() / 1000) + expiresInSeconds }
  return b64({ alg: 'RS256', typ: 'ep+JWT' }) + '.' + b64(payload) + '.signature'
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearElevationToken()
})

describe('getFullEmail', () => {
  it('calls POST /users/:id/full-email with no body and returns the response', async () => {
    request.mockResolvedValueOnce({ email: 'alice@example.com' })

    const result = await getFullEmail('user-1')

    expect(request).toHaveBeenCalledWith('/users/user-1/full-email', {
      method: 'POST',
      json: {},
    })
    expect(result).toEqual({ email: 'alice@example.com' })
  })
})

describe('updateUserStatus / updateUserRole elevation (Stage 27c)', () => {
  it('sends no Elevated-Token header when none is held', async () => {
    request.mockResolvedValueOnce({ id: 'user-1', status: 'suspended' })

    await updateUserStatus('user-1', 'suspended', { reason: 'FRAUD_OR_SCAM' })

    expect(request).toHaveBeenCalledWith('/users/user-1/status', {
      method: 'PUT',
      headers: {},
      json: { status: 'suspended', reason: 'FRAUD_OR_SCAM' },
    })
  })

  it('attaches Elevated-Token when a token is held (status)', async () => {
    const token = fakeToken()
    setElevationToken(token)
    request.mockResolvedValueOnce({ id: 'user-1', status: 'suspended' })

    await updateUserStatus('user-1', 'suspended', { reason: 'FRAUD_OR_SCAM' })

    expect(request).toHaveBeenCalledWith('/users/user-1/status', {
      method: 'PUT',
      headers: { 'Elevated-Token': token },
      json: { status: 'suspended', reason: 'FRAUD_OR_SCAM' },
    })
  })

  it('attaches Elevated-Token when a token is held (role)', async () => {
    const token = fakeToken()
    setElevationToken(token)
    request.mockResolvedValueOnce({ id: 'user-1', role: 'admin' })

    await updateUserRole('user-1', 'admin', { reason: 'APPOINTED_MODERATOR' })

    expect(request).toHaveBeenCalledWith('/users/user-1/role', {
      method: 'PUT',
      headers: { 'Elevated-Token': token },
      json: { role: 'admin', reason: 'APPOINTED_MODERATOR' },
    })
  })

  it('clears a stored token when the status call comes back ELEVATION_REQUIRED', async () => {
    setElevationToken(fakeToken())
    request.mockRejectedValueOnce({ code: 'ELEVATION_REQUIRED' })

    await expect(updateUserStatus('user-1', 'suspended', { reason: 'FRAUD_OR_SCAM' })).rejects.toEqual({
      code: 'ELEVATION_REQUIRED',
    })
    expect(getElevationToken()).toBeNull()
  })

  it('clears a stored token when the role call comes back ELEVATION_REQUIRED', async () => {
    setElevationToken(fakeToken())
    request.mockRejectedValueOnce({ code: 'ELEVATION_REQUIRED' })

    await expect(updateUserRole('user-1', 'admin', { reason: 'APPOINTED_MODERATOR' })).rejects.toEqual({
      code: 'ELEVATION_REQUIRED',
    })
    expect(getElevationToken()).toBeNull()
  })

  it('leaves other errors untouched (no token to clear)', async () => {
    request.mockRejectedValueOnce({ code: 'USER_NOT_FOUND' })

    await expect(updateUserStatus('user-1', 'suspended', { reason: 'FRAUD_OR_SCAM' })).rejects.toEqual({
      code: 'USER_NOT_FOUND',
    })
  })
})
