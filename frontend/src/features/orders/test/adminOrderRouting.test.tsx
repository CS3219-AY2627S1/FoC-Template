import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { routeTree } from '#/routes'
import { setAccessToken } from '#/features/auth/lib/accessTokenStore'
import { getUserProfile } from '#/features/auth/api/userProfile.api'
import { getUser } from '#/features/users/api/getUser.api'
import { getUsers } from '#/features/users/api/getUsers.api'
import { getOrder, listRequesterOrders } from '../api/orders.api'
import { errandQueryKeys } from '../constants/errandQueryKeys'
import { orderFixture } from './orderFixtures'
import type { User } from '#/features/users/types/user.types'

vi.mock('#/features/auth/api/userProfile.api', () => ({
  getUserProfile: vi.fn(),
}))
vi.mock('#/features/users/api/getUser.api', () => ({ getUser: vi.fn() }))
vi.mock('#/features/users/api/getUsers.api', () => ({ getUsers: vi.fn() }))
vi.mock('../api/orders.api', () => ({
  getOrder: vi.fn(),
  listRequesterOrders: vi.fn(),
}))

const requester: User = {
  id: 'c2222222-2222-4222-8222-222222222222',
  name: 'Alex',
  email: 'alex@example.com',
  roles: ['USER'],
  phoneNumber: null,
  faculty: null,
  avatarUrl: null,
  createdAt: '2030-01-01T00:00:00Z',
  updatedAt: '2030-01-01T00:00:00Z',
}
const order = orderFixture({
  id: 'b1111111-1111-4111-8111-111111111111',
  requester: { id: requester.id, name: requester.name },
  status: 'COMPLETED',
  creditState: 'SETTLED',
})
let client: QueryClient

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  setAccessToken(
    `header.${btoa(JSON.stringify({ sub: 'admin', roles: ['ADMIN'] }))}.signature`,
  )
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.mocked(getUserProfile).mockResolvedValue({
    ...requester,
    id: 'admin',
    name: 'Admin',
    roles: ['ADMIN'],
  })
  vi.mocked(getUser).mockResolvedValue(requester)
  vi.mocked(getUsers).mockResolvedValue({
    items: [requester],
    total: 1,
    page: 0,
    size: 10,
  })
  vi.mocked(listRequesterOrders).mockResolvedValue({
    items: [order],
    total: 65,
    page: 2,
    size: 20,
  })
  vi.mocked(getOrder).mockResolvedValue(order)
})

afterEach(() => {
  cleanup()
  client.clear()
  setAccessToken(null)
  vi.restoreAllMocks()
})

it('loads admin orders independently of Profile and retries an order query failure', async () => {
  vi.mocked(getUserProfile).mockRejectedValue(new Error('Profile unavailable'))
  vi.mocked(listRequesterOrders).mockRejectedValueOnce(
    new Error('Orders unavailable'),
  )
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/admin/orders?requesterId=${requester.id}&page=2`],
    }),
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
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to complete the request. Please try again.',
  )
  expect(screen.queryByText('Loading errands…')).not.toBeInTheDocument()
  expect(listRequesterOrders).toHaveBeenCalledTimes(1)
  expect(getUserProfile).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByRole('link', { name: 'Campus Cafe → Library' })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(getUserProfile).not.toHaveBeenCalled()
  expect(listRequesterOrders).toHaveBeenCalledTimes(2)
  expect(listRequesterOrders).toHaveBeenCalledWith(
    requester.id,
    2,
    expect.any(AbortSignal),
  )
  expect(
    client.getQueryData(errandQueryKeys.admin('admin', requester.id, 2)),
  ).toMatchObject({ items: [order], total: 65 })
  expect(
    client.getQueryData(errandQueryKeys.admin(undefined, requester.id, 2)),
  ).toBeUndefined()
})

it('preserves the requester and non-first page through the real admin list, detail and return routes', async () => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [`/admin/orders?requesterId=${requester.id}&page=2`],
    }),
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
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  const link = await screen.findByRole('link', {
    name: 'Campus Cafe → Library',
  })
  expect(listRequesterOrders).toHaveBeenCalledWith(
    requester.id,
    2,
    expect.any(AbortSignal),
  )
  expect(screen.getByText('Page 3 of 4 · 65 errands')).toBeInTheDocument()

  const detailUrl = new URL(link.getAttribute('href')!, 'http://localhost')
  expect(detailUrl.pathname).toBe(`/admin/orders/${order.id}`)
  expect(detailUrl.searchParams.get('requesterId')).toBe(requester.id)
  expect(detailUrl.searchParams.get('page')).toBe('2')

  await user.click(link)
  await screen.findByRole('heading', { name: 'Errand details' })
  expect(router.state.location.pathname).toBe(`/admin/orders/${order.id}`)
  expect(router.state.location.search).toEqual({
    requesterId: requester.id,
    page: 2,
  })
  expect(getOrder).toHaveBeenCalledWith(order.id, expect.any(AbortSignal))

  vi.mocked(listRequesterOrders).mockClear()
  await user.click(
    screen.getByRole('link', { name: '← Back to requested orders' }),
  )
  await screen.findByRole('heading', { name: 'Orders' })
  expect(router.state.location.pathname).toBe('/admin/orders')
  expect(router.state.location.search).toEqual({
    requesterId: requester.id,
    page: 2,
  })
  await waitFor(() =>
    expect(listRequesterOrders).toHaveBeenCalledWith(
      requester.id,
      2,
      expect.any(AbortSignal),
    ),
  )
  expect(screen.getByText('Page 3 of 4 · 65 errands')).toBeInTheDocument()
})
