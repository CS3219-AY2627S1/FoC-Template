import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { ToastProvider } from '#/components/ToastProvider/ToastProvider'
import { axiosClient } from '#/lib/axiosClient'
import { routeTree } from '#/routes'
import type { AuthOperations } from '#/features/auth/providers/AuthProvider'
import { setAccessToken } from '#/features/auth/lib/accessTokenStore'
import { userQueryKeys } from '../../constants/userQueryKeys'
import type { User } from '../../types/user.types'

const user: User = {
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

const adminToken = `header.${btoa(JSON.stringify({ roles: ['ADMIN'] }))}.signature`

afterEach(() => {
  setAccessToken(null)
  vi.restoreAllMocks()
})

const renderEditPage = (listUser: User = user) => {
  setAccessToken(adminToken)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const get = vi.spyOn(axiosClient, 'get').mockImplementation(async (url) => {
    if (url === '/users/faculties')
      return { data: ['School of Computing', 'Faculty of Science'] }
    if (url === '/users/user-1') return { data: user }
    if (url === '/users') {
      return { data: { items: [listUser], total: 1, page: 0, size: 20 } }
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  const patch = vi
    .spyOn(axiosClient, 'patch')
    .mockResolvedValue({ data: listUser })
  const router = createRouter({
    routeTree,
    context: {
      auth: {
        ensureAuthenticated: async () => true,
        completeLogin: () => {},
        logout: async () => {},
      } satisfies AuthOperations,
    },
    history: createMemoryHistory({
      initialEntries: ['/admin/users/user-1/edit'],
    }),
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

  return { get, patch, queryClient, userEvents }
}

test('saving a user returns to the list and confirms the change', async () => {
  const updated = { ...user, name: 'Alex Lee' }
  const { patch, userEvents } = renderEditPage(updated)

  const name = await screen.findByRole('textbox', { name: 'Name' })
  expect(screen.getByRole('heading', { name: 'Edit user' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  await userEvents.clear(name)
  await userEvents.type(name, 'Alex Lee')
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  await userEvents.click(screen.getByRole('link', { name: 'Users' }))
  expect(await screen.findByText('Discard unsaved changes?')).toBeVisible()
  await userEvents.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(name).toBeVisible()
  await userEvents.click(screen.getByRole('button', { name: 'Save changes' }))

  await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
  expect(patch).toHaveBeenCalledWith('/users/user-1', {
    name: 'Alex Lee',
    email: 'alex@example.com',
    roles: ['USER'],
    phoneNumber: '+6591235436',
    faculty: 'School of Computing',
  })
  expect(
    await screen.findByRole('heading', { name: 'User Management' }),
  ).toBeVisible()
  expect(await screen.findByText('Alex Lee was updated.')).toBeVisible()
})

test('can discard edited fields when leaving the page', async () => {
  const { patch, userEvents } = renderEditPage()
  const name = await screen.findByRole('textbox', { name: 'Name' })
  await userEvents.clear(name)
  await userEvents.type(name, 'Unsaved name')

  await userEvents.click(screen.getByRole('link', { name: 'Users' }))
  await userEvents.click(
    await screen.findByRole('button', { name: 'Discard changes' }),
  )

  expect(
    await screen.findByRole('heading', { name: 'User Management' }),
  ).toBeVisible()
  expect(patch).not.toHaveBeenCalled()
})

test('keeps an unsaved draft mounted during a detail refetch', async () => {
  const { get, queryClient, userEvents } = renderEditPage()
  const name = await screen.findByRole('textbox', { name: 'Name' })
  await userEvents.clear(name)
  await userEvents.type(name, 'Draft name')

  let releaseRefresh: (() => void) | undefined
  get.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      releaseRefresh = resolve
    })
    return { data: { ...user, name: 'Server name' } }
  })
  void queryClient.refetchQueries({ queryKey: userQueryKeys.detail(user.id) })

  await waitFor(() =>
    expect(
      get.mock.calls.filter(([url]) => url === '/users/user-1'),
    ).toHaveLength(2),
  )
  expect(name).toHaveValue('Draft name')
  await act(async () => releaseRefresh?.())
  await waitFor(() =>
    expect(
      queryClient.getQueryState(userQueryKeys.detail(user.id))?.fetchStatus,
    ).toBe('idle'),
  )
  expect(name).toHaveValue('Draft name')
})

test('refreshes a pristine form when the server user changes', async () => {
  const { get, queryClient } = renderEditPage()
  const name = await screen.findByRole('textbox', { name: 'Name' })
  get.mockResolvedValueOnce({ data: { ...user, name: 'Fresh name' } })

  await queryClient.refetchQueries({ queryKey: userQueryKeys.detail(user.id) })

  await waitFor(() => expect(name).toHaveValue('Fresh name'))
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
})

test('keeps the form available after an update error', async () => {
  const { patch, userEvents } = renderEditPage()
  patch.mockRejectedValueOnce(new Error('Update failed'))
  const name = await screen.findByRole('textbox', { name: 'Name' })
  await userEvents.clear(name)
  await userEvents.type(name, 'New name')
  await userEvents.click(screen.getByRole('button', { name: 'Save changes' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Something went wrong. Please try again.',
  )
  expect(name).toHaveValue('New name')
})

test('requires at least one role before saving', async () => {
  const { patch, userEvents } = renderEditPage()
  const name = await screen.findByRole('textbox', { name: 'Name' })
  await userEvents.clear(name)
  await userEvents.type(name, 'New name')
  await userEvents.click(screen.getByRole('checkbox', { name: 'User' }))
  await userEvents.click(screen.getByRole('button', { name: 'Save changes' }))

  expect(await screen.findByText('Select at least one role.')).toBeVisible()
  expect(patch).not.toHaveBeenCalled()
})

test('saves normalized phone and clears faculty', async () => {
  const { patch, userEvents } = renderEditPage()
  const phone = await screen.findByRole('textbox', { name: 'Phone number' })
  expect(screen.getByText('2026-01-01 08:00:00 SGT')).toBeVisible()
  await userEvents.clear(phone)
  await userEvents.type(phone, '+65 8123-4567')
  await userEvents.selectOptions(
    screen.getByRole('combobox', { name: 'Faculty' }),
    '',
  )
  await userEvents.click(screen.getByRole('button', { name: 'Save changes' }))

  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith('/users/user-1', {
      name: 'Alex Tan',
      email: 'alex@example.com',
      roles: ['USER'],
      phoneNumber: '+6581234567',
      faculty: '',
    }),
  )
})

test('email change feedback explains that verification is still required', async () => {
  const { patch, userEvents } = renderEditPage()
  const email = await screen.findByRole('textbox', { name: 'Email' })
  await userEvents.clear(email)
  await userEvents.type(email, 'updated@u.nus.edu')
  await userEvents.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
  expect(
    await screen.findByText(
      /A verification email has been requested for updated@u.nus.edu/,
    ),
  ).toBeVisible()
})
