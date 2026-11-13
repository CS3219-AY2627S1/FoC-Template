import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthRouterProvider } from '#/App'
import { routeTree } from '#/routes'
import { AuthProvider } from '../../providers/AuthProvider'
import {
  requestPasswordReset,
  resetPassword,
} from '../../api/forgotPassword.api'
import { AuthRequestError } from '../../lib/authRequest'

vi.mock('../../api/forgotPassword.api')
let client: QueryClient
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
})
const setup = (path: string) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
  return userEvent.setup()
}

it('opens from login, sends a normalized email and resends on the same page', async () => {
  vi.mocked(requestPasswordReset).mockResolvedValue(undefined)
  const user = setup('/login')
  await user.click(
    await screen.findByRole('link', { name: 'Forgot password?' }),
  )
  await user.type(await screen.findByLabelText('Email'), ' JAMIE@U.NUS.EDU ')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(await screen.findByRole('status')).toHaveTextContent('inbox and spam')
  expect(requestPasswordReset).toHaveBeenCalledWith(
    'jamie@u.nus.edu',
    expect.any(Object),
  )
  await user.click(screen.getByRole('button', { name: 'Resend reset link' }))
  expect(requestPasswordReset).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('status')).toHaveTextContent('inbox and spam')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it.each([undefined, 400])(
  'submits only matching passwords and allows retry after error %s',
  async (status) => {
    vi.mocked(resetPassword)
      .mockRejectedValueOnce(
        new AuthRequestError(status, 'Any validation message'),
      )
      .mockResolvedValueOnce(undefined)
    const user = setup('/reset-password?token=reset-token')
    await user.type(
      await screen.findByLabelText('New password'),
      ' NewPassword2 ',
    )
    await user.type(screen.getByLabelText('Confirm new password'), 'different')
    expect(resetPassword).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Passwords do not match',
    )
    expect(resetPassword).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('Confirm new password'))
    await user.type(
      screen.getByLabelText('Confirm new password'),
      ' NewPassword2 ',
    )
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to reset',
    )
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(
      await screen.findByRole('heading', { name: 'Password reset' }),
    ).toBeInTheDocument()
    expect(resetPassword).toHaveBeenLastCalledWith(
      { token: 'reset-token', newPassword: ' NewPassword2 ' },
      expect.any(Object),
    )
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login',
    )
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  },
)

it('offers a new link when the submitted link is unavailable', async () => {
  vi.mocked(resetPassword).mockRejectedValue(new AuthRequestError(410))
  const user = setup('/reset-password?token=used-token')
  await user.type(await screen.findByLabelText('New password'), 'NewPassword2')
  await user.type(screen.getByLabelText('Confirm new password'), 'NewPassword2')
  await user.click(screen.getByRole('button', { name: 'Reset password' }))
  expect(
    await screen.findByRole('heading', { name: 'Link unavailable' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Request a new link' }),
  ).toHaveAttribute('href', '/forgot-password')
})
