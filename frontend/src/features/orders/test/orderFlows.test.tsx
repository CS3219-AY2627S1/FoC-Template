import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { CreateErrandPage } from '../pages/CreateErrandPage/CreateErrandPage'
import { OrderDetailPage } from '../pages/OrderDetailPage/OrderDetailPage'
import { MyErrandsPage } from '../pages/MyErrandsPage/MyErrandsPage'
import { AdminOrderDetailPage } from '../pages/AdminOrderDetailPage/AdminOrderDetailPage'
import { AdminOrderListPage } from '../pages/AdminOrderListPage/AdminOrderListPage'
import { orderFixture } from './orderFixtures'
import * as api from '../api/orders.api'
import { getErrandAiCapabilities } from '../api/errandAi.api'
import { loadCreation } from '../utils/creationRequest'
import { setAccessToken } from '#/features/auth/lib/accessTokenStore'

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  search: {
    tab: 'active',
    participation: 'all',
    page: 0,
    posted: false,
    requesterId: 'requester',
  },
}))
vi.mock('../api/errandAi.api', () => ({
  getErrandAiCapabilities: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => state.navigate,
  useParams: () => ({ orderId: '8e1f0000-0000-4000-8000-000000000001' }),
  useSearch: () => state.search,
  Link: ({
    children,
    to,
    className,
  }: {
    children: ReactNode
    to: string
    className?: string
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))
vi.mock('#/features/credits/hooks/useCreditBalance', () => ({
  useCreditBalance: () => ({
    isPending: false,
    isSuccess: true,
    data: { availableBalance: 15, reservedBalance: 0 },
  }),
}))
vi.mock('#/features/suppliers/hooks/usePickupLocations', () => ({
  usePickupLocations: () => ({
    data: [
      {
        id: '8e1f0000-0000-4000-8000-000000000002',
        name: 'Campus Cafe',
        address: 'COM1',
      },
    ],
    isSuccess: true,
  }),
}))
vi.mock('#/features/users/hooks/useUsersQuery', () => ({
  useUsersQuery: () => ({
    data: {
      items: [{ id: 'requester', name: 'Alex', email: 'alex@example.com' }],
      total: 1,
    },
  }),
}))
vi.mock('#/features/users/hooks/useUserQuery', () => ({
  useUserQuery: () => ({ data: { name: 'Alex', email: 'alex@example.com' } }),
}))
vi.mock('#/lib/realtime', () => ({
  connectRealtime: () => ({ on: vi.fn(), off: vi.fn() }),
}))
vi.mock('../api/orders.api', () => ({
  getOrder: vi.fn(),
  getChat: vi.fn(async () => ({ messages: [], reads: [] })),
  sendMessage: vi.fn(),
  sendChatFile: vi.fn(),
  markChatRead: vi.fn(),
  getDeliveryPhotos: vi.fn(),
  deliverOrder: vi.fn(),
  listMyOrders: vi.fn(),
  listRequesterOrders: vi.fn(),
  listAvailableOrders: vi.fn(),
  createOrder: vi.fn(),
  retryCreation: vi.fn(),
  actOnOrder: vi.fn(),
}))
const clients: Array<QueryClient> = []
const token = (userId: string) =>
  `header.${btoa(JSON.stringify({ sub: userId, roles: ['USER'] }))}.signature`
const setup = (element: ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  return {
    ...render(
      <QueryClientProvider client={client}>{element}</QueryClientProvider>,
    ),
    client,
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getErrandAiCapabilities).mockResolvedValue({
    chatEnabled: false,
    voiceEnabled: false,
  })
  state.navigate.mockReset().mockResolvedValue(undefined)
  localStorage.clear()
  setAccessToken(token('requester'))
  state.search = {
    tab: 'active',
    participation: 'all',
    page: 0,
    posted: false,
    requesterId: 'requester',
  }
  vi.mocked(api.getOrder).mockResolvedValue(orderFixture())
  vi.mocked(api.listMyOrders).mockResolvedValue({
    items: [],
    total: 0,
    page: 0,
    size: 20,
  })
  vi.mocked(api.listRequesterOrders).mockResolvedValue({
    items: [],
    total: 0,
    page: 0,
    size: 20,
  })
})
afterEach(() => {
  onlineManager.setOnline(true)
  cleanup()
  setAccessToken(null)
  clients.forEach((client) => client.clear())
  clients.length = 0
  vi.restoreAllMocks()
})
const fillCreation = async () => {
  const user = userEvent.setup()
  await user.selectOptions(
    screen.getByLabelText('Pickup location *'),
    '8e1f0000-0000-4000-8000-000000000002',
  )
  await user.type(screen.getByLabelText('Delivery location *'), 'Library')
  await user.type(screen.getByLabelText('Item *'), 'Lunch')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  return user
}

it('reports an offline creation attempt without scheduling an automatic replay', async () => {
  vi.mocked(api.createOrder).mockRejectedValue(
    new AxiosError('offline', 'ERR_NETWORK'),
  )
  onlineManager.setOnline(false)
  setup(<CreateErrandPage />)
  const user = await fillCreation()
  await user.click(screen.getByRole('button', { name: 'Post request' }))
  await screen.findByText('Creation is not confirmed')
  expect(api.createOrder).toHaveBeenCalledTimes(1)
  expect(screen.queryByText(/Last attempt failed:/)).not.toBeInTheDocument()
  expect(screen.queryByText('offline', { exact: true })).not.toBeInTheDocument()
  onlineManager.setOnline(true)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Retry original request' }),
    ).toBeEnabled(),
  )
  expect(api.createOrder).toHaveBeenCalledTimes(1)
})
it('keeps an unknown creation immutable and retries its exact original input after remount', async () => {
  vi.mocked(api.createOrder)
    .mockRejectedValueOnce(new AxiosError('timeout', 'ECONNABORTED'))
    .mockResolvedValueOnce({
      errandId: orderFixture().id,
      status: 'OPEN',
      creationFailureCode: null,
      queryUrl: '/api/orders/id',
    })
  const view = setup(<CreateErrandPage />)
  const user = await fillCreation()
  await user.click(screen.getByRole('button', { name: 'Post request' }))
  await screen.findByText('Creation is not confirmed')
  const original = vi.mocked(api.createOrder).mock.calls[0][0]
  expect(loadCreation('requester')?.input).toEqual(original)
  expect(loadCreation('another-user')).toBeNull()
  expect(screen.getByRole('button', { name: 'Back to edit' })).toBeDisabled()
  view.unmount()
  setup(<CreateErrandPage />)
  await user.click(
    screen.getByRole('button', { name: 'Retry original request' }),
  )
  await waitFor(() => expect(state.navigate).toHaveBeenCalled())
  expect(vi.mocked(api.createOrder).mock.calls[1][0]).toEqual(original)
  expect(loadCreation('requester')).toBeNull()
})
it('treats HTTP 200 CREATE_FAILED as a failure and uses a new key after editing', async () => {
  vi.mocked(api.createOrder).mockResolvedValue({
    errandId: orderFixture().id,
    status: 'CREATE_FAILED',
    creationFailureCode: 'INSUFFICIENT_BALANCE',
    queryUrl: '',
  })
  setup(<CreateErrandPage />)
  const user = await fillCreation()
  await user.click(screen.getByRole('button', { name: 'Post request' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Not enough available credits',
  )
  expect(state.navigate).not.toHaveBeenCalled()
  const first = vi.mocked(api.createOrder).mock.calls[0][0]
  await user.click(screen.getByRole('button', { name: 'Back to edit' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.click(screen.getByRole('button', { name: 'Post request' }))
  await waitFor(() => expect(api.createOrder).toHaveBeenCalledTimes(2))
  expect(vi.mocked(api.createOrder).mock.calls[1][0].createRequestId).not.toBe(
    first.createRequestId,
  )
})
it('allows cross-device retry by order ID without reconstructing the original form', async () => {
  const creating = orderFixture({
    status: 'CREATING',
    creditState: null,
    createRequestId: '8e1f0000-0000-4000-8000-000000000003',
    description: '  Original text  ',
    notes: '  Keep spacing  ',
  })
  vi.mocked(api.getOrder).mockResolvedValue(creating)
  vi.mocked(api.retryCreation).mockImplementation(async () => {
    vi.mocked(api.getOrder).mockResolvedValue({
      ...creating,
      status: 'OPEN',
      creditState: 'RESERVED',
    })
    return {
      errandId: creating.id,
      status: 'OPEN',
      creationFailureCode: null,
      queryUrl: '',
    }
  })
  setup(<OrderDetailPage />)
  await userEvent
    .setup()
    .click(
      await screen.findByRole('button', { name: 'Retry original request' }),
    )
  await screen.findByText('Open')
  expect(api.retryCreation).toHaveBeenCalledWith(creating.id)
  expect(api.createOrder).not.toHaveBeenCalled()
  expect(screen.getByText('Alex')).toBeInTheDocument()
})
it.each(['CREATING', 'OPEN'] as const)(
  'only shows the creation retry error while the latest detail remains CREATING (latest: %s)',
  async (status) => {
    const creating = orderFixture({ status: 'CREATING', creditState: null })
    vi.mocked(api.getOrder)
      .mockResolvedValueOnce(creating)
      .mockResolvedValue({
        ...creating,
        status,
        creditState: status === 'OPEN' ? 'RESERVED' : null,
      })
    vi.mocked(api.retryCreation).mockRejectedValue(
      new AxiosError('Response lost', 'ECONNABORTED'),
    )
    const { client } = setup(<OrderDetailPage />)
    await userEvent
      .setup()
      .click(
        await screen.findByRole('button', { name: 'Retry original request' }),
      )
    await waitFor(() => {
      expect(api.getOrder).toHaveBeenCalledTimes(2)
      expect(client.isMutating()).toBe(0)
    })
    expect(api.retryCreation).toHaveBeenCalledWith(creating.id)
    expect(
      screen.getByText(status === 'OPEN' ? 'Open' : 'Creating'),
    ).toBeInTheDocument()
    if (status === 'CREATING') {
      expect(
        screen.getByText('Creation is still not confirmed'),
      ).toBeInTheDocument()
    } else {
      expect(
        screen.queryByText('Creation is still not confirmed'),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText('Creation is not confirmed'),
      ).not.toBeInTheDocument()
    }
  },
)

it('uses backend OPEN after the local cutoff and still permits requester cancellation', async () => {
  vi.mocked(api.getOrder).mockResolvedValue(
    orderFixture({ expiresAt: '2000-01-01T00:00:00Z' }),
  )
  setup(<OrderDetailPage />)
  await screen.findByText('Open')
  expect(screen.queryByText('Expired')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel request' })).toBeEnabled()
})
it('queries My Errands with both identities and server paging instead of filtering a browser list', async () => {
  state.search = {
    ...state.search,
    participation: 'delivering',
    tab: 'history',
    page: 2,
  }
  setup(<MyErrandsPage />)
  await waitFor(() =>
    expect(api.listMyOrders).toHaveBeenCalledWith(
      { as: 'courier', view: 'history', page: 2, size: 20 },
      expect.any(AbortSignal),
    ),
  )
})
it('keeps Admin detail read-only even when the Admin is also the requester', async () => {
  const order = orderFixture({
    status: 'CREATING',
    creditState: null,
    createRequestId: 'key',
  })
  vi.mocked(api.getOrder).mockResolvedValue(order)
  setup(<AdminOrderDetailPage />)
  await screen.findByRole('heading', { name: 'Errand details' })
  expect(
    screen.queryByRole('button', {
      name: /Retry original|Cancel request|Accept errand/,
    }),
  ).not.toBeInTheDocument()
})
it('queries the selected requester and renders their orders', async () => {
  vi.mocked(api.listRequesterOrders).mockResolvedValue({
    items: [orderFixture({ status: 'CREATE_FAILED', creditState: null })],
    total: 1,
    page: 0,
    size: 20,
  })
  setup(<AdminOrderListPage />)
  await screen.findByText('Creation failed')
  expect(api.listRequesterOrders).toHaveBeenCalledWith(
    'requester',
    0,
    expect.any(AbortSignal),
  )
  expect(screen.getByRole('link', { name: /Campus Cafe/ })).toBeInTheDocument()
})
it('never offers creation retry metadata to a courier', async () => {
  setAccessToken(token('courier'))
  vi.mocked(api.getOrder).mockResolvedValue(
    orderFixture({
      status: 'ACCEPTED',
      courier: { id: 'courier', name: 'Sam' },
    }),
  )
  setup(<OrderDetailPage />)
  expect(
    await screen.findByRole('button', { name: "I've collected it" }),
  ).toBeEnabled()
  expect(
    screen.queryByRole('button', { name: 'Retry original request' }),
  ).not.toBeInTheDocument()
})
it('keeps the requester waiting while the item is on the way', async () => {
  vi.mocked(api.getOrder).mockResolvedValue(
    orderFixture({
      status: 'PICKED_UP',
      courier: { id: 'courier', name: 'Sam' },
    }),
  )
  setup(<OrderDetailPage />)
  await screen.findByText('Sam has your item and is on the way.')
  expect(
    screen.queryByRole('button', { name: 'Confirm received' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('region', { name: 'Proof of delivery' }),
  ).not.toBeInTheDocument()
  expect(api.getDeliveryPhotos).not.toHaveBeenCalled()
})
it('shows the delivery photo before the requester confirms receipt', async () => {
  vi.mocked(api.getOrder).mockResolvedValue(
    orderFixture({
      status: 'DELIVERED',
      courier: { id: 'courier', name: 'Sam' },
      deliveredAt: '2030-01-01T00:30:00Z',
      hasDeliveryPhoto: true,
    }),
  )
  vi.mocked(api.getDeliveryPhotos).mockResolvedValue([
    {
      id: 'p1',
      url: 'https://photos.test/one.jpg',
      expiresAt: '2030-01-01T00:40:00Z',
    },
    {
      id: 'p2',
      url: 'https://photos.test/two.jpg',
      expiresAt: '2030-01-01T00:40:00Z',
    },
  ])
  setup(<OrderDetailPage />)
  expect(
    await screen.findByRole('img', { name: 'Delivery photo 1' }),
  ).toHaveAttribute('src', 'https://photos.test/one.jpg')
  expect(screen.getByRole('img', { name: 'Delivery photo 2' })).toHaveAttribute(
    'src',
    'https://photos.test/two.jpg',
  )
  expect(
    screen.getByRole('button', { name: 'Confirm received' }),
  ).toBeInTheDocument()
  expect(screen.getByText(/Check the delivery photo/)).toBeInTheDocument()
})
it('refetches full detail after completion instead of replacing it with the action summary', async () => {
  const picked = orderFixture({
    status: 'DELIVERED',
    courier: { id: 'courier', name: 'Sam' },
  })
  vi.mocked(api.getOrder).mockResolvedValue(picked)
  vi.mocked(api.actOnOrder).mockImplementation(async () => {
    vi.mocked(api.getOrder).mockResolvedValue({
      ...picked,
      status: 'COMPLETED',
      creditState: 'SETTLEMENT_PENDING',
    })
    return {
      errandId: picked.id,
      status: 'COMPLETED',
      creditState: 'SETTLEMENT_PENDING',
    }
  })
  setup(<OrderDetailPage />)
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'Confirm received' }),
  )
  await user.click(screen.getByRole('button', { name: 'Confirm receipt' }))
  await screen.findByText('Completed')
  expect(screen.getByText('Sam')).toBeInTheDocument()
  expect(screen.getByText('Settlement pending')).toBeInTheDocument()
  expect(api.actOnOrder).toHaveBeenCalledWith(picked.id, 'complete')
})
it('stops showing actions after an inaccessible detail response', async () => {
  const error = new AxiosError('forbidden')
  error.response = { status: 403, data: { code: 'FORBIDDEN' } } as never
  vi.mocked(api.getOrder).mockRejectedValue(error)
  setup(<OrderDetailPage />)
  await screen.findByRole('alert')
  expect(
    screen.queryByRole('button', { name: 'Accept errand' }),
  ).not.toBeInTheDocument()
})

it.each(['ORDER_CREATION_UNCONFIRMED', 'ORDER_CREATION_ERROR'])(
  'opens known order detail immediately on %s without waiting for side queries',
  async (code) => {
    const error = new AxiosError('Creation attempt failed')
    error.response = {
      status: code === 'ORDER_CREATION_ERROR' ? 500 : 502,
      data: { code, errandId: orderFixture().id },
    } as never
    vi.mocked(api.createOrder).mockRejectedValue(error)
    const { client } = setup(<CreateErrandPage />)
    vi.spyOn(client, 'invalidateQueries').mockReturnValue(new Promise(() => {}))
    const user = await fillCreation()
    await user.click(screen.getByRole('button', { name: 'Post request' }))
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/errands/$orderId',
          params: { orderId: orderFixture().id },
        }),
      ),
    )
    expect(api.getOrder).not.toHaveBeenCalled()
    expect(loadCreation('requester')).toBeNull()
  },
)

it('does not submit when browser storage cannot preserve the request', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage blocked')
  })
  setup(<CreateErrandPage />)
  const user = await fillCreation()
  await user.click(screen.getByRole('button', { name: 'Post request' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to save this submission',
  )
  expect(api.createOrder).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Back to edit' })).toBeEnabled()
})

