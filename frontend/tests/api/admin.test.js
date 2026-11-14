/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Tests for sendAdminOtp/verifyAdminOtp/resendAdminOtp (api/admin.js), per
 *        instructions.md Stage 27c: the request shape sent to each of the three
 *        /admin/*-otp endpoints, and that Elevated-Token is attached when a token is held
 *        (the stage's "the three admin OTP calls send Elevated-Token when a token is held"
 *        rule) and omitted when none is. api/http's request is mocked; utils/elevation is the
 *        real module (its own storage/validation logic has its own tests).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/api/http', async () => {
  const actual = await vi.importActual('../../src/api/http')
  return { ...actual, request: vi.fn() }
})

import { request } from '../../src/api/http'
import { resendAdminOtp, sendAdminOtp, verifyAdminOtp } from '../../src/api/admin'
import { clearElevationToken, setElevationToken } from '../../src/utils/elevation'

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

describe('sendAdminOtp', () => {
  it('posts { purpose: "admin_action" } with no Elevated-Token when none is held', async () => {
    request.mockResolvedValueOnce({ message: 'sent', code: 'OTP_SENT' })

    await sendAdminOtp()

    expect(request).toHaveBeenCalledWith('/admin/send-otp', {
      method: 'POST',
      headers: {},
      json: { purpose: 'admin_action' },
    })
  })

  it('attaches Elevated-Token when a (possibly stale) token is held', async () => {
    const token = fakeToken()
    setElevationToken(token)
    request.mockResolvedValueOnce({ message: 'sent', code: 'OTP_SENT' })

    await sendAdminOtp()

    expect(request).toHaveBeenCalledWith('/admin/send-otp', {
      method: 'POST',
      headers: { 'Elevated-Token': token },
      json: { purpose: 'admin_action' },
    })
  })
})

describe('verifyAdminOtp', () => {
  it('posts { otp, purpose: "admin_action" } and returns the elevation token', async () => {
    request.mockResolvedValueOnce({ elevationToken: 'the-new-token' })

    const result = await verifyAdminOtp('123456')

    expect(request).toHaveBeenCalledWith('/admin/verify-otp', {
      method: 'POST',
      headers: {},
      json: { otp: '123456', purpose: 'admin_action' },
    })
    expect(result).toEqual({ elevationToken: 'the-new-token' })
  })
})

describe('resendAdminOtp', () => {
  it('posts { purpose: "admin_action" }', async () => {
    request.mockResolvedValueOnce({ message: 'sent', code: 'OTP_SENT' })

    await resendAdminOtp()

    expect(request).toHaveBeenCalledWith('/admin/resend-otp', {
      method: 'POST',
      headers: {},
      json: { purpose: 'admin_action' },
    })
  })
})
