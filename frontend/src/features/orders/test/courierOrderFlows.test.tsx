import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { routeTree } from '#/routes'
import { setAccessToken } from '#/features/auth/lib/accessTokenStore'
import { AuthProvider } from '#/features/auth/providers/AuthProvider'
import { axiosClient } from '#/lib/axiosClient'
import { orderFixture } from './orderFixtures'
import type { Errand } from '../types/errand.types'
import type * as OrdersApi from '../api/orders.api'

vi.mock('#/features/auth/api/userProfile.api', () => ({
  getUserProfile: vi.fn(async () => ({
    id: 'courier',
    name: 'Jamie',
    email: 'jamie@example.com',
    roles: ['USER'],
    avatarUrl: null,
  })),
}))
vi.mock('#/lib/realtime', () => ({
  connectRealtime: () => ({ on: vi.fn(), off: vi.fn() }),
}))
vi.mock('../api/orders.api', async (original) => ({
  ...(await original<typeof OrdersApi>()),
  getChat: vi.fn(async () => ({ messages: [], reads: [] })),
}))
vi.mock('#/features/credits/api/credits.api', () => ({
  getCreditBalance: vi.fn(async () => ({
    availableBalance: 15,
    reservedBalance: 0,
  })),
}))

let client: QueryClient
let order: Errand
const list = (items = [order], page = 0, total = items.length) => ({
  data: { items, page, total, size: 20 },
})
const failure = (code: string, status = 409) => {
  const error = new AxiosError('Request failed')
  error.response = {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { code },
  }
  return error
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  setAccessToken(
    `header.${btoa(JSON.stringify({ sub: 'courier', roles: ['USER'] }))}.signature`,
  )
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  order = orderFixture({ expiresAt: '2099-01-01T01:00:00Z' })
  vi.spyOn(axiosClient, 'get').mockImplementation(async (url) =>
    url === '/orders' || url === '/orders/mine' ? list() : { data: order },
  )
})
afterEach(() => {
  cleanup()
  client.clear()
  setAccessToken(null)
  vi.restoreAllMocks()
})

const setup = (path: string) => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: {
      auth: {
        ensureAuthenticated: async () => true,
        completeLogin: () => {},
        logout: async () => {},
      },
    },
  })
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { router, user: userEvent.setup() }
}
const openDetails = async (path = '/home?mode=courier') => {
  const result = setup(path)
  const onDeliver = path.startsWith('/home')
  if (onDeliver) {
    await screen.findByRole('button', { name: /Campus Cafe.*Library/ })
    await result.user.click(screen.getByRole('link', { name: 'View route' }))
  } else {
    await result.user.click(
      await screen.findByRole('link', { name: /Campus Cafe.*Library/ }),
    )
  }
  await screen.findByText('COM1, Lobby')
  expect(result.router.state.location.pathname).toBe(`/errands/${order.id}`)
  return result
}
const assignedPath = '/errands?participation=delivering&tab=active&page=0'