it.each(['OPEN', 'ORDER_CREATION_UNCONFIRMED', 'ORDER_CREATION_ERROR'])(
  'only reopens the known order after navigation fails for %s, without creating another request',
  async (outcome) => {
    const id = orderFixture().id
    if (outcome === 'OPEN') {
      vi.mocked(api.createOrder).mockResolvedValue({
        errandId: id,
        status: 'OPEN',
        creationFailureCode: null,
        queryUrl: `/api/orders/${id}`,
      })
    } else {
      const error = new AxiosError('Creation attempt failed')
      error.response = {
        status: outcome === 'ORDER_CREATION_ERROR' ? 500 : 502,
        data: { code: outcome, errandId: id },
      } as never
      vi.mocked(api.createOrder).mockRejectedValue(error)
    }
    state.navigate.mockRejectedValueOnce(new Error('Navigation failed'))
    setup(<CreateErrandPage />)
    const user = await fillCreation()
    await user.click(screen.getByRole('button', { name: 'Post request' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The order page could not open',
    )
    expect(
      screen.queryByRole('button', { name: 'Post request' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Back to edit' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Retry original request' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Go to My Errands' }),
    ).toHaveAttribute('href', '/errands')
    expect(loadCreation('requester')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Open order' }))
    expect(state.navigate).toHaveBeenCalledTimes(2)
    expect(state.navigate.mock.calls[1][0]).toEqual(
      state.navigate.mock.calls[0][0],
    )
    expect(state.navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({ params: { orderId: id } }),
    )
    expect(api.createOrder).toHaveBeenCalledOnce()
  },
)

it('removes the posting form as soon as an order is known, while its initial navigation is still pending', async () => {
  vi.mocked(api.createOrder).mockResolvedValue({
    errandId: orderFixture().id,
    status: 'OPEN',
    creationFailureCode: null,
    queryUrl: '',
  })
  let finishNavigation!: () => void
  state.navigate.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishNavigation = resolve
    }),
  )
  setup(<CreateErrandPage />)
  const user = await fillCreation()
  await user.click(screen.getByRole('button', { name: 'Post request' }))
  await screen.findByRole('button', { name: 'Open order' })
  expect(
    screen.queryByRole('button', { name: 'Post request' }),
  ).not.toBeInTheDocument()
  expect(api.createOrder).toHaveBeenCalledOnce()
  finishNavigation()
})

it('does not navigate or clear account A submission when its result arrives after switching to B', async () => {
  let finish!: (result: Awaited<ReturnType<typeof api.createOrder>>) => void
  vi.mocked(api.createOrder).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  setup(<CreateErrandPage />)
  const user = await fillCreation()
  await user.click(screen.getByRole('button', { name: 'Post request' }))
  expect(loadCreation('requester')).not.toBeNull()
  act(() => setAccessToken(token('other-user')))
  finish({
    errandId: orderFixture().id,
    status: 'OPEN',
    creationFailureCode: null,
    queryUrl: '',
  })
  await waitFor(() => expect(clients[0].isMutating()).toBe(0))
  expect(
    screen.getByRole('heading', { name: 'Create an errand' }),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('Delivery location *')).toHaveValue('')
  expect(state.navigate).not.toHaveBeenCalled()
  expect(loadCreation('requester')).not.toBeNull()
  expect(loadCreation('other-user')).toBeNull()
})

it('shows the latest rejection while preserving the unknown original submission and clears it on the next attempt', async () => {
  const rejected = new AxiosError('Technical request failure')
  rejected.response = {
    status: 400,
    data: {
      code: 'ORDER_REQUEST_FAILED',
      message: 'Supplier is not available',
    },
  } as never
  let finishRetry!: (
    result: Awaited<ReturnType<typeof api.createOrder>>,
  ) => void
  const retryResult = new Promise<Awaited<ReturnType<typeof api.createOrder>>>(
    (resolve) => {
      finishRetry = resolve
    },
  )
  vi.mocked(api.createOrder)
    .mockRejectedValueOnce(new AxiosError('timeout', 'ECONNABORTED'))
    .mockRejectedValueOnce(rejected)
    .mockReturnValueOnce(retryResult)
  setup(<CreateErrandPage />)
  const user = await fillCreation()
  await user.click(screen.getByRole('button', { name: 'Post request' }))
  await screen.findByText('Creation is not confirmed')
  const original = vi.mocked(api.createOrder).mock.calls[0][0]
  await user.click(
    await screen.findByRole('button', { name: 'Retry original request' }),
  )
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Last attempt failed: Supplier is not available',
    ),
  )
  expect(screen.getByRole('status')).toHaveTextContent(
    'Creation is not confirmed',
  )
  expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'warning')
  expect(vi.mocked(api.createOrder).mock.calls[1][0]).toEqual(original)
  expect(loadCreation('requester')?.input).toEqual(original)
  expect(screen.getByRole('button', { name: 'Back to edit' })).toBeDisabled()
  expect(
    screen.queryByText('Technical request failure'),
  ).not.toBeInTheDocument()

  await user.click(
    screen.getByRole('button', { name: 'Retry original request' }),
  )
  await waitFor(() =>
    expect(screen.queryByText(/Last attempt failed:/)).not.toBeInTheDocument(),
  )
  expect(screen.getByRole('button', { name: 'Posting…' })).toBeDisabled()
  expect(loadCreation('requester')?.input).toEqual(original)
  expect(vi.mocked(api.createOrder).mock.calls[2][0]).toEqual(original)

  finishRetry({
    errandId: orderFixture().id,
    status: 'OPEN',
    creationFailureCode: null,
    queryUrl: `/api/orders/${orderFixture().id}`,
  })
  await waitFor(() => expect(state.navigate).toHaveBeenCalled())
  expect(
    screen.queryByText('Creation is not confirmed'),
  ).not.toBeInTheDocument()
  expect(screen.queryByText(/Last attempt failed:/)).not.toBeInTheDocument()
  expect(loadCreation('requester')).toBeNull()
})

