import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupplier, listSupplierBuildings } from '../suppliers/supplier.api'
import { getErrand, listErrands } from './errand.api'
import type { ErrandListItem } from './errand.types'
import { loadErrandDetails, loadMyErrands } from './errand.view'

vi.mock('./errand.api', () => ({
  getErrand: vi.fn(),
  listErrands: vi.fn(),
}))

vi.mock('../suppliers/supplier.api', () => ({
  getSupplier: vi.fn(),
  listSupplierBuildings: vi.fn(),
}))

const currentUserId = '11111111-1111-4111-8111-111111111111'
const courierId = '22222222-2222-4222-8222-222222222222'
const baseErrand: ErrandListItem = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  status: 'ACCEPTED',
  requester_id: currentUserId,
  courier_id: courierId,
  supplier_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  required_item: 'Two sandwiches and one coffee',
  credit_value: 10,
  delivery_building_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  delivery_floor: '3',
  delivery_description: 'Outside room 03-12',
  expires_at: '2026-10-22T12:00:00.000Z',
  created_at: '2026-10-22T08:00:00.000Z',
  accepted_at: '2026-10-22T09:00:00.000Z',
  delivered_at: null,
  completed_at: null,
  cancelled_at: null,
  failed_at: null,
  failure_reason: null,
}

const supplier = {
  id: baseErrand.supplier_id,
  name: 'Frontier Canteen',
  category: { id: 'category', name: 'Food' },
  building: { id: 'pickup', name: 'Frontier' },
  floor: '1',
  description: null,
  openingTime: null,
  closingTime: null,
  imageUrl: null,
  status: 'ACTIVE' as const,
}

describe('errand presentation loaders', () => {
  beforeEach(() => {
    vi.mocked(getErrand).mockReset()
    vi.mocked(listErrands).mockReset()
    vi.mocked(getSupplier).mockReset()
    vi.mocked(listSupplierBuildings).mockReset()
    vi.mocked(getSupplier).mockResolvedValue(supplier)
    vi.mocked(listSupplierBuildings).mockResolvedValue({
      items: [{ id: baseErrand.delivery_building_id, name: 'S17' }],
    })
  })

  it('loads requester and courier errands separately, deduplicates, and maps roles', async () => {
    const courierErrand = {
      ...baseErrand,
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      requester_id: courierId,
      courier_id: currentUserId,
      accepted_at: '2026-10-22T10:00:00.000Z',
    }
    vi.mocked(listErrands)
      .mockResolvedValueOnce({ total: 1, items: [baseErrand] })
      .mockResolvedValueOnce({ total: 2, items: [courierErrand, baseErrand] })

    const result = await loadMyErrands(currentUserId)

    expect(listErrands).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ requesterId: currentUserId, statuses: ['OPEN', 'ACCEPTED', 'DELIVERED'] }),
      undefined,
    )
    expect(listErrands).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ courierId: currentUserId, statuses: ['ACCEPTED', 'DELIVERED'] }),
      undefined,
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: courierErrand.id, role: 'courier', progress: 'accepted' })
    expect(result[1]).toMatchObject({
      id: baseErrand.id,
      role: 'requester',
      progress: 'accepted',
      pickupLocation: 'Frontier Canteen',
      deliveryLocation: 'S17, Level 3',
    })
  })

  it('keeps delivered errands active for the requester and the courier', async () => {
    const deliveredErrand = { ...baseErrand, status: 'DELIVERED' as const, delivered_at: '2026-10-22T11:00:00.000Z' }
    const courierErrand = {
      ...deliveredErrand,
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      requester_id: courierId,
      courier_id: currentUserId,
    }
    vi.mocked(listErrands)
      .mockResolvedValueOnce({ total: 1, items: [deliveredErrand] })
      .mockResolvedValueOnce({ total: 1, items: [courierErrand] })

    await expect(loadMyErrands(currentUserId)).resolves.toMatchObject([
      { id: deliveredErrand.id, role: 'requester', progress: 'ready-for-collection' },
      { id: courierErrand.id, role: 'courier', progress: 'awaiting-confirmation' },
    ])
  })

  it('loads and enriches a role-aware errand detail', async () => {
    const deliveredAt = '2026-10-22T11:00:00.000Z'
    vi.mocked(getErrand).mockResolvedValue({ ...baseErrand, status: 'DELIVERED', delivered_at: deliveredAt })

    await expect(loadErrandDetails(baseErrand.id, currentUserId)).resolves.toMatchObject({
      id: baseErrand.id,
      viewerRole: 'requester',
      supplierName: 'Frontier Canteen',
      pickupLocation: 'Frontier, Level 1',
      deliveryBuilding: 'S17',
      requesterName: 'You',
      courierName: 'Assigned courier',
      deliveredAt,
    })
  })

  it('keeps order data usable when reference lookups fail', async () => {
    vi.mocked(listErrands)
      .mockResolvedValueOnce({ total: 1, items: [baseErrand] })
      .mockResolvedValueOnce({ total: 0, items: [] })
    vi.mocked(getSupplier).mockRejectedValue(new Error('supplier unavailable'))
    vi.mocked(listSupplierBuildings).mockRejectedValue(new Error('buildings unavailable'))

    await expect(loadMyErrands(currentUserId)).resolves.toEqual([
      expect.objectContaining({
        pickupLocation: 'Supplier unavailable',
        deliveryLocation: 'Delivery location unavailable, Level 3',
      }),
    ])
  })
})
