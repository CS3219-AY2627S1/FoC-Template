// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-09
// Scope: Generated or updated tests for author-defined creation validation.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior. Corrected tests where necessary.

// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-17
// Scope: Generated initial implementation of the Errand creation tests.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { describe, expect, it, vi } from 'vitest'
import type { CreateErrandRequest } from '@relay/contracts'
import { ErrandService } from '../src/services/errand.service.js'
import type { ErrandRepository } from '../src/repositories/errand.repository.js'
import type { CreditClient } from '../src/clients/credit.client.js'
import type { SupplierClient } from '../src/clients/supplier.client.js'
import type { UserClient } from '../src/clients/user.client.js'
import { ErrandServiceError } from '../src/types/errand.types.js'
import { validateCreateErrand } from '../src/validators/errand.validator.js'

const user = {
  sub: 'requester',
  email: 'requester@example.com',
  emailVerified: true,
  role: 'user' as const,
  profileCreated: true,
}
const request: CreateErrandRequest = {
  name: 'Delivery',
  supplierDetails: { supplierId: 'supplier', supplierName: 'Supplier', serviceType: 1 },
  pickupLocation: { lat: 1, lng: 103, buildingName: 'Pickup', floorNumber: 1 },
  targetLocation: { lat: 1, lng: 103, buildingName: 'Target', floorNumber: 2 },
  deliveryDetails: { description: 'Deliver parcel' },
  creditAmount: 10,
}

function setup() {
  const repository = {
    addPendingErrand: vi.fn().mockResolvedValue('pending-id'),
    publishCreationFailedEvent: vi.fn().mockResolvedValue(undefined),
    deletePendingErrand: vi.fn().mockResolvedValue(undefined),
    createErrand: vi.fn().mockResolvedValue({ id: 'pending-id', requesterSub: user.sub }),
  }
  const credit = { reserve: vi.fn().mockResolvedValue(undefined) }
  const supplier = { validateSelection: vi.fn().mockResolvedValue(undefined) }
  const userClient = {
    getProfile: vi.fn().mockResolvedValue({ username: 'Requester', profilePictureUrl: null }),
  }
  const service = new ErrandService(
    repository as unknown as ErrandRepository,
    credit as unknown as CreditClient,
    supplier as unknown as SupplierClient,
    userClient as unknown as UserClient,
  )
  return { service, repository, credit, supplier, userClient }
}

describe('errand creation and credit reservation', () => {
  it('validates that a supplied start time is before the deadline', () => {
    expect(() =>
      validateCreateErrand({
        ...request,
        startAt: '2026-10-21T12:00:00.000Z',
        expiresAt: '2026-10-21T11:00:00.000Z',
      }),
    ).toThrow('The errand request is invalid.')
  })

  it('rejects instructions longer than 5000 characters', () => {
    expect(() =>
      validateCreateErrand({
        ...request,
        deliveryDetails: {
          ...request.deliveryDetails,
          instructions: 'a'.repeat(5001),
        },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'INVALID_ERRAND',
        fieldErrors: {
          'deliveryDetails.instructions': 'Instructions must be no more than 5000 characters',
        },
      }),
    )
  })

  it('accepts instructions at the 5000-character limit', () => {
    expect(() =>
      validateCreateErrand({
        ...request,
        deliveryDetails: {
          ...request.deliveryDetails,
          instructions: 'a'.repeat(5000),
        },
      }),
    ).not.toThrow()
  })

  it('reserves credit between pending insert and atomic completion', async () => {
    const { service, repository, credit, supplier, userClient } = setup()
    await service.createErrand(user, request)
    expect(userClient.getProfile).toHaveBeenCalledWith(user.sub)
    expect(supplier.validateSelection).toHaveBeenCalledWith({
      supplierId: 'supplier',
      serviceType: 1,
    })
    expect(repository.addPendingErrand).toHaveBeenCalledWith(user.sub)
    expect(credit.reserve).toHaveBeenCalledWith('pending-id', user.sub, 10)
    expect(repository.createErrand).toHaveBeenCalledWith('pending-id', user.sub, request)
    expect(repository.addPendingErrand.mock.invocationCallOrder[0]).toBeLessThan(
      credit.reserve.mock.invocationCallOrder[0],
    )
    expect(credit.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      repository.createErrand.mock.invocationCallOrder[0],
    )
  })

  it('accepts a zero-credit errand and reserves zero before creating it', async () => {
    const { service, repository, credit, supplier } = setup()
    const freeRequest = validateCreateErrand({ ...request, creditAmount: 0 })
    await service.createErrand(user, freeRequest)
    expect(supplier.validateSelection).toHaveBeenCalledWith({
      supplierId: 'supplier',
      serviceType: 1,
    })
    expect(credit.reserve).toHaveBeenCalledWith('pending-id', user.sub, 0)
    expect(repository.createErrand).toHaveBeenCalledWith('pending-id', user.sub, freeRequest)
  })

  it('publishes a failure event and cleans up if reservation fails', async () => {
    const { service, repository, credit, supplier } = setup()
    credit.reserve.mockRejectedValue(new Error('Credit unavailable'))
    await expect(service.createErrand(user, request)).rejects.toThrow('Credit unavailable')
    expect(repository.createErrand).not.toHaveBeenCalled()
    expect(repository.publishCreationFailedEvent).toHaveBeenCalledWith('pending-id', user.sub)
    expect(repository.deletePendingErrand).toHaveBeenCalledWith('pending-id')
    expect(supplier.validateSelection).toHaveBeenCalledOnce()
  })

  it('rejects inactive or unavailable suppliers before reserving credit', async () => {
    const { service, repository, credit, supplier } = setup()
    supplier.validateSelection.mockRejectedValue(new Error('Supplier is not currently active.'))

    await expect(service.createErrand(user, request)).rejects.toThrow(
      'Supplier is not currently active.',
    )
    expect(repository.addPendingErrand).not.toHaveBeenCalled()
    expect(credit.reserve).not.toHaveBeenCalled()
  })

  it('rejects unverified users before inserting a pending row', async () => {
    const { service, repository, credit } = setup()
    await expect(
      service.createErrand({ ...user, emailVerified: false }, request),
    ).rejects.toMatchObject({
      statusCode: 403,
    })
    expect(repository.addPendingErrand).not.toHaveBeenCalled()
    expect(credit.reserve).not.toHaveBeenCalled()
  })

  it('requires a requester profile before validating the supplier or reserving credit', async () => {
    const { service, repository, credit, supplier, userClient } = setup()
    userClient.getProfile.mockResolvedValue(null)

    await expect(service.createErrand(user, request)).rejects.toMatchObject({
      code: 'INVALID_ERRAND',
      statusCode: 400,
    })
    expect(supplier.validateSelection).not.toHaveBeenCalled()
    expect(repository.addPendingErrand).not.toHaveBeenCalled()
    expect(credit.reserve).not.toHaveBeenCalled()
  })

  it('propagates User Service unavailability before reserving credit', async () => {
    const { service, repository, credit, supplier, userClient } = setup()
    userClient.getProfile.mockRejectedValue(
      new ErrandServiceError('INTERNAL_ERROR', 'User Service profile lookup is unavailable.', 503),
    )

    await expect(service.createErrand(user, request)).rejects.toMatchObject({
      statusCode: 503,
    })
    expect(supplier.validateSelection).not.toHaveBeenCalled()
    expect(repository.addPendingErrand).not.toHaveBeenCalled()
    expect(credit.reserve).not.toHaveBeenCalled()
  })
})
