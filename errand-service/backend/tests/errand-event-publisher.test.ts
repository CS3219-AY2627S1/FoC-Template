/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-03
 * Scope: Generated errand event publisher tests
 * Author review: Verified test correctness.
 */

import { describe, expect, it, vi } from 'vitest'
import type { Kafka } from 'kafkajs'
import type { ErrandRepository } from '../src/repositories/errand.repository.js'
import { ErrandEventPublisher } from '../../event-publisher/errand-event-publisher.js'

function setup() {
  const repository = {
    unpublishedEvents: vi.fn().mockResolvedValue([
      {
        id: 'stable-event-id',
        eventType: 'ErrandCancelled',
        payload: { errandId: 'errand-id', actorSub: 'requester' },
      },
    ]),
    markEventPublished: vi.fn().mockResolvedValue(undefined),
    deleteOldPublishedEvents: vi.fn().mockResolvedValue(0),
  }
  const producer = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue([]),
  }
  const kafka = { producer: () => producer } as unknown as Kafka
  const worker = new ErrandEventPublisher(
    kafka,
    repository as unknown as ErrandRepository,
    'errand-events',
  )
  return { repository, producer, worker }
}

describe('errand outbox publisher', () => {
  it('publishes stored payload and ID before marking delivered and pruning old rows', async () => {
    const { repository, producer, worker } = setup()
    await worker.flush()
    expect(producer.send).toHaveBeenCalledOnce()
    const record = producer.send.mock.calls[0][0] as { messages: { key: string; value: string }[] }
    expect(record.messages[0].key).toBe('errand-id')
    expect(JSON.parse(record.messages[0].value)).toMatchObject({
      eventId: 'stable-event-id',
      eventType: 'ErrandCancelled',
      payload: { errandId: 'errand-id', actorSub: 'requester' },
    })
    expect(repository.markEventPublished).toHaveBeenCalledWith('stable-event-id')
    expect(producer.send.mock.invocationCallOrder[0]).toBeLessThan(
      repository.markEventPublished.mock.invocationCallOrder[0],
    )
    expect(repository.deleteOldPublishedEvents).toHaveBeenCalledOnce()
    expect(repository.deleteOldPublishedEvents.mock.calls[0][0]).toBeInstanceOf(Date)
  })

  it('does not mark a failed publish and retries on the next flush', async () => {
    const { repository, producer, worker } = setup()
    producer.send.mockRejectedValueOnce(new Error('Kafka unavailable'))
    await expect(worker.flush()).rejects.toThrow('Kafka unavailable')
    expect(repository.markEventPublished).not.toHaveBeenCalled()
    expect(repository.deleteOldPublishedEvents).toHaveBeenCalledOnce()
    await worker.flush()
    expect(repository.markEventPublished).toHaveBeenCalledWith('stable-event-id')
  })
})