it.each(['accept', 'pickup'] as const)(
  'performs %s once and keeps the action disabled while waiting',
  async (operation) => {
    const pickup = operation === 'pickup'
    if (pickup)
      order = {
        ...order,
        status: 'ACCEPTED',
        courier: { id: 'courier', name: 'Jamie' },
      }
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const post = vi.spyOn(axiosClient, 'post').mockImplementation(async () => {
      await pending
      order = {
        ...order,
        status: pickup ? 'PICKED_UP' : 'ACCEPTED',
        courier: { id: 'courier', name: 'Jamie' },
      }
      return {
        data: {
          errandId: order.id,
          status: order.status,
          creditState: order.creditState,
        },
      }
    })
    const { user } = await openDetails(pickup ? assignedPath : undefined)
    await user.click(
      screen.getByRole('button', {
        name: pickup ? "I've collected it" : 'Accept errand',
      }),
    )
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await act(async () => finish())
    await screen.findByText('Errand updated.')
    expect(post).toHaveBeenCalledExactlyOnceWith(
      `/orders/${order.id}/${pickup ? 'pick-up' : 'accept'}`,
      undefined,
      { timeout: 15_000 },
    )
    expect(
      screen.queryByRole('button', {
        name: pickup ? "I've collected it" : 'Accept errand',
      }),
    ).not.toBeInTheDocument()
    expect(axiosClient.get).toHaveBeenCalledWith(
      `/orders/${order.id}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  },
)

it.each(['accept', 'pickup'] as const)(
  'refreshes after a lost %s response without automatically submitting again',
  async (operation) => {
    const pickup = operation === 'pickup'
    if (pickup)
      order = {
        ...order,
        status: 'ACCEPTED',
        courier: { id: 'courier', name: 'Jamie' },
      }
    const post = vi.spyOn(axiosClient, 'post').mockImplementation(async () => {
      order = {
        ...order,
        status: pickup ? 'PICKED_UP' : 'ACCEPTED',
        courier: { id: 'courier', name: 'Jamie' },
      }
      throw new Error('Response lost')
    })
    const { user } = await openDetails(pickup ? assignedPath : undefined)
    await user.click(
      screen.getByRole('button', {
        name: pickup ? "I've collected it" : 'Accept errand',
      }),
    )
    await screen.findByRole('alert')
    await waitFor(() =>
      expect(
        screen.queryByRole('button', {
          name: pickup ? "I've collected it" : 'Accept errand',
        }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.queryByText('Errand updated.')).not.toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(1)
  },
)

it('lets the courier review photos before submitting them all at once', async () => {
  let blobs = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++blobs}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  order = {
    ...order,
    status: 'PICKED_UP',
    courier: { id: 'courier', name: 'Jamie' },
  }
  vi.mocked(axiosClient.get).mockImplementation(async (url) =>
    url === '/orders' || url === '/orders/mine'
      ? list()
      : url.endsWith('/delivery-photos')
        ? {
            data: ['p1', 'p2'].map((id) => ({
              id,
              url: `https://photos.test/${id}.jpg`,
              expiresAt: '2099-01-01T00:00:00Z',
            })),
          }
        : { data: order },
  )
  const post = vi.spyOn(axiosClient, 'post').mockImplementation(async () => {
    order = {
      ...order,
      status: 'DELIVERED',
      deliveredAt: '2030-01-01T00:30:00Z',
      hasDeliveryPhoto: true,
    }
    return {
      data: {
        errandId: order.id,
        status: order.status,
        creditState: order.creditState,
      },
    }
  })
  const { user } = await openDetails(assignedPath)
  await user.click(screen.getByRole('button', { name: 'Mark as delivered' }))
  const submit = await screen.findByRole('button', { name: 'Submit photo' })
  expect(submit).toBeDisabled()
  const input = screen.getByLabelText('Delivery photos')
  await user.upload(
    input,
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', {
      type: 'image/png',
    }),
  )
  expect(
    screen.getByText('Please choose an image up to 5 MB.'),
  ).toBeInTheDocument()
  expect(submit).toBeDisabled()

  // review the three photos, shown large one at a time.
  const photos = ['a', 'b', 'c'].map(
    (name) => new File([name], `${name}.png`, { type: 'image/png' }),
  )
  await user.upload(input, photos)
  expect(screen.getByRole('img', { name: 'Photo 1 of 3' })).toHaveAttribute(
    'src',
    'blob:1',
  )
  await user.click(screen.getByRole('button', { name: 'View photo 3' }))
  expect(screen.getByRole('img', { name: 'Photo 3 of 3' })).toHaveAttribute(
    'src',
    'blob:3',
  )
  // adjust the 2nd photo taken
  await user.click(screen.getByRole('button', { name: 'Remove photo 2' }))
  expect(screen.getByText(/2 of 5 photos/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Submit 2 photos' }))

  // one submission with both photos, in order
  expect(post).toHaveBeenCalledExactlyOnceWith(
    `/orders/${order.id}/deliver`,
    expect.any(FormData),
    { timeout: 120_000 },
  )
  expect((post.mock.calls[0][1] as FormData).getAll('photos')).toEqual([
    photos[0],
    photos[2],
  ])
  await screen.findByText('Delivered. Errand updated.')
  expect(
    await screen.findByText('Delivered. Waiting for Alex to confirm receipt.'),
  ).toBeInTheDocument()
  // after submitting, the photos are view-only.
  expect(
    await screen.findAllByRole('img', { name: /^Delivery photo/ }),
  ).toHaveLength(2)
  expect(
    screen.queryByRole('button', { name: 'Mark as delivered' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /Remove/ }),
  ).not.toBeInTheDocument()
})

