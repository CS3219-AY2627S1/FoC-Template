import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { CreateErrandPage } from '../pages/CreateErrandPage/CreateErrandPage'
import { MyErrandsPage } from '../pages/MyErrandsPage/MyErrandsPage'
import { OrderDetailPage } from '../pages/OrderDetailPage/OrderDetailPage'
import { orderFixture } from './orderFixtures'
import * as api from '../api/orders.api'
import { setAccessToken } from '#/features/auth/lib/accessTokenStore'

const PAST_ID = '8e1f0000-0000-4000-8000-000000000001'
const CAFE_ID = '8e1f0000-0000-4000-8000-000000000002'

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  locations: [] as Array<{ id: string; name: string; address: string }>,
  search: {},
}))
vi.mock('#/features/credits/hooks/useCreditBalance', () => ({
  useCreditBalance: () => ({
    isPending: false,
    isSuccess: true,
    data: { availableBalance: 15, reservedBalance: 0 },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => state.navigate,
  useParams: () => ({ orderId: '8e1f0000-0000-4000-8000-000000000001' }),
  useSearch: () => state.search,
  // keep the route path info
  Link: ({
    children,
    to,
    search,
    className,
    'aria-label': label,
  }: {
    children: ReactNode
    to: string
    search?: { from?: string; q?: string }
    className?: string
    'aria-label'?: string
  }) => (
    <a
      href={
        search?.from
          ? `${to}?from=${search.from}`
          : search?.q
            ? `${to}?q=${search.q}`
            : to
      }
      className={className}
      aria-label={label}
    >
      {children}
    </a>
  ),
}))
vi.mock('#/features/suppliers/hooks/usePickupLocations', () => ({
  usePickupLocations: () => ({
    data: state.locations,
    isPending: false,
    isSuccess: true,
  }),
}))
vi.mock('../api/orders.api', () => ({
  getOrder: vi.fn(),
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
  const view = render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>,
  )
  rerender = () =>
    view.rerender(
      <QueryClientProvider client={client}>{element}</QueryClientProvider>,
    )
  return userEvent.setup()
}

// render again the last page if the test change the mock url search
let rerender = () => {}
const page = (items = [orderFixture()]) => ({
  items,
  total: items.length,
  page: 0,
  size: 20,
})
const completed = orderFixture({
  status: 'COMPLETED',
  creditState: 'SETTLED',
  courier: { id: 'courier', name: 'Jamie' },
  description: 'Iced latte, less sugar',
  notes: 'Order #1042',
  creditReward: 7,
  endedAt: '2030-01-01T02:00:00Z',
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  state.navigate.mockReset().mockResolvedValue(undefined)
  state.locations = [{ id: CAFE_ID, name: 'Campus Cafe', address: 'COM1' }]
  state.search = { tab: 'history', participation: 'all', page: 0 }
  setAccessToken(token('requester'))
  vi.mocked(api.getOrder).mockResolvedValue(completed)
  vi.mocked(api.listMyOrders).mockResolvedValue(page([]))
})
afterEach(() => {
  cleanup()
  setAccessToken(null)
  clients.forEach((client) => client.clear())
  clients.length = 0
})

it('shows what was ordered, who delivered it and when, leaving Request again to the detail page', async () => {
  vi.mocked(api.listMyOrders).mockResolvedValue(
    page([
      completed,
      orderFixture({
        id: 'delivered-by-me',
        requester: { id: 'alex', name: 'Alex' },
        courier: { id: 'requester', name: 'Me' },
        status: 'COMPLETED',
        description: 'Curry puffs',
        creditReward: 3,
      }),
    ]),
  )
  setup(<MyErrandsPage />)

  const mine = (await screen.findByText('Iced latte, less sugar')).closest(
    'a',
  ) as HTMLElement
  expect(within(mine).getByText('Courier: Jamie')).toBeInTheDocument()
  expect(within(mine).getByText('Completed')).toBeInTheDocument()
  const delivered = screen.getByText('Curry puffs').closest('a') as HTMLElement
  expect(within(delivered).getByText('For Alex')).toBeInTheDocument()
  expect(within(delivered).getByText('+3 credits')).toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: /request again/i }),
  ).not.toBeInTheDocument()
})

it('puts the time left to accept an open errand first', async () => {
  state.search = { tab: 'active', participation: 'all', page: 0 }
  vi.mocked(api.listMyOrders).mockResolvedValue(
    page([
      orderFixture({
        expiresAt: new Date(Date.now() + 23 * 60_000).toISOString(),
      }),
    ]),
  )
  setup(<MyErrandsPage />)

  expect(await screen.findByText('Expires in 23 min')).toBeInTheDocument()
})

