import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { axiosClient } from '#/lib/axiosClient'
import { ToastProvider } from '#/components/ToastProvider/ToastProvider'
import { routeTree } from '#/routes'
import type { AuthOperations } from '#/features/auth/providers/AuthProvider'
import { setAccessToken } from '#/features/auth/lib/accessTokenStore'
import type { User, UserListParams, UserPage } from '../../types/user.types'

const alex: User = {
  id: 'user-1',
  name: 'Alex Tan',
  email: 'alex@example.com',
  roles: ['USER'],
  phoneNumber: '+6591235436',
  faculty: 'School of Computing',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}
const blair: User = {
  id: 'user-2',
  name: 'Blair Lee',
  email: 'blair@example.com',
  roles: ['ADMIN'],
  phoneNumber: null,
  faculty: null,
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}

const adminToken = `header.${btoa(JSON.stringify({ roles: ['ADMIN'] }))}.signature`

const renderListPage = (
  getPage: (params: UserListParams) => UserPage | Promise<UserPage>,
  initialEntry = '/admin/users',
) => {
  setAccessToken(adminToken)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const get = vi
    .spyOn(axiosClient, 'get')
    .mockImplementation(async (url, config) => {
      if (url === '/users/faculties')
        return { data: ['School of Computing', 'Faculty of Science'] }
      if (url === '/users/user-1') return { data: alex }
      if (url !== '/users') throw new Error(`Unexpected request: ${url}`)
      return { data: await getPage(config?.params as UserListParams) }
    })
  const router = createRouter({
    routeTree,
    context: {
      auth: {
        ensureAuthenticated: async () => true,
        completeLogin: () => {},
        logout: async () => {},
      } satisfies AuthOperations,
    },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const userEvents = userEvent.setup()

  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  )

  return { get, router, userEvents }
}

afterEach(() => {
  setAccessToken(null)
  vi.restoreAllMocks()
})

test('keeps the table shape while the first page loads', async () => {
  let releasePage: ((page: UserPage) => void) | undefined
  renderListPage(
    () =>
      new Promise<UserPage>((resolve) => {
        releasePage = resolve
      }),
  )

  expect(
    await screen.findByRole('heading', { name: 'User Management' }),
  ).toBeVisible()
  const table = await screen.findByRole('table')
  expect(table).toHaveAttribute('aria-busy', 'true')
  expect(screen.queryByText('Loading users…')).not.toBeInTheDocument()

  await act(async () =>
    releasePage?.({ items: [alex], total: 1, page: 0, size: 20 }),
  )

  expect(await screen.findByText('Alex Tan')).toBeVisible()
  expect(table).toHaveAttribute('aria-busy', 'false')
})

test('paginates, sorts, and filters users through server parameters', async () => {
  const { get, userEvents } = renderListPage((params) => ({
    items: [params.page === 1 ? blair : alex],
    total: 21,
    page: params.page,
    size: 20,
  }))

  expect(await screen.findByText('Alex Tan')).toBeVisible()
  await userEvents.click(screen.getByRole('button', { name: 'Next Page' }))
  expect(await screen.findByText('Blair Lee')).toBeVisible()
  expect(get).toHaveBeenCalledWith('/users', {
    params: expect.objectContaining({ page: 1, sort: 'name,asc' }),
  })

  await userEvents.click(screen.getByRole('button', { name: 'Name' }))
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/users', {
      params: expect.objectContaining({ page: 0, sort: 'name,desc' }),
    }),
  )

  await userEvents.type(
    screen.getByRole('searchbox', { name: 'Search users by name or email' }),
    'Alex',
  )
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/users', {
      params: expect.objectContaining({ page: 0, search: 'Alex' }),
    }),
  )

  await userEvents.click(screen.getByRole('button', { name: 'Admin' }))
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/users', {
      params: expect.objectContaining({
        page: 0,
        search: 'Alex',
        role: 'ADMIN',
      }),
    }),
  )
})

