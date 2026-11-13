import { describe, expect, it } from 'vitest'
import { summarizeSuppliers } from './supplierFormat'
import { DAYS_OF_WEEK } from '../types/supplier.types'
import type { Supplier } from '../types/supplier.types'

const at = (hours: number, minutes = 0) =>
  Date.UTC(2026, 0, 1, hours - 8, minutes)

describe('summarizeSuppliers', () => {
  const supplier = (
    active: boolean,
    opensAt: string,
    closesAt: string,
  ): Supplier => ({
    id: `${opensAt}-${closesAt}-${active}`,
    name: 'Test',
    category: 'FOOD',
    building: 'COM3',
    floor: null,
    locationDescription: null,
    latitude: null,
    longitude: null,
    openingHours: DAYS_OF_WEEK.map((dayOfWeek) => ({
      dayOfWeek,
      opensAt,
      closesAt,
    })),
    imageUrl: null,
    active,
    createdAt: '',
    updatedAt: '',
  })

  it('counts active, deactivated and currently open suppliers', () => {
    const summary = summarizeSuppliers(
      [
        supplier(true, '09:00:00', '18:00:00'),
        supplier(true, '11:00:00', '02:00:00'),
        supplier(true, '19:00:00', '22:00:00'),
        supplier(false, '09:00:00', '18:00:00'),
      ],
      at(12),
    )
    expect(summary).toEqual({ active: 3, deactivated: 1, openNow: 2 })
  })
})
