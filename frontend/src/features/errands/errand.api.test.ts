/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-07
 * Scope (AI-17): Wired and tested the existing pickup and receipt actions.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-65): Added tests for recommended errands 
 * Author review: Code changes were checked and validated
 */


import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticatedFetch } from '../auth/auth.fetch'
import {
  acceptErrand,
  cancelErrand,
  completeErrand,
  createErrand,
  deliverErrand,
  ErrandApiError,
  failErrand,
  getErrand,
  listErrands,
  listRecommendedErrands,
} from './errand.api'
import type {
  CreateErrandRequest,
  CreateErrandResponse,
  ErrandListResponse,
} from './errand.types'

vi.mock('../auth/auth.fetch', () => ({
  authenticatedFetch: vi.fn(),
}))

const authenticatedFetchMock = vi.mocked(authenticatedFetch)

const request: CreateErrandRequest = {
  supplier_id: '22222222-2222-4222-8222-222222222222',
  required_item: 'Two sandwiches and one coffee',
  credit_value: 10,
  delivery_building_id: '11111111-1111-4111-8111-111111111111',
  delivery_floor: '3',
  delivery_description: 'Outside room 03-12',
  expires_at: '2026-10-18T04:00:00.000Z',
}

const createdErrand: CreateErrandResponse = {
  ...request,
  id: '550e8400-e29b-41d4-a716-446655440000',
  status: 'OPEN',
  requester_id: '33333333-3333-4333-8333-333333333333',
  courier_id: null,
  created_at: '2026-10-17T04:00:00.000Z',
}

const listedErrands: ErrandListResponse = {
  total: 1,
  items: [
    {
      ...createdErrand,
      accepted_at: null,
      delivered_at: null,
      completed_at: null,
      cancelled_at: null,
      failed_at: null,
      failure_reason: null,
    },
  ],
}

describe('listErrands', () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset()
  })

  it('serializes every supported filter, repeated status, sort, and page parameter', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify(listedErrands), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const signal = new AbortController().signal
    await expect(
      listErrands(
        {
          errandId: '550e8400-e29b-41d4-a716-446655440000',
          supplierId: '22222222-2222-4222-8222-222222222222',
          requesterId: '33333333-3333-4333-8333-333333333333',
          courierId: '44444444-4444-4444-8444-444444444444',
          statuses: ['OPEN', 'ACCEPTED'],
          deliveryBuildingId: '11111111-1111-4111-8111-111111111111',
          minCreditValue: 6,
          maxCreditValue: 10,
          expiresAfter: '2026-10-20T00:00:00.000Z',
          expiresBefore: '2026-10-27T00:00:00.000Z',
          availableOnly: true,
          sort: 'credit_value,desc',
          page: 2,
          size: 20,
        },
        signal,
      ),
    ).resolves.toEqual(listedErrands)

    const expectedBaseUrl = (import.meta.env.VITE_ORDER_API_URL ?? '').trim().replace(/\/+$/, '')
    const expectedQuery = new URLSearchParams([
      ['errand_id', '550e8400-e29b-41d4-a716-446655440000'],
      ['supplier_id', '22222222-2222-4222-8222-222222222222'],
      ['requester_id', '33333333-3333-4333-8333-333333333333'],
      ['courier_id', '44444444-4444-4444-8444-444444444444'],
      ['status', 'OPEN'],
      ['status', 'ACCEPTED'],
      ['delivery_building_id', '11111111-1111-4111-8111-111111111111'],
      ['min_credit_value', '6'],
      ['max_credit_value', '10'],
      ['expires_after', '2026-10-20T00:00:00.000Z'],
      ['expires_before', '2026-10-27T00:00:00.000Z'],
      ['available_only', 'true'],
      ['sort', 'credit_value,desc'],
      ['page', '2'],
      ['size', '20'],
    ])

    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      `${expectedBaseUrl}/errands?${expectedQuery}`,
      {
        headers: { Accept: 'application/json' },
        signal,
      },
    )
  })

  it('omits the query string when no parameters are supplied', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify(listedErrands), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await listErrands()

    const expectedBaseUrl = (import.meta.env.VITE_ORDER_API_URL ?? '').trim().replace(/\/+$/, '')
    expect(authenticatedFetchMock).toHaveBeenCalledWith(`${expectedBaseUrl}/errands`, {
      headers: { Accept: 'application/json' },
      signal: undefined,
    })
  })

  it('preserves FastAPI query validation issues', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [
            {
              loc: ['query', 'min_credit_value'],
              msg: 'Input should be greater than or equal to 1',
              type: 'greater_than_equal',
            },
          ],
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await expect(listErrands({ minCreditValue: 0 })).rejects.toMatchObject({
      status: 422,
      message: 'Input should be greater than or equal to 1',
      issues: [
        {
          loc: ['query', 'min_credit_value'],
          msg: 'Input should be greater than or equal to 1',
          type: 'greater_than_equal',
        },
      ],
    })
  })

  it('uses a string problem detail returned by the service', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'min_credit_value must not exceed max_credit_value' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      listErrands({ minCreditValue: 10, maxCreditValue: 5 }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'min_credit_value must not exceed max_credit_value',
      issues: [],
    })
  })

  it('reports a connection error when the request fails', async () => {
    authenticatedFetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(listErrands()).rejects.toMatchObject({
      status: 0,
      message: 'Could not connect to the Order Service.',
    })
  })

  it('preserves request cancellation', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    authenticatedFetchMock.mockRejectedValue(abortError)

    await expect(listErrands({}, controller.signal)).rejects.toBe(abortError)
  })
})

