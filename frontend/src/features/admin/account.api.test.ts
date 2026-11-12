/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
 * Scope (AI-28): Generated the account list endpoint, admin users page and their tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticatedFetch } from '../auth/auth.fetch'
import { userApiBaseUrl } from '../auth/auth.api'
import { AccountApiError, listAccounts, updateAccountType } from './account.api'

vi.mock('../auth/auth.fetch', () => ({ authenticatedFetch: vi.fn() }))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const emptyPage = { items: [], page: { number: 0, size: 10, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false } }

describe('account API', () => {
  beforeEach(() => { vi.mocked(authenticatedFetch).mockReset() })

  it('lists accounts with only the filters that are set', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(json(emptyPage))
    await listAccounts({ search: '  alice ', type: 'Student', page: 2, size: 10 })
    expect(vi.mocked(authenticatedFetch).mock.calls[0][0]).toBe(`${userApiBaseUrl}/api/v1/accounts?search=alice&type=Student&page=2&size=10`)

    vi.mocked(authenticatedFetch).mockResolvedValue(json(emptyPage))
    await listAccounts({ search: '   ' })
    expect(vi.mocked(authenticatedFetch).mock.calls[1][0]).toBe(`${userApiBaseUrl}/api/v1/accounts`)
  })

  it('changes the account type with a PATCH', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(json({ id: 'a 1', email: 'x@u.nus.edu', type: 'Administrator' }))
    await updateAccountType('a 1', 'Administrator')
    const [url, init] = vi.mocked(authenticatedFetch).mock.calls[0]
    expect(url).toBe(`${userApiBaseUrl}/api/v1/accounts/a%201`)
    expect(init).toMatchObject({ method: 'PATCH', body: '{"type":"Administrator"}' })
  })

  it('uses a plain-language message for known error statuses', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(json({ detail: 'Conflict' }, 409))
    await expect(updateAccountType('a', 'Student')).rejects.toEqual(new AccountApiError('At least one administrator must remain.', 409))
  })

  it("falls back to the service's own detail for other statuses", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(json({ detail: 'Something specific' }, 500))
    await expect(listAccounts({})).rejects.toThrow('Something specific')
  })

  it('reports a network failure as a connection error', async () => {
    vi.mocked(authenticatedFetch).mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(listAccounts({})).rejects.toThrow('Could not connect to the User Service.')
  })
})