it('fills the form from a past errand and warns before posting the same request twice', async () => {
  state.search = { from: PAST_ID }
  vi.mocked(api.listMyOrders).mockResolvedValue(
    page([
      orderFixture({
        id: 'still-open',
        description: 'iced latte,  less sugar',
      }),
    ]),
  )
  vi.mocked(api.createOrder).mockResolvedValue({
    errandId: 'new-errand',
    status: 'OPEN',
    creationFailureCode: null,
    queryUrl: '/api/orders/new-errand',
  })
  const user = setup(<CreateErrandPage />)

  expect(
    await screen.findByText(/Copied from your request on/),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('Pickup location *')).toHaveValue(CAFE_ID)
  expect(screen.getByLabelText('Item *')).toHaveValue('Iced latte, less sugar')
  expect(screen.getByLabelText('Notes')).toHaveValue('Order #1042')
  expect(screen.getByLabelText('Courier reward *')).toHaveValue(7)

  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(
    await screen.findByText('You already have the same request in progress'),
  ).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Post another request' }))

  await waitFor(() =>
    expect(api.createOrder).toHaveBeenCalledWith({
      createRequestId: expect.any(String),
      supplierId: CAFE_ID,
      deliveryLocation: 'Library',
      description: 'Iced latte, less sugar',
      notes: 'Order #1042',
      creditReward: 7,
      expiryMinutes: 60,
    }),
  )
})

it('asks for another pickup when the old supplier is no longer listed', async () => {
  state.search = { from: PAST_ID }
  state.locations = []
  setup(<CreateErrandPage />)

  expect(
    await screen.findByText(
      'Campus Cafe is no longer available. Choose another pickup location.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByLabelText('Pickup location *')).toHaveValue('')
})

it('offers Request again on the detail page of your own ended errand', async () => {
  state.search = {
    tab: 'history',
    participation: 'all',
    page: 0,
    posted: false,
  }
  setup(<OrderDetailPage />)

  expect(
    await screen.findByRole('link', { name: 'Request again' }),
  ).toHaveAttribute('href', `/errands/new?from=${PAST_ID}`)
})

it('lists deliveries separately from requests', async () => {
  state.search = { tab: 'active', participation: 'delivering', page: 0 }
  setup(<MyErrandsPage />)

  await waitFor(() =>
    expect(api.listMyOrders).toHaveBeenCalledWith(
      expect.objectContaining({ as: 'courier', view: 'active' }),
      expect.any(AbortSignal),
    ),
  )
  expect(screen.getByRole('combobox', { name: 'Type' })).toHaveValue(
    'delivering',
  )
})

it('searches my errands once typing pauses', async () => {
  const user = setup(<MyErrandsPage />)

  await user.type(
    await screen.findByRole('searchbox', { name: 'Search errands' }),
    'latte',
  )

  await waitFor(() =>
    expect(state.navigate).toHaveBeenCalledWith({
      to: '/errands',
      search: { tab: 'history', participation: 'all', page: 0, q: 'latte' },
      replace: true,
    }),
  )
})

it('passes the search to the server so every page is searched', async () => {
  state.search = {
    tab: 'active',
    participation: 'requested',
    page: 0,
    q: 'latte',
  }
  setup(<MyErrandsPage />)

  await waitFor(() =>
    expect(api.listMyOrders).toHaveBeenCalledWith(
      { as: 'requester', view: 'active', page: 0, size: 20, q: 'latte' },
      expect.any(AbortSignal),
    ),
  )
  expect(
    await screen.findByText('No errands match “latte”.'),
  ).toBeInTheDocument()
})

it('keeps the search when opening an errand and going back to the list', async () => {
  state.search = {
    tab: 'history',
    participation: 'requested',
    page: 2,
    q: 'latte',
  }
  vi.mocked(api.listMyOrders).mockResolvedValue(page([completed]))
  setup(<MyErrandsPage />)

  expect(
    (await screen.findByText('Iced latte, less sugar')).closest('a'),
  ).toHaveAttribute('href', expect.stringContaining('q=latte'))

  cleanup()
  state.search = { ...state.search, posted: false }
  setup(<OrderDetailPage />)
  expect(
    await screen.findByRole('link', { name: /Back to My Errands/ }),
  ).toHaveAttribute('href', '/errands?q=latte')
})

it('clears the search box when navigation clears the search', async () => {
  state.search = {
    tab: 'active',
    participation: 'requested',
    page: 0,
    q: 'latte',
  }
  setup(<MyErrandsPage />)
  const box = await screen.findByRole('searchbox', { name: 'Search errands' })
  expect(box).toHaveValue('latte')

  // The My Errands link in the header opens the list without a search.
  state.search = { tab: 'active', participation: 'all', page: 0 }
  rerender()

  await waitFor(() => expect(box).toHaveValue(''))
  await new Promise((resolve) => setTimeout(resolve, 400))
  expect(state.navigate).not.toHaveBeenCalledWith(
    expect.objectContaining({
      search: expect.objectContaining({ q: 'latte' }),
    }),
  )
})