describe('createErrand', () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset()
  })

  it('posts the exact request body to the Order Service', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify(createdErrand), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(createErrand(request)).resolves.toEqual(createdErrand)

    const expectedBaseUrl = (import.meta.env.VITE_ORDER_API_URL ?? '').trim().replace(/\/+$/, '')
    expect(authenticatedFetchMock).toHaveBeenCalledWith(`${expectedBaseUrl}/errand/create`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: undefined,
    })
  })

  it('preserves FastAPI field validation issues', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [
            {
              loc: ['body', 'expires_at'],
              msg: 'expires_at must be in the future',
              type: 'value_error',
            },
          ],
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const error = await createErrand(request).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ErrandApiError)
    expect(error).toMatchObject({
      status: 422,
      message: 'expires_at must be in the future',
      issues: [
        {
          loc: ['body', 'expires_at'],
          msg: 'expires_at must be in the future',
          type: 'value_error',
        },
      ],
    })
  })

  it('uses string problem details as the error message', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Supplier does not exist or is unavailable' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(createErrand(request)).rejects.toMatchObject({
      status: 422,
      message: 'Supplier does not exist or is unavailable',
      issues: [],
    })
  })

  it('reports a connection error when the request fails', async () => {
    authenticatedFetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(createErrand(request)).rejects.toMatchObject({
      status: 0,
      message: 'Could not connect to the Order Service.',
    })
  })

  it('preserves request cancellation', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    authenticatedFetchMock.mockRejectedValue(abortError)

    await expect(createErrand(request, controller.signal)).rejects.toBe(abortError)
  })
})

describe('errand lifecycle actions', () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset()
  })

  it.each([
    ['acceptErrand', acceptErrand, '/errand/accept'],
    ['cancelErrand', cancelErrand, '/errand/cancel'],
    ['completeErrand', completeErrand, '/errand/complete'],
  ] as const)('posts the errand ID for %s', async (_name, action, path) => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: request.supplier_id, status: 'ACCEPTED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await action('550e8400-e29b-41d4-a716-446655440000')

    const expectedBaseUrl = (import.meta.env.VITE_ORDER_API_URL ?? '').trim().replace(/\/+$/, '')
    expect(authenticatedFetchMock).toHaveBeenCalledWith(`${expectedBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ errand_id: '550e8400-e29b-41d4-a716-446655440000' }),
      signal: undefined,
    })
  })

  it('marks an errand ready for pickup with an empty success response', async () => {
    authenticatedFetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(deliverErrand(createdErrand.id)).resolves.toBeUndefined()
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/errand\/deliver$/),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ errand_id: createdErrand.id }) }),
    )
  })

  it('includes the failure reason when reporting an errand', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'FAILED',
          failed_at: '2026-10-22T04:00:00.000Z',
          failure_reason: 'The requested item was unavailable.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await failErrand(
      '550e8400-e29b-41d4-a716-446655440000',
      'The requested item was unavailable.',
    )

    expect(JSON.parse(String(authenticatedFetchMock.mock.calls[0][1]?.body))).toEqual({
      errand_id: '550e8400-e29b-41d4-a716-446655440000',
      failure_reason: 'The requested item was unavailable.',
    })
  })

  it('preserves lifecycle conflicts returned by the service', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Errand is no longer OPEN' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      acceptErrand('550e8400-e29b-41d4-a716-446655440000'),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Errand is no longer OPEN',
    })
  })

  it('gets a single visible errand through the list endpoint', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify(listedErrands), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      getErrand('550e8400-e29b-41d4-a716-446655440000'),
    ).resolves.toEqual(listedErrands.items[0])

    expect(String(authenticatedFetchMock.mock.calls[0][0])).toContain(
      'errand_id=550e8400-e29b-41d4-a716-446655440000',
    )
  })

  it('reports a missing visible errand as not found', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ total: 0, items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(getErrand('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Errand not found.',
    })
  })
})

describe('listRecommendedErrands', () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset()
  })

  it('requests the recommended endpoint with the requested size', async () => {
    const body = {
      items: [{ ...listedErrands.items[0], recommendation_reason: 'Needed soon' }],
    }
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(listRecommendedErrands(3)).resolves.toEqual(body)

    const expectedBaseUrl = (import.meta.env.VITE_ORDER_API_URL ?? '').trim().replace(/\/+$/, '')
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      `${expectedBaseUrl}/errands/recommended?size=3`,
      { headers: { Accept: 'application/json' }, signal: undefined },
    )
  })

  it('reports service errors as ErrandApiError', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Invalid or expired access token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(listRecommendedErrands()).rejects.toMatchObject({
      status: 401,
      message: 'Invalid or expired access token',
    })
  })
})
