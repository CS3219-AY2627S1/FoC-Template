/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-21
 * Scope (AI-03): Isolated failed supplier lookups and added regression tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-65): Added tests for recommended errands api calls to ensure reccomended errands work as intended
 * Author review: Code changes were checked and validated
 */


import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupplier, listSupplierBuildings } from '../suppliers/supplier.api'
import type { Supplier } from '../suppliers/supplier.types'
import { listErrands, listRecommendedErrands } from './errand.api'
import {
  applyDeliveryBuildingNames,
  buildOpenErrandParams,
  loadErrandDashboardBuildings,
  loadOpenErrandDashboard,
  loadRecommendedErrands,
  type ErrandDashboardFilters,
} from './errand.dashboard'
import type { ErrandListItem } from './errand.types'

vi.mock('./errand.api', () => ({
  listErrands: vi.fn(),
  listRecommendedErrands: vi.fn(),
}))

vi.mock('../suppliers/supplier.api', () => ({
  getSupplier: vi.fn(),
  listSupplierBuildings: vi.fn(),
}))

const listErrandsMock = vi.mocked(listErrands)
const listRecommendedErrandsMock = vi.mocked(listRecommendedErrands)
const getSupplierMock = vi.mocked(getSupplier)
const listSupplierBuildingsMock = vi.mocked(listSupplierBuildings)

const defaultFilters: ErrandDashboardFilters = {
  deliveryBuildingId: '',
  credit: 'all',
  expiry: 'all',
  sort: 'expires_at,asc',
}

const errand: ErrandListItem = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  status: 'OPEN',
  requester_id: '11111111-1111-4111-8111-111111111111',
  courier_id: null,
  supplier_id: '22222222-2222-4222-8222-222222222222',
  required_item: 'Two sandwiches and one coffee',
  credit_value: 8,
  delivery_building_id: '33333333-3333-4333-8333-333333333333',
  delivery_floor: '3',
  delivery_description: 'Outside room 03-12',
  expires_at: '2026-10-20T12:00:00.000Z',
  created_at: '2026-10-20T04:00:00.000Z',
  accepted_at: null,
  delivered_at: null,
  completed_at: null,
  cancelled_at: null,
  failed_at: null,
  failure_reason: null,
}

