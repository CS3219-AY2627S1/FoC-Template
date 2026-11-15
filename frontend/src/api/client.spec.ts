/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added focused tests for response metadata, Supplier errors, and the
 * existing global unauthorised flow in issue #28.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-11-09. Scope: tests
 * for Order Service field-error lists and currentState.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-09. Scope: tests
 * for Retry-After, and that Supplier errors are unchanged. Author review: Reviewed and approved by @mattis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToken, saveToken } from '../auth/tokenStorage'
import { ApiError, apiRequest, apiRequestWithMeta, setUnauthorizedHandler } from './client'

describe('API client', () => {
  beforeEach(() => {
    clearToken()
    setUnauthorizedHandler(null)
    vi.stubGlobal('fetch', vi.fn())
  })

  it('retains response status and headers without changing body-only calls', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ id: 'supplier-1' }, 201, { ETag: '"v0"' }))
      .mockResolvedValueOnce(jsonResponse({ username: 'member' }))

    const metadata = await apiRequestWithMeta<{ id: string }>('/suppliers', { method: 'POST' })
    const body = await apiRequest<{ username: string }>('/whoami')

    expect(metadata.data).toEqual({ id: 'supplier-1' })
    expect(metadata.status).toBe(201)
    expect(metadata.headers.get('ETag')).toBe('"v0"')
    expect(body).toEqual({ username: 'member' })
  })

  it('retains Supplier field errors, request IDs, and duplicate identifiers', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          code: 'SUPPLIER_ALREADY_EXISTS',
          message: 'A Supplier already exists at this location.',
          fieldErrors: { name: 'Name is required.' },
          existingSupplierId: 'existing-id',
          requestId: 'request-id',
        },
        409,
      ),
    )

    const error = await apiRequest('/suppliers').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      code: 'SUPPLIER_ALREADY_EXISTS',
      details: { name: 'Name is required.' },
      fieldErrors: { name: 'Name is required.' },
      existingSupplierId: 'existing-id',
      requestId: 'request-id',
    })
  })

  it('flattens Order field-error lists and keeps the current state of a 409', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: 'VALIDATION_ERROR',
            message: 'Request is invalid',
            details: [
              { field: 'items[0].name', message: 'name must be 1 to 100 characters' },
              { field: 'creditAmount', message: 'creditAmount must be an integer from 1 to 1000' },
            ],
          },
          400,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: 'INVALID_STATE', message: 'Not allowed', currentState: 'COMPLETED' }, 409),
      )

    const invalid = await apiRequest('/errands').catch((caught: unknown) => caught)
    const conflict = await apiRequest('/errands/x/confirm').catch((caught: unknown) => caught)

    expect(invalid).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: {
        'items[0].name': 'name must be 1 to 100 characters',
        creditAmount: 'creditAmount must be an integer from 1 to 1000',
      },
    })
    expect(conflict).toMatchObject({ status: 409, code: 'INVALID_STATE', currentState: 'COMPLETED' })
  })

  it('keeps Retry-After seconds from a rate-limited reply', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ error: 'RATE_LIMITED', message: 'Too many' }, 429, { 'Retry-After': '42' }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'RATE_LIMITED', message: 'Too many' }, 429, { 'Retry-After': 'soon' }))

    const limited = await apiRequest('/errands/extract').catch((caught: unknown) => caught)
    const unreadable = await apiRequest('/errands/extract').catch((caught: unknown) => caught)

    expect(limited).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 42 })
    expect((unreadable as ApiError).retryAfterSeconds).toBeUndefined()
  })

  it('leaves Supplier errors exactly as they were', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          code: 'SUPPLIER_ALREADY_EXISTS',
          message: 'A Supplier already exists at this location.',
          fieldErrors: { name: 'Name is required.' },
          existingSupplierId: 'existing-id',
          requestId: 'request-id',
        },
        409,
        { ETag: '"v3"' },
      ),
    )

    const error = (await apiRequest('/suppliers').catch((caught: unknown) => caught)) as ApiError

    expect({ ...error }).toEqual({
      name: 'ApiError',
      status: 409,
      code: 'SUPPLIER_ALREADY_EXISTS',
      details: { name: 'Name is required.' },
      fieldErrors: { name: 'Name is required.' },
      requestId: 'request-id',
      existingSupplierId: 'existing-id',
      currentState: undefined,
      retryAfterSeconds: undefined,
    })
    expect(error.message).toBe('A Supplier already exists at this location.')
  })

  it('preserves the existing logged-in 401 handler', async () => {
    saveToken('member-token')
    const handleUnauthorized = vi.fn()
    setUnauthorizedHandler(handleUnauthorized)
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'UNAUTHENTICATED', message: 'Expired.' }, 401))

    await expect(apiRequest('/suppliers')).rejects.toBeInstanceOf(ApiError)

    expect(handleUnauthorized).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/suppliers',
      expect.objectContaining({ headers: { Authorization: 'Bearer member-token' } }),
    )
  })
})

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}
