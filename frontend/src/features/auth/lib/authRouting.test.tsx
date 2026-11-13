import { AuthRouterProvider } from '#/App'
import { AuthProvider } from '#/features/auth/providers/AuthProvider'
import { AxiosError } from 'axios'
import { axiosClient } from '#/lib/axiosClient'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, createMemoryHistory } from '@tanstack/react-router'
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthRequestError } from './authRequest'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

import { routeTree } from '#/routes'

import { refreshSession } from '../api/refreshSession.api'
import { logoutUser } from '../api/logoutUser.api'
import { setAccessToken, getAccessToken } from './accessTokenStore'
import type { AccessTokenResponse } from '../types/auth.types'
import { getCreditBalance } from '#/features/credits/api/credits.api'
import { listSuppliers } from '#/features/suppliers/api/suppliers.api'

vi.mock('../api/logoutUser.api', () => ({ logoutUser: vi.fn() }))
vi.mock('#/features/suppliers/api/suppliers.api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listSuppliers: vi.fn(async () => []),
}))
vi.mock('#/features/credits/api/credits.api', () => ({
  getCreditBalance: vi.fn(async () => ({
    availableBalance: 15,
    reservedBalance: 0,
  })),
}))
vi.mock('#/features/orders/api/orders.api', () => ({
  listMyOrders: vi.fn(async () => ({ items: [], total: 0, page: 0, size: 20 })),
  listAvailableOrders: vi.fn(async () => ({
    items: [],
    total: 0,
    page: 0,
    size: 20,
  })),
}))

vi.mock('../api/refreshSession.api', () => ({ refreshSession: vi.fn() }))

vi.mock('#/api/getFaculties.api', () => ({
  getFaculties: vi.fn(async () => ['School of Computing']),
}))

vi.mock('../api/userProfile.api', () => ({
  updateUserProfile: vi.fn(),
  changePassword: vi.fn(),
  requestEmailChange: vi.fn(),
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  getUserProfile: vi.fn(async () => ({
    id: '1',
    name: 'Alex Tan',
    email: 'alex@example.com',
    roles: ['USER'],
    avatarUrl: null,
  })),
}))

const refresh = vi.mocked(refreshSession)
const clients: Array<QueryClient> = []

const tokens = (): AccessTokenResponse => ({
  accessToken: `header.${btoa(JSON.stringify({ sub: '1', roles: ['USER'] }))}.signature`,
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
})

