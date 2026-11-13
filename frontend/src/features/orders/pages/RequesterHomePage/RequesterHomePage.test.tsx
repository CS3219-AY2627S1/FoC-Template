import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMyErrands } from '../../hooks/useOrders'
import { orderFixture } from '../../test/orderFixtures'
import { RequesterHomePage } from './RequesterHomePage'

vi.mock('#/hooks/useNow', () => ({
  useNow: () => Date.parse('2030-01-01T00:10:00Z'),
}))

vi.mock('../../hooks/useOrders', () => ({
  useMyErrands: vi.fn(),
}))

const queryMock = vi.mocked(useMyErrands, { partial: true })
const refetch = vi.fn()
const emptyMessage =
  'No errands yet. Request a pickup or deliver one to earn credits.'

type QueryResult = Pick<
  ReturnType<typeof useMyErrands>,
  'data' | 'userId' | 'isPending' | 'error' | 'refetch'
>

const emptyResult = {
  data: { items: [], total: 0, page: 0, size: 3 },
  userId: 'me',
  isPending: false,
  error: null,
  refetch,
} satisfies QueryResult

const renderPage = async () => {
  const root = createRootRoute()
  const home = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: RequesterHomePage,
  })
  const request = createRoute({
    getParentRoute: () => root,
    path: '/request',
    component: () => <h1>Find a supplier</h1>,
  })
  const deliver = createRoute({
    getParentRoute: () => root,
    path: '/deliver',
    component: () => <h1>Find an errand</h1>,
  })
  const order = createRoute({
    getParentRoute: () => root,
    path: '/errands/$orderId',
    component: () => <h1>Errand</h1>,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, request, deliver, order]),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { name: 'Home' })
  return router
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  queryMock.mockReturnValue(emptyResult)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RequesterHomePage', () => {
  it('offers request and deliver without leaving recent errands behind', async () => {
    const user = userEvent.setup()
    const router = await renderPage()

    expect(
      screen.getByRole('heading', { name: 'Recent errands' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Request/ })).toHaveAttribute(
      'href',
      '/request',
    )
    expect(screen.getByRole('link', { name: /Deliver/ })).toHaveAttribute(
      'href',
      '/deliver',
    )
    expect(queryMock).toHaveBeenCalledWith({
      as: 'all',
      view: 'all',
      page: 0,
      size: 3,
    })

    await user.click(screen.getByRole('link', { name: /Request/ }))
    expect(
      await screen.findByRole('heading', { name: 'Find a supplier' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/request')
  })

  it('shows an empty state when there are no recent errands', async () => {
    await renderPage()

    expect(screen.getByText(emptyMessage)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows recent requested and delivered errands with links to their details', async () => {
    queryMock.mockReturnValue({
      ...emptyResult,
      data: {
        items: [
          orderFixture({
            id: 'requested',
            requester: { id: 'me', name: 'Alex' },
          }),
          orderFixture({
            id: 'delivering',
            courier: { id: 'me', name: 'Alex' },
            status: 'ACCEPTED',
            pickup: { name: 'Print Shop', address: 'COM3' },
            deliveryLocation: 'COM2',
          }),
        ],
        total: 2,
        page: 0,
        size: 3,
      },
    })
    await renderPage()

    const recent = within(
      screen.getByRole('region', { name: 'Recent errands' }),
    )
    expect(recent.getAllByRole('listitem')).toHaveLength(2)
    const requested = recent.getByRole('link', {
      name: /Campus Cafe.*Library/,
    })
    expect(requested).toHaveAttribute(
      'href',
      '/errands/requested?tab=active&participation=all&page=0&posted=false',
    )
    expect(requested).toHaveTextContent('Requested by you')
    expect(requested).toHaveTextContent('5 credits')
    expect(requested).toHaveTextContent('Expires in 50 min')
    const delivering = recent.getByRole('link', { name: /Print Shop.*COM2/ })
    expect(delivering).toHaveAttribute(
      'href',
      '/errands/delivering?tab=active&participation=all&page=0&posted=false',
    )
    expect(delivering).toHaveTextContent("You're delivering")
    expect(delivering).toHaveTextContent('Accepted')
    expect(screen.queryByText(emptyMessage)).not.toBeInTheDocument()
    const banner = screen.getByRole('complementary', { name: 'Current pickup' })
    expect(banner).toHaveTextContent('Collect from Print Shop')
    expect(banner).toHaveTextContent('Delivering · COM3 → COM2')
    expect(
      within(banner).getByRole('link', { name: 'Continue pickup →' }),
    ).toHaveAttribute(
      'href',
      '/errands/delivering?tab=active&participation=all&page=0&posted=false',
    )
  })

  it('hides the pickup banner when the signed-in user is not delivering', async () => {
    queryMock.mockReturnValue({
      ...emptyResult,
      data: {
        items: [
          orderFixture({
            id: 'accepted-by-someone',
            status: 'ACCEPTED',
            courier: { id: 'other', name: 'Sam' },
          }),
        ],
        total: 1,
        page: 0,
        size: 3,
      },
    })
    await renderPage()

    expect(
      screen.queryByRole('complementary', { name: 'Current pickup' }),
    ).not.toBeInTheDocument()
  })

  it('shows loading feedback without an empty state', async () => {
    queryMock.mockReturnValue({
      ...emptyResult,
      data: undefined,
      isPending: true,
    })
    await renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Loading errands…')
    expect(screen.queryByText(emptyMessage)).not.toBeInTheDocument()
    expect(
      within(
        screen.getByRole('region', { name: 'Recent errands' }),
      ).queryByRole('list'),
    ).not.toBeInTheDocument()
  })

  it('shows an error and retries loading recent errands', async () => {
    const user = userEvent.setup()
    queryMock.mockReturnValue({
      ...emptyResult,
      error: new Error('Unavailable'),
    })
    await renderPage()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to complete the request. Please try again.',
    )
    expect(screen.queryByText(emptyMessage)).not.toBeInTheDocument()
    expect(
      within(
        screen.getByRole('region', { name: 'Recent errands' }),
      ).queryByRole('list'),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(refetch).toHaveBeenCalledOnce()
  })
})
