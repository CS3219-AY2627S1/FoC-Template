/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticatedFetch } from '../auth/auth.fetch'
import { createSupplier, getSupplier, reactivateSupplier, SupplierApiError } from './supplier.api'
import type { Supplier } from './supplier.types'

vi.mock('../auth/auth.fetch', () => ({
  authenticatedFetch: vi.fn(),
}))

const authenticatedFetchMock = vi.mocked(authenticatedFetch)

const supplier: Supplier = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Techno Edge',
  category: { id: 'category-food', name: 'Food' },
  building: { id: 'building-engineering', name: 'Engineering E2' },
  floor: '2',
  description: null,
  openingTime: null,
  closingTime: null,
  imageUrl: null,
  status: 'ACTIVE',
}

describe('getSupplier', () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset()
  })

  it('loads one supplier by identifier and forwards request cancellation', async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify(supplier), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const signal = new AbortController().signal

    await expect(getSupplier(supplier.id, signal)).resolves.toEqual(supplier)

    const expectedBaseUrl = (import.meta.env.VITE_SUPPLIER_API_URL ?? '')
      .trim()
      .replace(/\/+$/, '')
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      `${expectedBaseUrl}/suppliers/${supplier.id}`,
      {
        headers: { Accept: 'application/json' },
        signal,
      },
    )
  })
})

describe('administrator supplier requests', () => {
  beforeEach(() => authenticatedFetchMock.mockReset())

  it('creates a supplier with the backend request contract', async () => {
    authenticatedFetchMock.mockResolvedValue(new Response(JSON.stringify(supplier), { status: 201 }))
    const request = {
      name: 'Techno Edge', categoryId: 'category-food', buildingId: 'building-engineering',
      floor: null, description: null, openingTime: null, closingTime: null, imageUrl: null,
    }
    await expect(createSupplier(request)).resolves.toEqual(supplier)
    expect(authenticatedFetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/suppliers$/), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
  })

  it('preserves all inactive references from a reactivation conflict', async () => {
    authenticatedFetchMock.mockResolvedValue(new Response(JSON.stringify({
      detail: 'The following selected references are not active: category, building',
      inactiveReferences: ['category', 'building'],
    }), { status: 409, headers: { 'Content-Type': 'application/problem+json' } }))

    const error = await reactivateSupplier(supplier.id).catch(value => value)
    expect(error).toBeInstanceOf(SupplierApiError)
    expect(error.inactiveReferences).toEqual(['category', 'building'])
  })
})
