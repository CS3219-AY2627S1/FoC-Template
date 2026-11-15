/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Authenticated Credit query serialization tests for #65. Author review: Reviewed and approved by @phuc. */
import { afterEach, expect, it, vi } from 'vitest'
import { clearToken, saveToken } from '../auth/tokenStorage'
import { getCreditBalance, listCreditTransactions } from './creditApi'

afterEach(() => { clearToken(); vi.unstubAllGlobals() })

it('reads the unfiltered own balance using the authenticated client', async () => {
  saveToken('session-token')
  const balance = { available: 105, reserved: 0, total: 105 }
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(balance)))
  vi.stubGlobal('fetch', fetch)
  const controller = new AbortController()
  expect(await getCreditBalance(controller.signal)).toEqual(balance)
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/me/credit')
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer session-token')
  expect(fetch.mock.calls[0][1].signal).toBe(controller.signal)
})

it('calls the own-history route with auth, encoded offsets, pagination and cancellation', async () => {
  saveToken('session-token')
  const page = { items: [], page: 2, size: 50, totalItems: 0 }
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(page)))
  vi.stubGlobal('fetch', fetch)
  const controller = new AbortController()
  expect(await listCreditTransactions({ from: '2026-11-02T00:00:00+08:00', to: '2026-11-03T00:00:00+08:00', page: 2, size: 50 }, controller.signal)).toEqual(page)
  const [path, init] = fetch.mock.calls[0]
  const url = new URL(path, 'http://localhost')
  expect(url.pathname).toBe('/api/v1/me/credit/transactions')
  expect(url.searchParams.get('from')).toBe('2026-11-02T00:00:00+08:00')
  expect(url.searchParams.get('to')).toBe('2026-11-03T00:00:00+08:00')
  expect(url.searchParams.get('page')).toBe('2')
  expect(url.searchParams.get('size')).toBe('50')
  expect(url.searchParams.has('userId')).toBe(false)
  expect(init.headers.Authorization).toBe('Bearer session-token')
  expect(init.signal).toBe(controller.signal)
})

it('omits optional bounds instead of sending empty query values', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"items":[],"page":0,"size":20,"totalItems":0}'))
  vi.stubGlobal('fetch', fetch)
  await listCreditTransactions()
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/me/credit/transactions')
})