beforeEach(() => {
  sessionStorage.clear()
  setAccessToken(null)
  refresh.mockReset()
  vi.mocked(logoutUser).mockReset()
  vi.mocked(getCreditBalance).mockReset().mockResolvedValue({
    availableBalance: 15,
    reservedBalance: 0,
  })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  clients.forEach((client) => client.clear())
  clients.length = 0
  setAccessToken(null)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const setup = (path: string) => {
  const client = new QueryClient()
  clients.push(client)
  const router = createRouter({
    routeTree,
    context: { auth: undefined! },
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthRouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return router
}
it.each([
  ['/home?mode=courier', 17],
  ['/home?mode=requestor', 0],
] as const)(
  'shows the available credit balance on %s',
  async (path, balance) => {
    setAccessToken(tokens().accessToken)
    vi.mocked(getCreditBalance).mockResolvedValue({
      availableBalance: balance,
      reservedBalance: 3,
    })
    setup(path)

    expect(await screen.findByText(`${balance} credits`)).toBeInTheDocument()
    expect(screen.queryByText('3 credits')).not.toBeInTheDocument()
  },
)

it('keeps the header usable when the credit balance is unavailable', async () => {
  setAccessToken(tokens().accessToken)
  vi.mocked(getCreditBalance).mockRejectedValue(
    new Error('Credit account pending'),
  )
  setup('/home?mode=courier')

  await screen.findByRole('heading', { name: 'Find an errand' })
  await waitFor(() => expect(getCreditBalance).toHaveBeenCalled())
  expect(screen.getByText('Balance unavailable')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
})

it('opens My Errands from the header and returns to the home hub', async () => {
  setAccessToken(tokens().accessToken)
  const router = setup('/home?mode=courier')
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: 'Find an errand' })

  await user.click(screen.getByRole('link', { name: 'My Errands' }))
  await screen.findByRole('heading', { name: 'My Errands' })
  expect(router.state.location.pathname).toBe('/errands')
  await screen.findByText(/No active errands match this view/)

  await user.click(screen.getByRole('link', { name: 'Home' }))
  await screen.findByRole('heading', { name: 'Home' })
  expect(router.state.location.pathname).toBe('/home')
})

it('opens deliver from home and returns with the browser history', async () => {
  setAccessToken(tokens().accessToken)
  const router = setup('/home')
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: 'Home' })

  await user.click(screen.getByRole('link', { name: /Deliver/ }))
  await screen.findByRole('heading', { name: 'Find an errand' })
  expect(router.state.location.pathname).toBe('/deliver')
  expect(
    screen.queryByRole('heading', { name: 'Home' }),
  ).not.toBeInTheDocument()

  await user.click(screen.getByRole('link', { name: 'Home' }))
  await screen.findByRole('heading', { name: 'Home' })
  expect(router.state.location.pathname).toBe('/home')
  expect(
    screen.queryByRole('heading', { name: 'Find an errand' }),
  ).not.toBeInTheDocument()

  await act(async () => router.history.back())
  await screen.findByRole('heading', { name: 'Find an errand' })
  expect(router.state.location.pathname).toBe('/deliver')
  await act(async () => router.history.forward())
  await screen.findByRole('heading', { name: 'Home' })
  expect(router.state.location.pathname).toBe('/home')
})

it('returns to the home hub from deliver and from profile', async () => {
  setAccessToken(tokens().accessToken)
  const router = setup('/deliver')
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: 'Find an errand' })
  expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute(
    'aria-current',
  )

  await user.click(screen.getByRole('link', { name: 'Home' }))
  await screen.findByRole('heading', { name: 'Home' })
  expect(router.state.location.pathname).toBe('/home')
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
    'aria-current',
    'page',
  )

  await act(async () => {
    await router.navigate({ to: '/profile' })
  })
  await screen.findByRole('heading', { name: 'My Profile' })
  expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute(
    'aria-current',
  )

  await user.click(screen.getByRole('link', { name: 'Home' }))
  await screen.findByRole('heading', { name: 'Home' })
  expect(router.state.location.href).toBe('/home')
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

it.each(['/', '/home'])('opens the home hub from %s', async (path) => {
  setAccessToken(tokens().accessToken)
  const router = setup(path)
  await screen.findByRole('heading', { name: 'Home' })
  expect(router.state.location.href).toBe('/home')
})

it('sends a courier home link to find an errand', async () => {
  setAccessToken(tokens().accessToken)
  const router = setup('/home?mode=courier')
  await screen.findByRole('heading', { name: 'Find an errand' })
  expect(router.state.location.pathname).toBe('/deliver')
})

it.each(['unknown', 'true', '123', 'requestor'])(
  'ignores mode=%s and opens the home hub',
  async (mode) => {
    setAccessToken(tokens().accessToken)
    sessionStorage.setItem('foc.homeMode', 'courier')
    const router = setup(`/home?mode=${mode}`)
    await screen.findByRole('heading', { name: 'Home' })
    expect(router.state.location.pathname).toBe('/home')
    expect(router.state.location.search).toEqual({})
  },
)

it('opens home when session storage is unavailable', async () => {
  setAccessToken(tokens().accessToken)
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  const router = setup('/home')
  await screen.findByRole('heading', { name: 'Home' })
  expect(router.state.location.href).toBe('/home')
})

it.each([
  '/locations',
  '/locations?category=INVALID',
  '/locations?category=FOOD,COFFEE',
])(
  'returns invalid category URL %s to requester home without fetching suppliers',
  async (path) => {
    setAccessToken(tokens().accessToken)
    vi.mocked(listSuppliers).mockClear()
    const router = setup(path)

    expect(
      await screen.findByRole('heading', { name: 'Home' }),
    ).toBeInTheDocument()
    expect(router.state.location.href).toBe('/home')
    expect(listSuppliers).not.toHaveBeenCalled()
  },
)

