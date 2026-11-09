/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Tests for the Order Service request paths and bodies.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: N2 status and extract requests. Author review: Reviewed and approved by @mattis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createErrand,
  extractErrand,
  getErrand,
  getExtractionStatus,
  listMyErrands,
  listOpenErrands,
  runErrandAction,
} from './errandApi'

describe('errand API', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  })

  it('builds the list, detail and create requests', async () => {
    await listOpenErrands({ page: 2, size: 20 })
    await listMyErrands({ as: 'courier', state: 'PICKED_UP' })
    await listMyErrands({ as: 'requester' })
    await getErrand('abc')
    await createErrand({
      supplierId: 's',
      items: [{ name: 'Latte', quantity: 1 }],
      dropoffLocation: 'COM1',
      creditAmount: 5,
      listingDeadline: '2026-11-09T11:00:00.000Z',
      pickupDeadline: '2026-11-09T12:00:00.000Z',
      deliveryDeadline: '2026-11-09T13:00:00.000Z',
    })

    const calls = vi.mocked(fetch).mock.calls
    expect(calls.map(([url]) => url)).toEqual([
      '/api/v1/errands/open?page=2&size=20',
      '/api/v1/errands/mine?as=courier&state=PICKED_UP',
      '/api/v1/errands/mine?as=requester',
      '/api/v1/errands/abc',
      '/api/v1/errands',
    ])
    expect(calls[4][1]).toMatchObject({ method: 'POST' })
  })

  it('asks for the extraction status and sends only the description to extract', async () => {
    await getExtractionStatus()
    await extractErrand('Two lattes to COM1')

    const calls = vi.mocked(fetch).mock.calls
    expect(calls.map(([url, init]) => [url, init?.method ?? 'GET', init?.body])).toEqual([
      ['/api/v1/errands/extract/status', 'GET', undefined],
      ['/api/v1/errands/extract', 'POST', JSON.stringify({ description: 'Two lattes to COM1' })],
    ])
  })

  it('sends a body only for a reject with a reason', async () => {
    await runErrandAction('abc', 'accept')
    await runErrandAction('abc', 'reject')
    await runErrandAction('abc', 'reject', 'Wrong drink')

    const calls = vi.mocked(fetch).mock.calls
    expect(calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
      ['/api/v1/errands/abc/accept', 'POST', undefined],
      ['/api/v1/errands/abc/reject', 'POST', undefined],
      ['/api/v1/errands/abc/reject', 'POST', JSON.stringify({ reason: 'Wrong drink' })],
    ])
  })
})
