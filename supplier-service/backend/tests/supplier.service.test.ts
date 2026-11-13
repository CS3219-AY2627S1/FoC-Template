// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-08
// Scope: Generated tests for Supplier CRUD/service behavior.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior. Corrected tests where necessary.

import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import type { Supplier } from '@relay/contracts'
import { SupplierService } from '../src/services/supplier.service'
import { isSupplierActive } from '../src/services/supplier-availability'

const supplier: Supplier = {
  id: 'supplier-1',
  name: 'Test Supplier',
  location: { lat: 1, lng: 103, buildingName: 'Test Building', floorNumber: 1 },
  isOperational: true,
  // Selection validation should not depend on the wall clock when this test runs.
  // The dedicated availability assertion below covers time-window behavior.
  operatingHours: { openingTime: '00:00', closingTime: '00:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
  serviceTypes: [0],
}

describe('isSupplierActive', () => {
  it('correctly determines if a supplier is active based on operating hours', () => {
    assert.equal(
      isSupplierActive(
        {
          ...supplier,
          operatingHours: { openingTime: '11:00', closingTime: '02:00', daysOfWeek: [0] },
        },
        new Date('2026-10-12T18:00:00.000Z'),
      ),
      true,
    )
  })
})

describe('SupplierService', () => {
  it('validates supplier selection correctly', async () => {
    const service = new SupplierService({
      findById: async (id: string) => (id === supplier.id ? supplier : null),
    } as never)

    assert.deepEqual(await service.validateSupplierSelection({ supplierId: supplier.id }), {
      valid: true,
      supplierId: supplier.id,
    })

    assert.deepEqual(await service.validateSupplierSelection({ supplierId: 'missing' }), {
      valid: false,
      supplierId: 'missing',
      code: 'SUPPLIER_NOT_FOUND',
      message: 'Supplier not found.',
    })
  })
})
