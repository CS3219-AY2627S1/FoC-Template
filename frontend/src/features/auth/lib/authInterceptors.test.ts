import { AxiosError } from 'axios'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'

import { axiosClient } from '#/lib/axiosClient'
import { setupAuthInterceptors } from './authInterceptors'
import { AuthRequestError } from './authRequest'
import { setAccessToken, getAccessToken } from './accessTokenStore'
import { refreshAccessToken } from './refreshAccessToken'
import { refreshSession } from '../api/refreshSession.api'

vi.mock('../api/refreshSession.api', () => ({ refreshSession: vi.fn() }))

let recoveryEnabled = true
const onLoginRequired = vi.fn(() => {
  setAccessToken(null)
  recoveryEnabled = false
})
let removeInterceptors: () => void

const refresh = vi.mocked(refreshSession)

const tokens = (revision = 'original', remaining = 300_000, sub = 'A') => ({
  accessToken: `header.${btoa(JSON.stringify({ sub, revision }))}.signature`,
  expiresAt: new Date(Date.now() + remaining).toISOString(),
})

const response = (
  config: InternalAxiosRequestConfig,
  status = 200,
): AxiosResponse => ({
  config,
  status,
  statusText: '',
  headers: {},
  data: 'private result',
})

const fail = (config: InternalAxiosRequestConfig, status: number): never => {
  throw new AxiosError(
    'Failed',
    undefined,
    config,
    undefined,
    response(config, status),
  )
}

beforeEach(() => {
  onLoginRequired.mockClear()
  recoveryEnabled = true
  removeInterceptors = setupAuthInterceptors(axiosClient, {
    canRefresh: () => recoveryEnabled,
    authenticationFailed: onLoginRequired,
  })
  setAccessToken(null)
  refresh.mockReset()
  setAccessToken(tokens().accessToken)
})

afterEach(() => {
  removeInterceptors()
  setAccessToken(null)
  vi.restoreAllMocks()
})

it('attaches the current token without proactively refreshing', async () => {
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) =>
    response(config),
  )
  await axiosClient.get('/users/test', { adapter })
  expect(adapter.mock.calls[0][0].headers.get('Authorization')).toBe(
    `Bearer ${tokens().accessToken}`,
  )
  expect(refresh).not.toHaveBeenCalled()
})

it('refreshes a rejected token and retries the request', async () => {
  refresh.mockResolvedValue(tokens('fresh'))
  const seen: Array<string> = []
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    seen.push(String(config.headers.get('Authorization')))
    if (seen.length === 1) fail(config, 401)
    return response(config)
  })
  await axiosClient.get('/users/test', { adapter })

  expect(seen).toEqual([
    `Bearer ${tokens().accessToken}`,
    `Bearer ${tokens('fresh').accessToken}`,
  ])
  expect(refresh).toHaveBeenCalledTimes(1)
})

it('blocks automatic recovery after a second 401', async () => {
  refresh.mockResolvedValue(tokens('fresh'))
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) =>
    fail(config, 401),
  )

  await expect(
    axiosClient.get('/users/test', { adapter }),
  ).rejects.toBeInstanceOf(AxiosError)
  expect(adapter).toHaveBeenCalledTimes(2)
  expect(onLoginRequired).toHaveBeenCalledTimes(1)
  expect(getAccessToken()).toBeNull()
  expect(refresh).toHaveBeenCalledTimes(1)
})

