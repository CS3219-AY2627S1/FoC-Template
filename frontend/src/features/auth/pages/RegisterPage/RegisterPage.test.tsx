import { AuthRouterProvider } from '#/App'
import { AuthProvider } from '#/features/auth/providers/AuthProvider'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthRequestError } from '#/features/auth/lib/authRequest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerUser } from '#/features/auth/api/registerUser.api'
import { routeTree } from '#/routes'
import type { UserProfileDto } from '#/features/auth/types/auth.types'

// Keep the page, form, hook and router real; replace the network boundary.
vi.mock('#/features/auth/api/registerUser.api', () => ({
  registerUser: vi.fn(),
}))

const registerUserMock = vi.mocked(registerUser)

const profile: UserProfileDto = {
  id: 'test-user-id',
  name: 'Jamie',
  email: 'jamie@u.nus.edu',
  roles: ['USER'],
}

const successMessage =
  'Check your inbox and spam folder for the verification email.'

const clients: Array<QueryClient> = []
let previousOnlineState = true

const createHttpError = (status: number, message: string) =>
  new AuthRequestError(status, message)

const renderRegisterPage = async () => {
  // Each test gets its own cache and navigation history.
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  clients.push(client)

  const router = createRouter({
    routeTree,
    context: { auth: undefined! },
    history: createMemoryHistory({
      initialEntries: ['/register'],
    }),
  })

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthRouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )

  await screen.findByRole('heading', {
    name: 'Create your account',
  })

  return router
}

const fillValidForm = async () => {
  const user = userEvent.setup()

  await user.type(screen.getByLabelText('Name'), ' Jamie ')
  await user.type(screen.getByLabelText('Email'), ' JAMIE@U.NUS.EDU ')
  await user.type(screen.getByLabelText('Password'), ' password123 ')
  await user.type(screen.getByLabelText('Confirm password'), ' password123 ')

  return user
}

beforeEach(() => {
  // jsdom has no scrolling implementation; these tests verify auth behavior.
  vi.spyOn(window, 'scrollTo').mockImplementation(vi.fn())

  registerUserMock.mockReset()
  previousOnlineState = onlineManager.isOnline()
  onlineManager.setOnline(true)
})

afterEach(() => {
  // Unmount observers before clearing their clients.
  cleanup()

  for (const client of clients) {
    client.clear()
  }

  clients.length = 0
  onlineManager.setOnline(previousOnlineState)

  vi.restoreAllMocks()
})

describe('RegisterPage', () => {
  it('blocks rapid and pending submissions, then navigates on success', async () => {
    let completeRequest: (value: UserProfileDto) => void = () => {
      throw new Error('The request has not started.')
    }

    registerUserMock.mockImplementation(
      () =>
        new Promise<UserProfileDto>((resolve) => {
          completeRequest = resolve
        }),
    )

    const router = await renderRegisterPage()
    await fillValidForm()

    const form = screen
      .getByRole('button', { name: 'Create Account' })
      .closest('form')

    if (!form) {
      throw new Error('Registration form was not found.')
    }

    // Submit twice in one batch to exercise the immediate submission lock.
    act(() => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    })

    await waitFor(() => {
      expect(registerUserMock).toHaveBeenCalledTimes(1)
    })

    const pendingButton = await screen.findByRole('button', {
      name: 'Creating account…',
    })

    expect(pendingButton).toBeDisabled()
    expect(screen.getByLabelText('Name')).toBeDisabled()
    expect(screen.getByLabelText('Email')).toBeDisabled()
    expect(screen.getByLabelText('Password')).toBeDisabled()
    expect(screen.getByLabelText('Confirm password')).toBeDisabled()

    // Also exercise the guard after the pending state reaches the form.
    fireEvent.submit(form)

    expect(registerUserMock).toHaveBeenCalledTimes(1)
    expect(registerUserMock).toHaveBeenCalledWith({
      name: 'Jamie',
      email: 'jamie@u.nus.edu',
      password: ' password123 ',
    })

    await act(async () => {
      completeRequest(profile)
    })

    expect(await screen.findByText(successMessage)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/verify-email')
    expect(
      screen.getByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument()
  })

  it('shows an existing-email error and allows a corrected submission', async () => {
    registerUserMock.mockRejectedValueOnce(
      createHttpError(400, 'User already exists with this email'),
    )
    registerUserMock.mockResolvedValueOnce({
      ...profile,
      email: 'jamie2@u.nus.edu',
    })

    const router = await renderRegisterPage()
    const user = await fillValidForm()

    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument()

    expect(router.state.location.pathname).toBe('/register')
    expect(screen.getByLabelText('Name')).toHaveValue(' Jamie ')

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Create Account' }),
      ).toBeEnabled()
    })

    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), 'jamie2@u.nus.edu')

    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(await screen.findByText(successMessage)).toBeInTheDocument()
    expect(registerUserMock).toHaveBeenCalledTimes(2)
    expect(registerUserMock).toHaveBeenLastCalledWith({
      name: 'Jamie',
      email: 'jamie2@u.nus.edu',
      password: ' password123 ',
    })
  })

  it.each([
    {
      scenario: 'an unsupported email domain',
      error: createHttpError(400, 'Please use your NUS email address.'),
      message: 'Please use your NUS email address.',
    },
    {
      scenario: 'a network failure',
      error: new AuthRequestError(),
      message: 'Unable to reach the server. Please try again.',
    },
    {
      scenario: 'an ordinary 400 response',
      error: createHttpError(400, 'Invalid registration details'),
      message: 'Please check your registration details and try again.',
    },
    {
      scenario: 'a 500 response',
      error: createHttpError(500, 'Internal database details'),
      message: 'Unable to create your account. Please try again.',
    },
    {
      scenario: 'an unexpected error',
      error: new Error('Internal database details'),
      message: 'Unable to create your account. Please try again.',
    },
  ])('handles $scenario without navigating', async ({ error, message }) => {
    registerUserMock.mockRejectedValue(error)

    const router = await renderRegisterPage()
    const user = await fillValidForm()

    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(router.state.location.pathname).toBe('/register')
    expect(registerUserMock).toHaveBeenCalledTimes(1)

    expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled()

    expect(
      screen.queryByText('Internal database details'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(successMessage)).not.toBeInTheDocument()
  })

  it('attempts registration instead of pausing while marked offline', async () => {
    registerUserMock.mockRejectedValue(new AuthRequestError())

    const router = await renderRegisterPage()
    const user = await fillValidForm()

    act(() => {
      onlineManager.setOnline(false)
    })

    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(
      await screen.findByText('Unable to reach the server. Please try again.'),
    ).toBeInTheDocument()

    expect(registerUserMock).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/register')
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled()
  })
})