it('shows the public supplier rejection on an initial creation attempt', async () => {
  const rejected = new AxiosError('Technical request failure')
  rejected.response = {
    status: 400,
    data: {
      code: 'ORDER_REQUEST_FAILED',
      message: 'Supplier is not available',
    },
  } as never
  vi.mocked(api.createOrder).mockRejectedValueOnce(rejected)
  setup(<CreateErrandPage />)
  const user = await fillCreation()
  await user.click(screen.getByRole('button', { name: 'Post request' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Supplier is not available',
  )
  expect(
    screen.queryByText('Technical request failure'),
  ).not.toBeInTheDocument()
})

it.each([undefined, '   ', 123])(
  'uses the generic rejection message when the public message is invalid: %j',
  async (message) => {
    const rejected = new AxiosError('Technical request failure')
    rejected.response = {
      status: 400,
      data: { code: 'ORDER_REQUEST_FAILED', message },
    } as never
    vi.mocked(api.createOrder).mockRejectedValueOnce(rejected)
    setup(<CreateErrandPage />)
    const user = await fillCreation()
    await user.click(screen.getByRole('button', { name: 'Post request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to complete the request. Please try again.',
    )
    expect(
      screen.queryByText('Technical request failure'),
    ).not.toBeInTheDocument()
  },
)

it('keeps the action disabled until current detail refreshes without waiting for balances or lists', async () => {
  setAccessToken(token('courier'))
  let finishDetail!: (order: ReturnType<typeof orderFixture>) => void
  const pendingDetail = new Promise<ReturnType<typeof orderFixture>>(
    (resolve) => {
      finishDetail = resolve
    },
  )
  const open = orderFixture({ expiresAt: '2099-01-01T00:00:00Z' })
  vi.mocked(api.getOrder)
    .mockResolvedValueOnce(open)
    .mockReturnValue(pendingDetail)
  vi.mocked(api.actOnOrder).mockResolvedValue({
    errandId: open.id,
    status: 'ACCEPTED',
    creditState: 'RESERVED',
  })
  const { client } = setup(<OrderDetailPage />)
  const originalInvalidate = client.invalidateQueries.bind(client)
  vi.spyOn(client, 'invalidateQueries').mockImplementation((filters) =>
    filters?.exact ? originalInvalidate(filters) : new Promise(() => {}),
  )
  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: 'Accept errand' }))
  await waitFor(() => expect(api.getOrder).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  finishDetail({
    ...open,
    status: 'ACCEPTED',
    courier: { id: 'courier', name: 'Sam' },
  })
  expect(
    await screen.findByRole('button', { name: "I've collected it" }),
  ).toBeEnabled()
})