it('preserves a newer token when a retried request returns a late 401', async () => {
  const t2 = tokens('T2')
  refresh.mockResolvedValueOnce(tokens('T1')).mockResolvedValueOnce(t2)
  let rejectRetry!: (error: unknown) => void
  let retryConfig!: InternalAxiosRequestConfig
  const sent: Array<string> = []
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    sent.push(String(config.headers.get('Authorization')))
    if (sent.length === 1) return fail(config, 401)
    retryConfig = config
    return new Promise<AxiosResponse>((_, reject) => {
      rejectRetry = reject
    })
  })
  const request = axiosClient.get('/users/test', { adapter })
  await vi.waitFor(() => expect(retryConfig).toBeDefined())

  expect(sent).toEqual([
    `Bearer ${tokens().accessToken}`,
    `Bearer ${tokens('T1').accessToken}`,
  ])

  // Another caller refreshes within the same login while T1's retry is pending.
  await refreshAccessToken()
  const lateError = new AxiosError(
    'Failed',
    undefined,
    retryConfig,
    undefined,
    response(retryConfig, 401),
  )
  const assertion = expect(request).rejects.toBe(lateError)
  rejectRetry(lateError)
  await assertion

  expect(getAccessToken()).toBe(t2.accessToken)
  expect(onLoginRequired).not.toHaveBeenCalled()
  expect(recoveryEnabled).toBe(true)
  expect(adapter).toHaveBeenCalledTimes(2)
  expect(refresh).toHaveBeenCalledTimes(2)
})

it('shares refresh for concurrent 401s', async () => {
  let resolve!: (value: ReturnType<typeof tokens>) => void
  refresh.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    if (
      config.headers.get('Authorization') === `Bearer ${tokens().accessToken}`
    )
      fail(config, 401)
    return response(config)
  })
  const first = axiosClient.get('/users/a', { adapter })
  const second = axiosClient.get('/users/b', { adapter })
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  resolve(tokens('fresh'))
  await Promise.all([first, second])

  expect(refresh).toHaveBeenCalledTimes(1)
  expect(adapter).toHaveBeenCalledTimes(4)
})

it('reuses a newer token for a late 401', async () => {
  let rejectLate!: (error: unknown) => void
  let lateConfig!: InternalAxiosRequestConfig
  refresh.mockResolvedValue(tokens('fresh'))
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    if (
      config.headers.get('Authorization') ===
      `Bearer ${tokens('fresh').accessToken}`
    )
      return response(config)
    if (config.url === '/users/late') {
      lateConfig = config
      return new Promise<AxiosResponse>((_, reject) => {
        rejectLate = reject
      })
    }
    return fail(config, 401)
  })
  const late = axiosClient.get('/users/late', { adapter })
  await vi.waitFor(() => expect(lateConfig).toBeDefined())
  await axiosClient.get('/users/early', { adapter })
  rejectLate(
    new AxiosError(
      'Failed',
      undefined,
      lateConfig,
      undefined,
      response(lateConfig, 401),
    ),
  )
  await late

  expect(refresh).toHaveBeenCalledTimes(1)
})

it.each([403, 502])('does not refresh HTTP %s', async (status) => {
  await expect(
    axiosClient.get('/users/test', {
      adapter: async (config) => fail(config, status),
    }),
  ).rejects.toBeInstanceOf(AxiosError)
  expect(refresh).not.toHaveBeenCalled()
  expect(onLoginRequired).not.toHaveBeenCalled()
})

it('preserves the session on refresh service failure', async () => {
  const error = new Error('offline')
  refresh.mockRejectedValue(error)

  await expect(
    axiosClient.get('/users/test', {
      adapter: async (config) => fail(config, 401),
    }),
  ).rejects.toBe(error)
  expect(onLoginRequired).not.toHaveBeenCalled()
})

it.each(['/auth/refresh', 'https://example.com/users', '//example.com/users'])(
  'rejects non-business destination %s',
  async (url) => {
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) =>
      response(config),
    )

    await expect(axiosClient.get(url, { adapter })).rejects.toThrow(
      'relative business API path',
    )
    expect(adapter).not.toHaveBeenCalled()
  },
)

it('requires login when refresh rejects credentials', async () => {
  const refreshError = new AuthRequestError(401)
  refresh.mockRejectedValue(refreshError)
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) =>
    fail(config, 401),
  )

  await expect(axiosClient.get('/users/test', { adapter })).rejects.toBe(
    refreshError,
  )
  expect(adapter).toHaveBeenCalledTimes(1)
  expect(onLoginRequired).toHaveBeenCalledTimes(1)
  expect(getAccessToken()).toBeNull()
  expect(refresh).toHaveBeenCalledTimes(1)
})

