import { afterEach, expect, it, vi } from 'vitest'

import { authRequest, AuthRequestError } from './authRequest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('preserves HTTP errors even when the server returns non-JSON content', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Duplicate email' }), {
        status: 400,
      }),
    )
    .mockResolvedValueOnce(
      new Response('<html>Bad gateway</html>', { status: 502 }),
    )
  vi.stubGlobal('fetch', fetchMock)

  await expect(authRequest('/auth/register')).rejects.toMatchObject({
    status: 400,
    detail: 'Duplicate email',
  })
  await expect(authRequest('/auth/login')).rejects.toMatchObject({
    status: 502,
  })
})

it('aborts a stalled request at its timeout instead of leaving logout waiting', async () => {
  vi.useFakeTimers()
  let signal!: AbortSignal
  vi.stubGlobal(
    'fetch',
    vi.fn((_path: string, options: RequestInit) => {
      signal = options.signal as AbortSignal
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      })
    }),
  )
  const request = authRequest('/auth/refresh', undefined, 15_000)
  const assertion = expect(request).rejects.toBeInstanceOf(AuthRequestError)
  await vi.advanceTimersByTimeAsync(15_000)

  await assertion
  expect(signal.aborted).toBe(true)
})
