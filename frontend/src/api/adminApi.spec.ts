/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Tests for the admin API request shapes.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  changeRole, getAccount, listAccounts, listAudit, listLoginEvents, restoreAccount, suspendAccount, verifyAuditChain,
} from './adminApi'

describe('admin API', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  })

  it('builds the list and lookup requests, leaving out empty filters', async () => {
    await listAccounts({ search: 'alice tan', status: 'SUSPENDED' }, null, 50)
    await listAccounts({}, 'cursor-id', 50)
    await getAccount('abc')
    await listLoginEvents({ accountId: 'abc' }, '42', 10)
    await listLoginEvents({ outcome: 'BLOCKED', reason: undefined }, null, 50)
    await listAudit({ targetId: 'abc' }, null, 10)
    await verifyAuditChain()
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/admin/accounts?search=alice+tan&status=SUSPENDED&limit=50',
      '/api/v1/admin/accounts?before=cursor-id&limit=50',
      '/api/v1/admin/accounts/abc',
      '/api/v1/admin/login-events?accountId=abc&before=42&limit=10',
      '/api/v1/admin/login-events?outcome=BLOCKED&limit=50',
      '/api/v1/admin/audit?targetId=abc&limit=10',
      '/api/v1/admin/audit/verify',
    ])
  })

  it('sends the actions with their reasons; an empty role-change reason is left out', async () => {
    await suspendAccount('abc', 'spam')
    await restoreAccount('abc', 'appeal accepted')
    await changeRole('abc', 'ADMINISTRATOR', '')
    await changeRole('abc', 'MEMBER', 'stepped down')
    const calls = vi.mocked(fetch).mock.calls
    expect(calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
      ['/api/v1/users/abc/suspend', 'POST', JSON.stringify({ reason: 'spam' })],
      ['/api/v1/users/abc/restore', 'POST', JSON.stringify({ reason: 'appeal accepted' })],
      ['/api/v1/users/abc/role', 'PUT', JSON.stringify({ role: 'ADMINISTRATOR' })],
      ['/api/v1/users/abc/role', 'PUT', JSON.stringify({ role: 'MEMBER', reason: 'stepped down' })],
    ])
  })
})
