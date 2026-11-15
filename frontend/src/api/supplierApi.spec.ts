/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added contract-focused tests for Supplier query, mutation, and ETag
 * API helpers in issue #28.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27.
 * Scope: covered the metadata helper required by the administrator form in
 * issue #30. Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27.
 * Scope: proved future metadata codes need no frontend allowlist edit for
 * issue #34. Author review: Reviewed and approved by @ron.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToken, saveToken } from '../auth/tokenStorage'
import type { Supplier, SupplierMutation, SupplierPage } from '../suppliers/types'
import {
  archiveSupplier,
  createSupplier,
  getSupplier,
  getSupplierMetadata,
  listSuppliers,
  restoreSupplier,
  updateSupplier,
} from './supplierApi'

const supplier: Supplier = {
  id: '64f945d5-c7ef-4f40-8f39-6cb45bb1afec',
  name: 'Printer @ Com 2',
  categories: ['PRINTING'],
  buildingCode: 'COM2',
  buildingLabel: 'COM2',
  floor: '1',
  locationDescription: 'Next to LT19',
  latitude: 1.2938,
  longitude: 103.7744,
  hoursKind: 'INTERVAL',
  opensAt: '00:00',
  closesAt: '23:59',
  imagePath: '/assets/suppliers/PRINTER_COM2.jpeg',
  status: 'ACTIVE',
  version: 0,
  createdAt: '2026-09-24T08:00:00Z',
  updatedAt: '2026-09-24T08:00:00Z',
  archivedAt: null,
}

describe('Supplier API', () => {
  beforeEach(() => {
    clearToken()
    saveToken('member-token')
    vi.stubGlobal('fetch', vi.fn())
  })

  it('omits default query parameters and encodes explicitly selected filters', async () => {
    const page: SupplierPage = { items: [supplier], page: 0, size: 12, totalItems: 1, totalPages: 1 }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(page))
      .mockResolvedValueOnce(jsonResponse(page))

    await listSuppliers()
    await listSuppliers({
      q: 'coffee & food',
      buildingCode: 'COM2',
      category: 'COFFEE',
      status: 'ACTIVE',
      page: 0,
      size: 12,
      sort: 'name,desc',
    })

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/suppliers', expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/suppliers?q=coffee+%26+food&buildingCode=COM2&category=COFFEE&status=ACTIVE&page=0&size=12&sort=name%2Cdesc',
      expect.any(Object),
    )
  })

  it('captures the detail ETag and keeps bearer authentication in the shared client', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(supplier, 200, { ETag: '"v0"' }))

    await expect(getSupplier(supplier.id)).resolves.toEqual({ supplier, etag: '"v0"' })
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/suppliers/${supplier.id}`,
      expect.objectContaining({ headers: { Authorization: 'Bearer member-token' } }),
    )
  })

  it('loads backend-owned building code metadata without a duplicated frontend allowlist', async () => {
    const metadata = { buildingCodes: [{ code: 'FUTURE_BUILDING', label: 'Future Building' }] }
    vi.mocked(fetch).mockResolvedValue(jsonResponse(metadata))

    await expect(getSupplierMetadata()).resolves.toEqual(metadata)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/suppliers/metadata',
      expect.objectContaining({ headers: { Authorization: 'Bearer member-token' } }),
    )
  })

  it('sends valid all-day create and interval full-update bodies', async () => {
    const allDay: SupplierMutation = {
      name: 'New Pickup Point',
      categories: ['PICKUP_POINT'],
      buildingCode: 'YIH',
      floor: null,
      locationDescription: 'Main foyer',
      latitude: null,
      longitude: null,
      hoursKind: 'ALL_DAY',
    }
    const interval: SupplierMutation = {
      ...allDay,
      hoursKind: 'INTERVAL',
      opensAt: '09:00',
      closesAt: '18:00',
    }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(supplier, 201, { ETag: '"v0"' }))
      .mockResolvedValueOnce(jsonResponse({ ...supplier, version: 1 }, 200, { ETag: '"v1"' }))

    await createSupplier(allDay)
    await updateSupplier(supplier.id, interval, '"v0"')

    const createInit = vi.mocked(fetch).mock.calls[0][1]
    const updateInit = vi.mocked(fetch).mock.calls[1][1]
    expect(JSON.parse(String(createInit?.body))).toEqual(allDay)
    expect(JSON.parse(String(createInit?.body))).not.toHaveProperty('opensAt')
    expect(updateInit).toEqual(
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'If-Match': '"v0"' }),
      }),
    )
    expect(JSON.parse(String(updateInit?.body))).toEqual(interval)
  })

  it('uses If-Match for archive and restore and handles an empty archive response', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ ...supplier, version: 2 }, 200, { ETag: '"v2"' }))

    await expect(archiveSupplier(supplier.id, '"v1"')).resolves.toBeUndefined()
    await expect(restoreSupplier(supplier.id, '"v1"')).resolves.toEqual({
      supplier: { ...supplier, version: 2 },
      etag: '"v2"',
    })

    expect(vi.mocked(fetch).mock.calls[0][1]).toEqual(
      expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ 'If-Match': '"v1"' }) }),
    )
    expect(vi.mocked(fetch).mock.calls[1][1]).toEqual(
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'If-Match': '"v1"' }) }),
    )
  })
})

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}