it('opens a supplier category from request and returns to find a supplier', async () => {
  setAccessToken(tokens().accessToken)
  const router = setup('/home')
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: 'Home' })
  const header = screen.getByRole('banner')

  await user.click(screen.getByRole('link', { name: /Request/ }))
  await screen.findByRole('heading', { name: 'Find a supplier' })
  await user.click(screen.getByRole('link', { name: 'Coffee' }))

  expect(
    await screen.findByRole('heading', { name: 'Coffee' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/locations')
  expect(router.state.location.search).toEqual({ category: 'COFFEE' })
  expect(header).toBeInTheDocument()

  await user.click(screen.getByRole('link', { name: /Back to categories/ }))

  expect(
    await screen.findByRole('heading', { name: 'Find a supplier' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/request')
  expect(screen.getByRole('banner')).toBe(header)
})

it('shares one account layout across home, courier and profile routes', async () => {
  setAccessToken(tokens().accessToken)
  const router = setup('/home')
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: 'Home' })
  await screen.findByRole('button', { name: 'Open account for Alex Tan' })
  const header = screen.getByRole('banner')

  await act(async () => {
    await router.navigate({ to: '/deliver' })
  })
  await screen.findByRole('heading', { name: 'Find an errand' })
  expect(screen.getByRole('banner')).toBe(header)
  expect(screen.getAllByRole('main')).toHaveLength(1)

  await user.click(
    screen.getByRole('button', { name: 'Open account for Alex Tan' }),
  )
  expect(router.state.location.pathname).toBe('/deliver')
  await user.click(await screen.findByRole('menuitem', { name: 'Profile' }))
  await screen.findByRole('heading', { name: 'My Profile' })
  expect(router.state.location.pathname).toBe('/profile')
  expect(screen.getByRole('banner')).toBe(header)

  await user.click(screen.getByRole('link', { name: 'Edit Profile' }))
  await screen.findByRole('heading', { name: 'Edit Profile' })
  expect(router.state.location.pathname).toBe('/profile/edit')
  expect(screen.getByRole('banner')).toBe(header)
  expect(screen.getAllByRole('main')).toHaveLength(1)
  vi.mocked(logoutUser).mockResolvedValue()
  await user.click(
    screen.getByRole('button', { name: 'Open account for Alex Tan' }),
  )
  await user.click(await screen.findByRole('menuitem', { name: 'Log out' }))
  await screen.findByRole('heading', { name: 'Welcome Back' })
  expect(router.state.location.pathname).toBe('/login')
  expect(getAccessToken()).toBeNull()
  expect(logoutUser).toHaveBeenCalledOnce()
})

it.each(['/home', '/'])(
  'shows loading after 500ms and waits for recovery from %s',
  async (path) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    let resolve!: (value: AccessTokenResponse) => void
    refresh.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    let router!: ReturnType<typeof setup>
    await act(async () => {
      router = setup(path)
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(499))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Home' }),
    ).not.toBeInTheDocument()

    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(
      screen.queryByRole('heading', { name: 'Home' }),
    ).not.toBeInTheDocument()

    await act(async () => resolve(tokens()))

    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/home')
    expect(refresh).toHaveBeenCalledTimes(1)
  },
)

it('opens the app without showing loading when recovery finishes before 500ms', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  let resolve!: (value: AccessTokenResponse) => void
  refresh.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  await act(async () => {
    setup('/home')
  })
  await act(async () => vi.advanceTimersByTimeAsync(100))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()

  await act(async () => resolve(tokens()))

  expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
  await act(async () => vi.advanceTimersByTimeAsync(500))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('redirects to login when refresh returns 401', async () => {
  refresh.mockRejectedValue(new AuthRequestError(401))
  const router = setup('/home')

  expect(
    await screen.findByRole('heading', { name: 'Welcome Back' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
})

it('shows a safe failure and reruns beforeLoad on retry', async () => {
  refresh
    .mockRejectedValueOnce(new Error('Private server details'))
    .mockResolvedValueOnce(tokens())
  const router = setup('/home')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Something went wrong. Please try again.',
  )
  expect(screen.queryByText('Private server details')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: 'Home' }),
  ).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/home')

  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Try again' }))

  expect(
    await screen.findByRole('heading', { name: 'Home' }),
  ).toBeInTheDocument()
  expect(refresh).toHaveBeenCalledTimes(2)
})

it('routes a confirmed business authentication failure through Provider and the guard', async () => {
  setAccessToken(tokens().accessToken)
  refresh.mockResolvedValue(tokens())
  const router = setup('/home')
  await screen.findByRole('heading', { name: 'Home' })
  const adapter = vi.fn(async (config) => {
    throw new AxiosError('Unauthorized', undefined, config, undefined, {
      config,
      status: 401,
      statusText: '',
      headers: {},
      data: {},
    })
  })

  await act(async () => {
    await expect(
      axiosClient.get('/users/test', { adapter }),
    ).rejects.toBeInstanceOf(AxiosError)
  })

  expect(
    await screen.findByRole('heading', { name: 'Welcome Back' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
  expect(getAccessToken()).toBeNull()
  expect(adapter).toHaveBeenCalledTimes(2)
  expect(refresh).toHaveBeenCalledTimes(1)
})

it.each(['success', 'timeout'])(
  'waits for the current refresh %s before logout without restoring the token',
  async (outcome) => {
    setAccessToken(tokens().accessToken)
    let finishRefresh!: () => void
    refresh.mockReturnValue(
      new Promise((resolve, reject) => {
        finishRefresh = () =>
          outcome === 'success'
            ? resolve(tokens())
            : reject(new AuthRequestError())
      }),
    )
    vi.mocked(logoutUser).mockResolvedValue()
    const router = setup('/home')
    const accountButton = await screen.findByRole('button', {
      name: 'Open account for Alex Tan',
    })
    await userEvent.setup().click(accountButton)
    const button = await screen.findByRole('menuitem', { name: 'Log out' })
    const adapter = vi.fn(async (config) => {
      throw new AxiosError('Unauthorized', undefined, config, undefined, {
        config,
        status: 401,
        statusText: '',
        headers: {},
        data: {},
      })
    })
    const request = axiosClient.get('/users/test', { adapter })
    const rejectedRequest = expect(request).rejects.toBeInstanceOf(AxiosError)
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))

    fireEvent.click(button)
    fireEvent.click(button)
    expect(getAccessToken()).toBeNull()
    expect(logoutUser).not.toHaveBeenCalled()
    expect(accountButton).toBeEnabled()
    expect(router.state.location.pathname).toBe('/home')

    // A further 401 during logout must not start another refresh.
    await expect(
      axiosClient.get('/users/another', { adapter }),
    ).rejects.toBeInstanceOf(AxiosError)
    expect(refresh).toHaveBeenCalledTimes(1)
    await act(async () => {
      finishRefresh()
      await rejectedRequest
    })
    expect(
      await screen.findByRole('heading', { name: 'Welcome Back' }),
    ).toBeInTheDocument()
    expect(logoutUser).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBeNull()
    expect(adapter).toHaveBeenCalledTimes(2)
  },
)

it.each(['success', 'failure'])(
  'keeps Home visible until logout %s, then opens login',
  async (outcome) => {
    setAccessToken(tokens().accessToken)
    let finish!: () => void
    vi.mocked(logoutUser).mockReturnValue(
      new Promise<void>((resolve, reject) => {
        finish = () =>
          outcome === 'success' ? resolve() : reject(new Error('offline'))
      }),
    )
    const router = setup('/home')
    const accountButton = await screen.findByRole('button', {
      name: 'Open account for Alex Tan',
    })
    await userEvent.setup().click(accountButton)
    const button = await screen.findByRole('menuitem', { name: 'Log out' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(logoutUser).toHaveBeenCalledTimes(1))

    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/home')

    await act(async () => finish())
    expect(
      await screen.findByRole('heading', { name: 'Welcome Back' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    await act(async () => {
      await router.navigate({ to: '/home' })
    })
    expect(router.state.location.pathname).toBe('/login')
    expect(getAccessToken()).toBeNull()
    expect(refresh).not.toHaveBeenCalled()
  },
)
