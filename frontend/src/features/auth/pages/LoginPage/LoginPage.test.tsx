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

import { loginUser } from '#/features/auth/api/loginUser.api'
import { routeTree } from '#/routes'
import {
  setAccessToken,
  getAccessToken,
} from '#/features/auth/lib/accessTokenStore'
import type { AccessTokenResponse } from '#/features/auth/types/auth.types'

vi.mock('#/features/auth/api/loginUser.api', () => ({ loginUser: vi.fn() }))

const loginMock = vi.mocked(loginUser)
const tokens: AccessTokenResponse = {
  accessToken: 'test-token',
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
}

const clients: Array<QueryClient> = []
let previousOnline = true
const httpError = (status: number) =>
  new AuthRequestError(status, 'Internal details')

beforeEach(() => {
  sessionStorage.clear()
  vi.spyOn(window, 'scrollTo').mockImplementation(vi.fn())
  setAccessToken(null)
  loginMock.mockReset()
  previousOnline = onlineManager.isOnline()
  onlineManager.setOnline(true)
})

afterEach(() => {
  cleanup()
  setAccessToken(null)
  clients.forEach((client) => client.clear())
  clients.length = 0
  onlineManager.setOnline(previousOnline)
  vi.restoreAllMocks()
})

const setup = async (path = '/login') => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
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
  await screen.findByRole('heading', { name: 'Welcome Back' })
  return router
}

const fill = async () => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), ' JAMIE@EXAMPLE.COM ')
  await user.type(screen.getByLabelText('Password'), ' password123 ')
  return user
}

describe('LoginPage', () => {
  it('redirect to admin dashboard after admin users login', async () => {
    const adminToken = `header.${btoa(JSON.stringify({ roles: ['USER', 'ADMIN'] }))}.signature`
    loginMock.mockResolvedValue({ ...tokens, accessToken: adminToken })
    const router = await setup()
    const user = await fill()

    await user.click(screen.getByRole('button', { name: 'Log In' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'))

    expect(getAccessToken()).toBe(adminToken)
  })

  it('blocks rapid, pending and successful resubmissions', async () => {
    let resolveRequest!: (value: AccessTokenResponse) => void
    loginMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve
        }),
    )
    const router = await setup()

    await fill()
    const form = screen.getByRole('button', { name: 'Log In' }).closest('form')!
    act(() => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    })
    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1))

    expect(
      await screen.findByRole('button', { name: 'Logging in…' }),
    ).toBeDisabled()
    expect(screen.getByLabelText('Email')).toBeDisabled()
    expect(screen.getByLabelText('Password')).toBeDisabled()
    fireEvent.submit(form)

    expect(loginMock).toHaveBeenCalledExactlyOnceWith({
      email: 'jamie@example.com',
      password: ' password123 ',
    })
    await act(async () => resolveRequest(tokens))

    expect(
      await screen.findByRole('heading', { name: 'Home' }),
    ).toBeInTheDocument()
    expect(getAccessToken()).toBe(tokens.accessToken)
    expect(
      screen.queryByRole('button', { name: 'Log In' }),
    ).not.toBeInTheDocument()
    expect(loginMock).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/home')
    expect(screen.queryByText(tokens.accessToken)).not.toBeInTheDocument()
  })

  it('releases the lock after failure and allows corrected input to succeed', async () => {
    loginMock
      .mockRejectedValueOnce(httpError(401))
      .mockResolvedValueOnce(tokens)
    await setup()
    const user = await fill()
    await user.click(screen.getByRole('button', { name: 'Log In' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect email or password.',
    )
    expect(screen.getByLabelText('Password')).toHaveValue(' password123 ')
    expect(screen.getByRole('button', { name: 'Log In' })).toBeEnabled()
    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'Log In' }))

    expect(
      await screen.findByRole('heading', { name: 'Home' }),
    ).toBeInTheDocument()
    expect(getAccessToken()).toBe(tokens.accessToken)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(loginMock).toHaveBeenCalledTimes(2)
    expect(loginMock).toHaveBeenLastCalledWith({
      email: 'jamie@example.com',
      password: 'correct-password',
    })
  })

  it('offers verification without establishing a session for an unverified account', async () => {
    loginMock.mockRejectedValue(httpError(403))
    const router = await setup()
    const user = await fill()
    await user.click(screen.getByRole('button', { name: 'Log In' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please verify your email before logging in.',
    )
    expect(getAccessToken()).toBeNull()
    await user.click(
      screen.getByRole('link', { name: 'Resend verification email' }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toEqual({ email: 'jamie@example.com' })
  })

  it.each([
    [400, 'Please check your login details and try again.'],
    [502, 'Unable to log in. Please try again.'],
  ])(
    'handles HTTP %s without exposing server details',
    async (status, message) => {
      loginMock.mockRejectedValue(httpError(status))
      const router = await setup()
      const user = await fill()
      await user.click(screen.getByRole('button', { name: 'Log In' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(screen.queryByText('Internal details')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Log In' })).toBeEnabled()
      expect(router.state.location.pathname).toBe('/login')
    },
  )

  it.each([
    [new AuthRequestError(), 'Unable to reach the server. Please try again.'],
    [new Error('Internal details'), 'Unable to log in. Please try again.'],
  ])('handles a failure without a response: %s', async (error, message) => {
    loginMock.mockRejectedValue(error)
    await setup()
    const user = await fill()
    await user.click(screen.getByRole('button', { name: 'Log In' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'Log In' })).toBeEnabled()
    expect(loginMock).toHaveBeenCalledTimes(1)
  })

  it('attempts the request while marked offline', async () => {
    loginMock.mockRejectedValue(new AuthRequestError())
    await setup()
    const user = await fill()
    act(() => onlineManager.setOnline(false))
    await user.click(screen.getByRole('button', { name: 'Log In' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to reach the server.',
    )
    expect(loginMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Log In' })).toBeEnabled()
  })
})
