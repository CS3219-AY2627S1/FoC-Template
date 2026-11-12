/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-09
 * Scope: Generated and refined notification API tests.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { authenticatedFetch } from '../auth/auth.fetch'
import { openNotificationStream } from './notification.api'

vi.mock('../auth/auth.fetch', () => ({ authenticatedFetch: vi.fn() }))

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

it('reconnects after a stream closes and cancels the new request on logout', async () => {
  vi.useFakeTimers()
  const item = {
    id: 'first',
    type: 'ERRAND_DELIVERED',
    data: { errandId: 'errand' },
    message: 'Delivered',
    createdAt: '2026-11-08T00:00:00Z',
    readAt: null,
  }
  const headers = { 'Content-Type': 'text/event-stream' }
  const connected = 'event:connected\ndata:{}\n\n'
  vi.mocked(authenticatedFetch)
    .mockResolvedValueOnce(new Response(connected, { headers }))
    .mockResolvedValueOnce(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          connected + 'event:notification\ndata:' + JSON.stringify(item) + '\n\n',
        ))
      },
    }), { headers }))
  const controller = new AbortController()
  const onConnected = vi.fn()
  const onReconnect = vi.fn()
  const onNotification = vi.fn()

  const streaming = openNotificationStream({
    signal: controller.signal, onConnected, onReconnect, onNotification,
  })
  await vi.advanceTimersByTimeAsync(1000)
  expect(onConnected).toHaveBeenCalledTimes(2)
  expect(onReconnect).toHaveBeenCalledOnce()
  expect(onNotification).toHaveBeenCalledWith(item)

  const activeSignal = vi.mocked(authenticatedFetch).mock.calls[1][1]?.signal
  controller.abort()
  await streaming
  expect(activeSignal?.aborted).toBe(true)
  await vi.advanceTimersByTimeAsync(30_000)
  expect(authenticatedFetch).toHaveBeenCalledTimes(2)
})