test('sorts the full list by created and updated timestamps', async () => {
  const { get, userEvents } = renderListPage(() => ({
    items: [alex],
    total: 1,
    page: 0,
    size: 20,
  }))

  expect(await screen.findByText('Alex Tan')).toBeVisible()
  expect(screen.getByText('2026-01-01 08:00:00 SGT')).toBeVisible()
  expect(screen.getByText('2026-01-02 08:00:00 SGT')).toBeVisible()

  await userEvents.click(screen.getByRole('button', { name: 'Created at' }))
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/users', {
      params: expect.objectContaining({ sort: 'createdAt,asc' }),
    }),
  )
  await userEvents.click(screen.getByRole('button', { name: 'Created at' }))
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/users', {
      params: expect.objectContaining({ sort: 'createdAt,desc' }),
    }),
  )

  await userEvents.click(screen.getByRole('button', { name: 'Updated at' }))
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/users', {
      params: expect.objectContaining({ sort: 'updatedAt,desc' }),
    }),
  )
})

test('filters by faculty and by users without a faculty', async () => {
  const { get, router, userEvents } = renderListPage((params) => ({
    items: [params.faculty === 'UNASSIGNED' ? blair : alex],
    total: 1,
    page: params.page,
    size: 20,
  }))

  expect(await screen.findByText('Alex Tan')).toBeVisible()
  await userEvents.selectOptions(
    screen.getByRole('combobox', { name: 'Faculty' }),
    'School of Computing',
  )
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/users', {
      params: expect.objectContaining({
        faculty: 'School of Computing',
        page: 0,
      }),
    }),
  )
  await userEvents.click(screen.getByRole('link', { name: 'View' }))
  expect(router.state.location.search).toEqual(
    expect.objectContaining({ faculty: 'School of Computing' }),
  )
  await userEvents.click(screen.getByRole('link', { name: 'Users' }))
  await userEvents.selectOptions(
    screen.getByRole('combobox', { name: 'Faculty' }),
    'UNASSIGNED',
  )
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/users', {
      params: expect.objectContaining({ faculty: 'UNASSIGNED', page: 0 }),
    }),
  )
  expect(await screen.findByText('Blair Lee')).toBeVisible()
})

test('returns to the last valid page when the result total shrinks', async () => {
  let total = 21
  const { get, userEvents } = renderListPage((params) => {
    if (params.page === 1) total = 1
    return {
      items: params.page === 0 ? [alex] : [],
      total,
      page: params.page,
      size: 20,
    }
  })

  expect(await screen.findByText('Alex Tan')).toBeVisible()
  await userEvents.click(screen.getByRole('button', { name: 'Next Page' }))
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/users', {
      params: expect.objectContaining({ page: 1 }),
    }),
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Next Page' })).toBeDisabled(),
  )
})

test('shows new details and opens the read-only user page with list filters', async () => {
  const { router, userEvents } = renderListPage(
    () => ({ items: [alex], total: 1, page: 0, size: 20 }),
    '/admin/users?q=Alex&role=USER',
  )

  expect(await screen.findByText('+6591235436')).toBeVisible()
  expect(
    screen.getByRole('cell', { name: 'School of Computing' }),
  ).toBeVisible()
  await userEvents.click(screen.getByRole('link', { name: 'View' }))

  expect(await screen.findByRole('heading', { name: 'Alex Tan' })).toBeVisible()
  expect(router.state.location.pathname).toBe('/admin/users/user-1')
  expect(router.state.location.search).toEqual(
    expect.objectContaining({ q: 'Alex', role: 'USER' }),
  )
  expect(screen.getByText('User ID')).toBeVisible()
  expect(screen.getByText('Last updated')).toBeVisible()
  await userEvents.click(screen.getByRole('link', { name: 'Edit user' }))
  expect(
    await screen.findByRole('heading', { name: 'Edit user' }),
  ).toBeVisible()
})
