import { StrictMode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthRouterProvider } from '#/App'
import { routeTree } from '#/routes'
import { AuthProvider } from '../../providers/AuthProvider'
import {
  confirmEmailChange,
  resendVerification,
  verifyEmail,
} from '../../api/emailVerification.api'
import { AuthRequestError } from '../../lib/authRequest'
import { getUserProfile } from '../../api/userProfile.api'
import { getAccessToken, setAccessToken } from '../../lib/accessTokenStore'
import { profileKey } from '../../hooks/useUserProfile'

vi.mock('../../api/userProfile.api')

vi.mock('../../api/emailVerification.api', () => ({
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  confirmEmailChange: vi.fn(),
}))

const clients: Array<QueryClient> = []

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  clients.forEach((client) => client.clear())
  clients.length = 0
  vi.restoreAllMocks()
  setAccessToken(null)
})

const setup = (path: string, seed?: (client: QueryClient) => void) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  })
  clients.push(client)
  seed?.(client)
  const router = createRouter({
    routeTree,
    context: { auth: undefined! },
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <AuthRouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
  return router
}

it('automatically confirms a link once in StrictMode and then offers login', async () => {
  let complete!: () => void
  vi.mocked(verifyEmail).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve
      }),
  )
  setup('/verify-email?token=mail-token')
  expect(
    await screen.findByRole('heading', { name: 'Verifying your email…' }),
  ).toBeInTheDocument()
  await waitFor(() =>
    expect(verifyEmail).toHaveBeenCalledExactlyOnceWith(
      'mail-token',
      expect.any(Object),
    ),
  )
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  await act(async () => complete())
  expect(
    await screen.findByRole('heading', { name: 'Email verified' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
    'href',
    '/login',
  )
  expect(verifyEmail).toHaveBeenCalledTimes(1)
})

it('directs an unavailable link to login without offering resend', async () => {
  vi.mocked(verifyEmail).mockRejectedValue(new AuthRequestError(400))
  const router = setup('/verify-email?token=expired-token')
  expect(
    await screen.findByRole('heading', { name: 'Link unavailable' }),
  ).toBeInTheDocument()
  expect(screen.getByText(/expired or already been used/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Resend verification email' }),
  ).not.toBeInTheDocument()
  const user = userEvent.setup()
  await user.click(screen.getByRole('link', { name: 'Back to log in' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(resendVerification).not.toHaveBeenCalled()
})

it('shows the resend interval inline and lets the user retry', async () => {
  vi.mocked(resendVerification)
    .mockRejectedValueOnce(new AuthRequestError(429))
    .mockResolvedValueOnce(undefined)
  setup('/verify-email?email=jamie@u.nus.edu')
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'Resend verification email' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Please wait a minute',
  )
  await user.click(
    screen.getByRole('button', { name: 'Resend verification email' }),
  )
  expect(await screen.findByRole('status')).toHaveTextContent('inbox and spam')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(verifyEmail).not.toHaveBeenCalled()
})

it('retries verification after a temporary request failure', async () => {
  vi.mocked(verifyEmail)
    .mockRejectedValueOnce(new AuthRequestError())
    .mockResolvedValueOnce(undefined)
  setup('/verify-email?token=mail-token')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Try again' }))
  expect(
    await screen.findByRole('heading', { name: 'Email verified' }),
  ).toBeInTheDocument()
  expect(verifyEmail).toHaveBeenCalledTimes(2)
})

it('confirms an email change and refreshes the profile on return without logging out', async () => {
  const oldProfile = {
    id: '1',
    name: 'Jamie Tan',
    email: 'old@u.nus.edu',
    roles: ['USER'],
    phoneNumber: null,
    faculty: null,
    avatarUrl: null,
  }
  const accessToken = `header.${btoa(JSON.stringify({ sub: '1', roles: ['USER'] }))}.signature`
  setAccessToken(accessToken)
  vi.mocked(confirmEmailChange).mockResolvedValue(undefined)
  vi.mocked(getUserProfile).mockResolvedValue({
    ...oldProfile,
    email: 'new@nus.edu.sg',
  })
  setup('/verify-email?purpose=email-change&token=change-token', (client) => {
    client.setQueryData(profileKey, oldProfile)
  })
  expect(
    await screen.findByRole('heading', { name: 'Email updated' }),
  ).toBeInTheDocument()
  expect(confirmEmailChange).toHaveBeenCalledExactlyOnceWith(
    'change-token',
    expect.any(Object),
  )
  expect(verifyEmail).not.toHaveBeenCalled()
  await userEvent
    .setup()
    .click(screen.getByRole('link', { name: 'Back to profile' }))
  await screen.findByRole('heading', { name: 'My Profile' })
  await waitFor(() =>
    expect(screen.getAllByText('new@nus.edu.sg').length).toBeGreaterThan(0),
  )
  expect(getAccessToken()).toBe(accessToken)
})

it('sends an unavailable email-change link back to profile editing instead of registration resend', async () => {
  vi.mocked(confirmEmailChange).mockRejectedValue(new AuthRequestError(400))
  setup('/verify-email?purpose=email-change&token=expired-token')
  expect(
    await screen.findByRole('heading', { name: 'Link unavailable' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Back to Edit Profile' }),
  ).toHaveAttribute('href', '/profile/edit')
  expect(
    screen.queryByRole('button', { name: 'Resend verification email' }),
  ).not.toBeInTheDocument()
  expect(resendVerification).not.toHaveBeenCalled()
})
