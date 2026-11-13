import { afterEach, expect, test, vi } from 'vitest'

import { api } from './client'
import { clearSession, saveSession } from '../auth/session'

afterEach(() => {
  clearSession()
  vi.restoreAllMocks()
})

test('attaches the browser session token through the shared API client', async () => {
  saveSession({
    accessToken: 'signed.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

  await api.register({ email: 'alice@u.nus.edu', username: 'Alice', password: '123456789012345' })
  await api.getProfile()
  await api.changePassword({ currentPassword: 'current-password', newPassword: 'replacement-password-with-15-chars' })

  const [, options] = vi.mocked(fetch).mock.calls[2]
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/users/me', expect.objectContaining({ method: 'GET' }))
  expect(fetch).toHaveBeenNthCalledWith(3, '/api/users/me/password', expect.objectContaining({ method: 'PATCH' }))
  expect((options?.headers as Headers).get('Authorization')).toBe('Bearer signed.jwt')
})

test('changes a username through the shared authenticated API client', async () => {
  saveSession({
    accessToken: 'signed.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ username: 'Alice Tan' }) }))

  await api.changeUsername({ username: 'Alice Tan' })

  expect(fetch).toHaveBeenCalledWith('/api/users/me/username', expect.objectContaining({ method: 'PATCH' }))
  const [, options] = vi.mocked(fetch).mock.calls[0]
  expect((options?.headers as Headers).get('Authorization')).toBe('Bearer signed.jwt')
})

test('activates the signed-in user credit account through the shared gateway', async () => {
  saveSession({
    accessToken: 'signed.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ availableBalance: 10 }) }))

  await api.activateCreditAccount()

  expect(fetch).toHaveBeenCalledWith('/api/credits/me', expect.objectContaining({ method: 'POST' }))
  const [, options] = vi.mocked(fetch).mock.calls[0]
  expect((options?.headers as Headers).get('Authorization')).toBe('Bearer signed.jwt')
})

test('handles password reset responses with no response body', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 202 })
    .mockResolvedValueOnce({ ok: true, status: 204 })
    .mockResolvedValueOnce({ ok: true, status: 204 }))

  await api.requestPasswordReset({ email: 'alice@u.nus.edu' })
  await api.verifyPasswordReset({ email: 'alice@u.nus.edu', code: '123456' })
  await api.confirmPasswordReset({ email: 'alice@u.nus.edu', code: '123456', password: 'new-password-with-15-chars' })

  expect(fetch).toHaveBeenNthCalledWith(1, '/api/users/password-reset-requests', expect.objectContaining({ method: 'POST' }))
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/users/password-reset-verifications', expect.objectContaining({ method: 'POST' }))
  expect(fetch).toHaveBeenNthCalledWith(3, '/api/users/password-reset-confirmations', expect.objectContaining({ method: 'POST' }))
})

test('uses the server-provided password reset resend cooldown', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
    headers: new Headers({ 'Retry-After': '42' }),
  }))

  await expect(api.requestPasswordReset({ email: 'alice@u.nus.edu' })).resolves.toBe(42)
})

test('handles email verification and resend responses with no response body', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 204 })
    .mockResolvedValueOnce({ ok: true, status: 202 }))

  await api.verifyEmail({ email: 'alice@u.nus.edu', code: '123456' })
  await api.resendEmailVerification({ email: 'alice@u.nus.edu' })

  expect(fetch).toHaveBeenNthCalledWith(1, '/api/users/email-verifications', expect.objectContaining({ method: 'POST' }))
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/users/email-verification-resends', expect.objectContaining({ method: 'POST' }))
})

test('uses the protected administrator account APIs', async () => {
  saveSession({
    accessToken: 'admin.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Admin', role: 'ADMIN',
    availableRoles: ['REQUESTER', 'ADMIN'],
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [] }) }))

  await api.listAdminAccounts('alice', 1, 10)
  await api.setAdministrator('target-id', true)
  await api.setAccountStatus('target-id', 'BANNED')

  expect(fetch).toHaveBeenNthCalledWith(1, '/api/users/admin/accounts?page=1&size=10&query=alice', expect.objectContaining({ method: 'GET' }))
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/users/admin/accounts/target-id/role', expect.objectContaining({ method: 'PATCH' }))
  expect(fetch).toHaveBeenNthCalledWith(3, '/api/users/admin/accounts/target-id/status', expect.objectContaining({ method: 'PATCH' }))
  for (const [, options] of vi.mocked(fetch).mock.calls) {
    expect((options?.headers as Headers).get('Authorization')).toBe('Bearer admin.jwt')
  }
})