it('requires login instead of replaying account A creation with account B from a shared refresh cookie', async () => {
  refresh.mockResolvedValue(tokens('refreshed-in-another-tab', 300_000, 'B'))
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) =>
    fail(config, 401),
  )

  await expect(
    axiosClient.post(
      '/orders',
      { description: 'Account A input' },
      { adapter },
    ),
  ).rejects.toMatchObject({ name: 'AuthRequestError', status: 401 })

  expect(adapter).toHaveBeenCalledOnce()
  expect(adapter.mock.calls[0][0].headers.get('Authorization')).toBe(
    `Bearer ${tokens().accessToken}`,
  )
  expect(refresh).toHaveBeenCalledOnce()
  expect(onLoginRequired).toHaveBeenCalledOnce()
  expect(getAccessToken()).toBeNull()
  expect(recoveryEnabled).toBe(false)
})

it.each([
  [200, 'B'],
  [401, 'B'],
  [200, null],
  [401, null],
] as const)(
  'discards account A HTTP %s when the current account is %s',
  async (status, currentUser) => {
    let finish!: () => void
    const adapter = vi.fn(
      (config: InternalAxiosRequestConfig) =>
        new Promise<AxiosResponse>((resolve, reject) => {
          finish = () =>
            status === 200
              ? resolve(response(config))
              : reject(
                  new AxiosError(
                    'Unauthorized',
                    undefined,
                    config,
                    undefined,
                    response(config, status),
                  ),
                )
        }),
    )
    const pending = axiosClient.post(
      '/orders',
      { description: 'Account A input' },
      { adapter },
    )
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'ERR_CANCELED',
    })
    const currentToken = currentUser
      ? tokens('new-login', 300_000, currentUser).accessToken
      : null
    setAccessToken(currentToken)
    finish()
    await assertion
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    expect(onLoginRequired).not.toHaveBeenCalled()
    expect(getAccessToken()).toBe(currentToken)
  },
)

it.each([200, 401])(
  'allows pending account A HTTP %s after logging out and back in as A',
  async (status) => {
    let finish!: () => void
    const adapter = vi.fn(
      (config: InternalAxiosRequestConfig) =>
        new Promise<AxiosResponse>((resolve, reject) => {
          if (
            config.headers.get('Authorization') !==
            `Bearer ${tokens().accessToken}`
          ) {
            resolve(response(config))
            return
          }
          finish = () =>
            status === 200
              ? resolve(response(config))
              : reject(
                  new AxiosError(
                    'Unauthorized',
                    undefined,
                    config,
                    undefined,
                    response(config, status),
                  ),
                )
        }),
    )
    const pending = axiosClient.post(
      '/orders',
      { description: 'Account A input' },
      { adapter },
    )
    setAccessToken(null)
    const next = tokens('new-login').accessToken
    setAccessToken(next)
    finish()

    await expect(pending).resolves.toMatchObject({ status: 200 })
    expect(adapter).toHaveBeenCalledTimes(status === 401 ? 2 : 1)
    expect(refresh).not.toHaveBeenCalled()
    expect(onLoginRequired).not.toHaveBeenCalled()
    expect(getAccessToken()).toBe(next)
    if (status === 401)
      expect(adapter.mock.calls[1][0].headers.get('Authorization')).toBe(
        `Bearer ${next}`,
      )
  },
)

it('does not replay an old request when the login changes during token refresh', async () => {
  let finishRefresh!: (value: ReturnType<typeof tokens>) => void
  refresh.mockReturnValue(
    new Promise((resolve) => {
      finishRefresh = resolve
    }),
  )
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) =>
    fail(config, 401),
  )
  const pending = axiosClient.post('/orders', {}, { adapter })
  const assertion = expect(pending).rejects.toMatchObject({
    code: 'ERR_CANCELED',
  })
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  // AuthProvider invalidates an in-flight refresh before replacing the login.
  const { invalidateRefresh } = await import('./refreshAccessToken')
  invalidateRefresh()
  const accountB = tokens('new-login', 300_000, 'B').accessToken
  setAccessToken(accountB)
  finishRefresh(tokens('old-account-refreshed'))
  await assertion
  expect(adapter).toHaveBeenCalledOnce()
  expect(getAccessToken()).toBe(accountB)
})
