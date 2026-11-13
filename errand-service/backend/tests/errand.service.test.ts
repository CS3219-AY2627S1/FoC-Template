// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-24
// Scope: Generated unit tests for author-defined lifecycle transition behavior.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior. Corrected tests where necessary.

// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-17
// Scope: Generated initial implementation of the Errand Service tests.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErrandRepository } from '../src/repositories/errand.repository.js'
import { ErrandService } from '../src/services/errand.service.js'

const user = {
  sub: 'requester-1',
  email: 'requester@example.com',
  emailVerified: true,
  role: 'user' as const,
  profileCreated: true,
}

function createRepositoryMock() {
  return {
    expireOpenErrands: vi.fn().mockResolvedValue(0),
    confirmDeliveredErrands: vi.fn().mockResolvedValue(0),
    listOwnedBy: vi.fn().mockResolvedValue([]),
    listVisibleTo: vi.fn().mockResolvedValue([]),
    listSupplierView: vi.fn().mockResolvedValue([]),
  } as unknown as ErrandRepository
}

describe('ErrandService read scopes', () => {
  let repository: ReturnType<typeof createRepositoryMock>
  let service: ErrandService

  beforeEach(() => {
    repository = createRepositoryMock()
    service = new ErrandService(repository)
  })

  it('lists only requester-owned errands for the mine scope', async () => {
    await service.getErrands(user, { scope: 'mine' })

    expect(repository.expireOpenErrands).toHaveBeenCalledOnce()
    expect(repository.confirmDeliveredErrands).toHaveBeenCalledOnce()
    expect(repository.listOwnedBy).toHaveBeenCalledWith(user.sub)
    expect(repository.listVisibleTo).not.toHaveBeenCalled()
  })

  it('preserves the existing visible listing by default', async () => {
    await service.getErrands(user)

    expect(repository.expireOpenErrands).toHaveBeenCalledOnce()
    expect(repository.confirmDeliveredErrands).toHaveBeenCalledOnce()
    expect(repository.listVisibleTo).toHaveBeenCalledWith(user.sub)
    expect(repository.listOwnedBy).not.toHaveBeenCalled()
  })

  it('uses the authenticated subject for supplier explore views', async () => {
    await service.getSupplierErrandView(user, { scope: 'explore', supplierId: 'supplier-1' })

    expect(repository.expireOpenErrands).toHaveBeenCalledOnce()
    expect(repository.confirmDeliveredErrands).toHaveBeenCalledOnce()
    expect(repository.listSupplierView).toHaveBeenCalledWith({
      scope: 'explore',
      supplierId: 'supplier-1',
      viewerSub: user.sub,
    })
  })

  it('uses the authenticated subject for supplier mine views', async () => {
    await service.getSupplierErrandView(user, { scope: 'mine' })

    expect(repository.expireOpenErrands).toHaveBeenCalledOnce()
    expect(repository.listSupplierView).toHaveBeenCalledWith({
      scope: 'mine',
      viewerSub: user.sub,
    })
    expect(repository.confirmDeliveredErrands).toHaveBeenCalledOnce()
  })
})

describe('ErrandService cancellation', () => {
  it('allows the requester to cancel an open errand', async () => {
    const errand = {
      id: 'errand-1',
      requesterSub: user.sub,
      courierSub: null,
      courierProfile: null,
      status: 'OPEN' as const,
    }
    const repository = {
      cancel: vi.fn().mockResolvedValue({ ...errand, status: 'CANCELLED' as const }),
    } as unknown as ErrandRepository
    const service = new ErrandService(repository)

    const result = await service.cancelErrand(user, errand.id)

    expect(repository.cancel).toHaveBeenCalledWith(errand.id, user.sub)
    expect(result.status).toBe('CANCELLED')
  })

  it('rejects cancellation by a courier or another user', async () => {
    const repository = {
      cancel: vi.fn().mockRejectedValue(new Error('ONLY REQUESTER CAN CANCEL')),
    } as unknown as ErrandRepository
    const service = new ErrandService(repository)

    await expect(service.cancelErrand(user, 'errand-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    })
    expect(repository.cancel).toHaveBeenCalledWith('errand-1', user.sub)
  })

  it('rejects requester cancellation unless the errand is open', async () => {
    const repository = {
      cancel: vi.fn().mockRejectedValue(new Error('ERRAND NOT IN OPEN')),
    } as unknown as ErrandRepository
    const service = new ErrandService(repository)

    await expect(service.cancelErrand(user, 'errand-1')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      statusCode: 409,
    })
    expect(repository.cancel).toHaveBeenCalledWith('errand-1', user.sub)
  })

  it('rejects cancellation of already cancelled errand', async () => {
    const repository = {
      cancel: vi.fn().mockRejectedValue(new Error('ERRAND ALREADY CANCELLED')),
    } as unknown as ErrandRepository
    const service = new ErrandService(repository)

    await expect(service.cancelErrand(user, 'errand-1')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      statusCode: 409,
    })
    expect(repository.cancel).toHaveBeenCalledWith('errand-1', user.sub)
  })
})

describe('ErrandService acceptance protection', () => {
  it('rejects acceptance when the requester profile no longer exists', async () => {
    const repository = {
      expireOpenErrands: vi.fn().mockResolvedValue(0),
      findRequesterForAcceptance: vi.fn().mockResolvedValue('deleted-requester'),
      accept: vi.fn(),
    } as unknown as ErrandRepository
    const service = new ErrandService(
      repository,
      undefined as never,
      undefined as never,
      { getProfile: vi.fn().mockResolvedValue(null) } as never,
    )

    await expect(
      service.acceptErrand({ ...user, sub: 'courier-1' }, 'errand-1'),
    ).rejects.toMatchObject({
      code: 'REQUESTER_DELETED',
      statusCode: 409,
    })
    expect(repository.accept).not.toHaveBeenCalled()
  })

  it('checks the requester profile before accepting a valid errand', async () => {
    const errand = {
      id: 'errand-1',
      requesterSub: 'requester-1',
      courierSub: 'courier-1',
      courierProfile: null,
      status: 'ACCEPTED' as const,
    }
    const repository = {
      expireOpenErrands: vi.fn().mockResolvedValue(0),
      findRequesterForAcceptance: vi.fn().mockResolvedValue('requester-1'),
      accept: vi.fn().mockResolvedValue(errand),
    } as unknown as ErrandRepository
    const getProfile = vi.fn().mockResolvedValue({ username: 'Requester', profilePictureUrl: null })
    const service = new ErrandService(
      repository,
      undefined as never,
      undefined as never,
      { getProfile } as never,
    )

    await service.acceptErrand({ ...user, sub: 'courier-1' }, 'errand-1')

    expect(getProfile).toHaveBeenCalledWith('requester-1')
    expect(repository.accept).toHaveBeenCalledWith('errand-1', 'courier-1')
  })
})