it('shows account preparation after rejected acceptance without reporting success', async () => {
  vi.spyOn(axiosClient, 'post').mockRejectedValue(
    failure('CREDIT_ACCOUNT_PENDING'),
  )
  const { user } = await openDetails()
  await user.click(screen.getByRole('button', { name: 'Accept errand' }))
  await screen.findByText(
    'Your credit account is being prepared. Please wait and try again.',
  )
  expect(screen.queryByText('Errand updated.')).not.toBeInTheDocument()
})

it.each([
  { status: 'ACCEPTED' as const },
  { expiresAt: '2020-01-01T00:00:00Z' },
])('uses fresh details to prevent acceptance: %j', async (changes) => {
  vi.mocked(axiosClient.get).mockImplementation(async (url) =>
    url === '/orders' ? list() : { data: { ...order, ...changes } },
  )
  await openDetails()
  expect(
    screen.queryByRole('button', { name: 'Accept errand' }),
  ).not.toBeInTheDocument()
})

it.each(['/home?mode=courier', assignedPath])(
  'requests the next server page from %s',
  async (path) => {
    const assigned = path === assignedPath
    if (assigned)
      order = {
        ...order,
        status: 'ACCEPTED',
        courier: { id: 'courier', name: 'Jamie' },
      }
    vi.mocked(axiosClient.get).mockResolvedValue(list([order], 0, 21))
    const { user, router } = setup(path)
    await screen.findByRole(assigned ? 'link' : 'button', {
      name: /Campus Cafe.*Library/,
    })
    vi.mocked(axiosClient.get).mockResolvedValue(list([order], 1, 21))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(axiosClient.get).toHaveBeenLastCalledWith(
        assigned ? '/orders/mine' : '/orders',
        expect.objectContaining({
          params: expect.objectContaining({
            page: 1,
            size: 20,
            ...(assigned ? { as: 'courier', view: 'active' } : { q: '' }),
          }),
        }),
      ),
    )
    expect(router.state.location.search.page).toBe(1)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
  },
)

it.each(['/home?mode=courier', assignedPath])(
  'retries a failed list and displays its empty state on %s',
  async (path) => {
    vi.mocked(axiosClient.get)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValue(list([]))
    const { user } = setup(path)
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText(
      path === assignedPath
        ? /No active errands match this view/
        : 'No open errands right now. Check back soon.',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  },
)

it.each([
  ['SETTLEMENT_PENDING', 'Settlement pending'],
  ['SETTLED', 'Settled'],
] as const)(
  'displays fresh payment state %s without a pickup action',
  async (creditState, label) => {
    order = {
      ...order,
      status: 'COMPLETED',
      creditState: 'SETTLEMENT_PENDING',
      courier: { id: 'courier', name: 'Jamie' },
    }
    vi.mocked(axiosClient.get).mockImplementation(async (url) =>
      url === '/orders/mine' ? list() : { data: { ...order, creditState } },
    )
    await openDetails('/errands?participation=delivering&tab=history&page=0')
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: "I've collected it" }),
    ).not.toBeInTheDocument()
  },
)

it('hides pickup until a failed detail query is successfully retried', async () => {
  order = {
    ...order,
    status: 'ACCEPTED',
    courier: { id: 'courier', name: 'Jamie' },
  }
  let unavailable = true
  vi.mocked(axiosClient.get).mockImplementation(async (url) => {
    if (url === '/orders/mine') return list()
    if (unavailable) throw new Error('Unavailable')
    return { data: order }
  })
  const { user } = setup(assignedPath)
  await user.click(
    await screen.findByRole('link', { name: /Campus Cafe.*Library/ }),
  )
  await screen.findByRole('alert')
  expect(
    screen.queryByRole('button', { name: "I've collected it" }),
  ).not.toBeInTheDocument()
  unavailable = false
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByRole('button', { name: "I've collected it" })
})