const supplier: Supplier = {
  id: errand.supplier_id,
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

describe('buildOpenErrandParams', () => {
  const now = new Date('2026-10-20T02:30:00.000Z')

  it('always requests the first page of available open errands using the selected sort', () => {
    expect(buildOpenErrandParams(defaultFilters, now)).toEqual({
      statuses: ['OPEN'],
      deliveryBuildingId: undefined,
      availableOnly: true,
      sort: 'expires_at,asc',
      page: 0,
      size: 20,
    })
  })

  it.each([
    ['up-to-5', undefined, 5],
    ['6-to-10', 6, 10],
    ['11-plus', 11, undefined],
  ] as const)('maps the %s credit filter to API bounds', (credit, minimum, maximum) => {
    const params = buildOpenErrandParams({ ...defaultFilters, credit }, now)

    expect(params.minCreditValue).toBe(minimum)
    expect(params.maxCreditValue).toBe(maximum)
  })

  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  it.each([
    ['next-4-hours', '2026-10-20T06:30:00.000Z'],
    ['today', endOfToday.toISOString()],
    ['next-7-days', '2026-10-27T02:30:00.000Z'],
  ] as const)('maps the %s expiry filter to an inclusive upper bound', (expiry, expected) => {
    expect(
      buildOpenErrandParams({ ...defaultFilters, expiry }, now).expiresBefore,
    ).toBe(expected)
  })

  it('passes a selected delivery building through by identifier', () => {
    expect(
      buildOpenErrandParams(
        { ...defaultFilters, deliveryBuildingId: errand.delivery_building_id },
        now,
      ).deliveryBuildingId,
    ).toBe(errand.delivery_building_id)
  })
})

describe('loadOpenErrandDashboard', () => {
  beforeEach(() => {
    listErrandsMock.mockReset()
    getSupplierMock.mockReset()
    listSupplierBuildingsMock.mockReset()

    listErrandsMock.mockResolvedValue({ total: 1, items: [errand] })
    getSupplierMock.mockResolvedValue(supplier)
  })

  it('loads open errands and enriches their service identifiers for dashboard cards', async () => {
    const signal = new AbortController().signal

    await expect(
      loadOpenErrandDashboard(defaultFilters, signal, new Date('2026-10-20T02:30:00.000Z')),
    ).resolves.toEqual({
      total: 1,
      items: [
        {
          ...errand,
          supplier_name: 'Techno Edge',
          supplier_building_name: 'Engineering E2',
          delivery_building_name: 'Delivery location unavailable',
        },
      ],
    })

    expect(listErrandsMock).toHaveBeenCalledWith(
      buildOpenErrandParams(defaultFilters, new Date('2026-10-20T02:30:00.000Z')),
      signal,
    )
    expect(getSupplierMock).toHaveBeenCalledWith(errand.supplier_id, signal)
    expect(listSupplierBuildingsMock).not.toHaveBeenCalled()
  })

  it('loads each supplier only once when multiple errands use it', async () => {
    listErrandsMock.mockResolvedValue({
      total: 2,
      items: [errand, { ...errand, id: '660e8400-e29b-41d4-a716-446655440000' }],
    })

    await loadOpenErrandDashboard(defaultFilters)

    expect(getSupplierMock).toHaveBeenCalledTimes(1)
  })

  it('keeps errands usable when an individual supplier lookup fails', async () => {
    const unavailableSupplierId = '33333333-3333-4333-8333-333333333333'
    listErrandsMock.mockResolvedValue({
      total: 2,
      items: [
        errand,
        {
          ...errand,
          id: '660e8400-e29b-41d4-a716-446655440000',
          supplier_id: unavailableSupplierId,
        },
      ],
    })
    getSupplierMock.mockImplementation((supplierId) =>
      supplierId === unavailableSupplierId
        ? Promise.reject(new Error('Supplier not found'))
        : Promise.resolve(supplier),
    )

    const result = await loadOpenErrandDashboard(defaultFilters)

    expect(result.items[0]).toMatchObject({
      supplier_name: 'Techno Edge',
      supplier_building_name: 'Engineering E2',
    })
    expect(result.items[1]).toMatchObject({
      supplier_name: 'Supplier unavailable',
      supplier_building_name: 'Pickup location unavailable',
    })
  })

  it('still propagates cancellation from a supplier lookup', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    getSupplierMock.mockRejectedValue(abortError)

    await expect(loadOpenErrandDashboard(defaultFilters)).rejects.toBe(abortError)
  })

})

describe('dashboard building references', () => {
  beforeEach(() => {
    listSupplierBuildingsMock.mockReset()
  })

  it('loads delivery buildings independently from errand results', async () => {
    const buildings = [{ id: errand.delivery_building_id, name: 'COM3' }]
    const signal = new AbortController().signal
    listSupplierBuildingsMock.mockResolvedValue({ items: buildings })

    await expect(loadErrandDashboardBuildings(signal)).resolves.toEqual(buildings)
    expect(listSupplierBuildingsMock).toHaveBeenCalledWith(signal)
  })

  it('applies delivery building names without making another service request', () => {
    const data = {
      total: 1,
      items: [
        {
          ...errand,
          supplier_name: supplier.name,
          supplier_building_name: supplier.building.name,
          delivery_building_name: 'Delivery location unavailable',
        },
      ],
    }

    expect(
      applyDeliveryBuildingNames(data, [
        { id: errand.delivery_building_id, name: 'COM3' },
      ]).items[0].delivery_building_name,
    ).toBe('COM3')
    expect(listSupplierBuildingsMock).not.toHaveBeenCalled()
  })

  it('keeps an explicit fallback when a delivery building cannot be resolved', () => {
    const data = {
      total: 1,
      items: [
        {
          ...errand,
          supplier_name: supplier.name,
          supplier_building_name: supplier.building.name,
          delivery_building_name: 'Delivery location unavailable',
        },
      ],
    }

    expect(applyDeliveryBuildingNames(data, []).items[0].delivery_building_name).toBe(
      'Delivery location unavailable',
    )
  })

  it('loads recommended errands with supplier names and keeps the reason', async () => {
    listRecommendedErrandsMock.mockResolvedValue({
      items: [{ ...errand, recommendation_reason: 'Needed soon' }],
    })
    getSupplierMock.mockResolvedValue(supplier)

    const [recommended] = await loadRecommendedErrands()

    expect(listRecommendedErrandsMock).toHaveBeenCalledWith(4, undefined)
    expect(recommended.recommendation_reason).toBe('Needed soon')
    expect(recommended.supplier_name).toBe('Techno Edge')
    expect(recommended.supplier_building_name).toBe('Engineering E2')
  })
})
