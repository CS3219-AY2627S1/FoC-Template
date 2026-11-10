import type { CreateOrderRequest, Order } from './models'

type SubmissionAPI = {
  create: (request: CreateOrderRequest, key: string) => Promise<Order>
  update: (id: string, action: 'cancel') => Promise<Order>
  requested: () => Promise<Order[]>
}
export const isRetryableSubmissionError = (error: unknown): boolean => {
  const status = (error as { status?: number } | null)?.status
  return status === 0 || status === 408 || status === 429 || (status !== undefined && status >= 500)
}
class AwaitingReservation extends Error {}

export const retryDelay = (retry: number, random = Math.random): number =>
  Math.round(Math.min(1000 * 2 ** retry, 15000) * (0.5 + random() * 0.5))

const sleep = (ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  signal.throwIfAborted()
  const abort = () => { clearTimeout(timer); reject(signal.reason) }
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
  signal.addEventListener('abort', abort, { once: true })
})

/** Every attempt replays the same creation, also recovering lost cancellation responses. */
export async function submitWithRetry(options: {
  api: SubmissionAPI
  request: CreateOrderRequest
  key: string
  wantsCancellation: () => boolean
  signal: AbortSignal
  onRetry: (attempt: number, delay: number) => void
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
  maxAttempts?: number
}): Promise<{ order: Order; cancellationUnavailable: boolean }> {
  const { api, request, key, wantsCancellation, signal, onRetry, wait = sleep, maxAttempts = 6 } = options
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    try {
      const order = await api.create(request, key)
      signal.throwIfAborted()
      if (!wantsCancellation()) return { order, cancellationUnavailable: false }
      if (order.status === 'cancelled') return { order, cancellationUnavailable: false }
      // The current backend can cancel only after credit reservation completes.
      if (order.status === 'init') throw new AwaitingReservation('Waiting for credit reservation before cancellation. Retry the same request to confirm the outcome.')
      if (order.status !== 'open') return { order, cancellationUnavailable: true }
      try {
        const cancelled = await api.update(order.id, 'cancel')
        return { order: cancelled, cancellationUnavailable: cancelled.status !== 'cancelled' }
      } catch (error) {
        if ((error as { status?: number })?.status !== 409) throw error
        // Cancellation may already have succeeded, or another user accepted the order.
        const current = (await api.requested()).find((entry) => entry.id === order.id)
        if (!current) throw error
        return { order: current, cancellationUnavailable: current.status !== 'cancelled' }
      }
    } catch (error) {
      signal.throwIfAborted()
      if (!(error instanceof AwaitingReservation) && !isRetryableSubmissionError(error)) throw error
      if (attempt + 1 >= maxAttempts) throw error
      const delay = retryDelay(attempt)
      onRetry(attempt + 2, delay)
      await wait(delay, signal)
    }
  }
}
