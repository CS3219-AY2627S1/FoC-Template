import { afterEach, expect, it, vi } from 'vitest'
import { supplierFetch } from './client'

const session = {
  accessToken: 'signed.jwt',
  tokenType: 'Bearer',
  expiresAt: '2030-01-01T00:15:00Z',
  userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993',
  username: 'Admin',
  role: 'ADMIN',
}

afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

it('adds the shared bearer token to Supplier requests', async () => {
  sessionStorage.setItem('foc.user-session', JSON.stringify(session))
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetchMock)
  await supplierFetch(new Request('http://localhost/api/admin/suppliers'))
  const request = fetchMock.mock.calls[0]?.[0] as Request
  expect(request.headers.get('Authorization')).toBe('Bearer signed.jwt')
})

it('allows public reads without a session', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetchMock)
  await supplierFetch(new Request('http://localhost/api/suppliers'))
  const request = fetchMock.mock.calls[0]?.[0] as Request
  expect(request.headers.has('Authorization')).toBe(false)
})

it('clears the session when a protected request returns 401', async () => {
  sessionStorage.setItem('foc.user-session', JSON.stringify(session))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 401 })),
  )
  await supplierFetch(new Request('http://localhost/api/admin/suppliers'))
  expect(sessionStorage.getItem('foc.user-session')).toBeNull()
})

it('retains the session and reports access denied when authorization returns 403', async () => {
  sessionStorage.setItem('foc.user-session', JSON.stringify(session))
  const denied = vi.fn()
  window.addEventListener('foc:access-denied', denied)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 403 })),
  )
  await supplierFetch(new Request('http://localhost/api/admin/suppliers'))
  expect(sessionStorage.getItem('foc.user-session')).not.toBeNull()
  expect(denied).toHaveBeenCalledOnce()
  window.removeEventListener('foc:access-denied', denied)
})
