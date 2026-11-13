import { describe, expect, it, vi } from 'vitest'
import type { ErrandRepository } from '../src/repositories/errand.repository.js'
import { PendingErrandWorker } from '../src/workers/pending-errand.worker.js'

describe('pending errand recovery worker', () => {
  it('scans 30-second-old rows without publishing events', async () => {
    const repository = { recoverExpiredPending: vi.fn().mockResolvedValue(1) }
    const worker = new PendingErrandWorker(repository as unknown as ErrandRepository)
    await worker.runOnce(new Date('2026-10-16T12:00:00.000Z'))
    expect(repository.recoverExpiredPending).toHaveBeenCalledWith(
      new Date('2026-10-16T11:59:30.000Z'),
    )
  })

  it('retries repository failures on the next tick', async () => {
    const repository = {
      recoverExpiredPending: vi
        .fn()
        .mockRejectedValueOnce(new Error('Database unavailable'))
        .mockResolvedValueOnce(1),
    }
    const worker = new PendingErrandWorker(repository as unknown as ErrandRepository)
    await expect(worker.runOnce()).rejects.toThrow('Database unavailable')
    await worker.runOnce()
    expect(repository.recoverExpiredPending).toHaveBeenCalledTimes(2)
  })
})
