/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Tests for the profile page and the header link to it.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import * as userApi from '../api/userApi'
import { AuthContext, type AuthApi } from '../auth/authContext'
import { ToastProvider } from '../components/toast/ToastProvider'
import { ProfilePage } from './ProfilePage'

vi.mock('../api/userApi')
vi.mock('../api/creditApi', () => ({
  getCreditBalance: vi.fn(async () => ({ available: 100, reserved: 0, total: 100 })),
  listCreditTransactions: vi.fn(),
}))

const member: userApi.CurrentUser = { username: 'alice_tan', displayName: 'Alice', role: 'MEMBER', email: 'alice@u.nus.edu', createdAt: '2026-11-01T02:00:00Z' }

// A real state holder, so updateUser() changes what the header shows
function Harness({ initial }: { initial: userApi.CurrentUser }) {
  const [user, setUser] = useState(initial)
  const auth: AuthApi = { status: 'loggedIn', user, notice: null, login: vi.fn(), logout: vi.fn(), updateUser: setUser }
  return <MemoryRouter><ToastProvider><AuthContext.Provider value={auth}><ProfilePage /></AuthContext.Provider></ToastProvider></MemoryRouter>
}

beforeEach(() => {
  vi.mocked(userApi.whoami).mockReset().mockResolvedValue(member)
  vi.mocked(userApi.updateDisplayName).mockReset()
})

it('shows username, email and joined date; the role only for administrators', async () => {
  const { unmount } = render(<Harness initial={member} />)
  const details = screen.getByRole('region', { name: 'Account details' })
  expect(within(details).getByText('@alice_tan')).toBeInTheDocument()
  expect(within(details).getByText('alice@u.nus.edu')).toBeInTheDocument()
  expect(within(details).getByText(/1 Nov 2026/)).toBeInTheDocument()
  expect(within(details).queryByText('Role')).not.toBeInTheDocument()
  unmount()
  render(<Harness initial={{ ...member, role: 'ADMINISTRATOR' }} />)
  expect(within(screen.getByRole('region', { name: 'Account details' })).getByText('Administrator')).toBeInTheDocument()
})

it('saves the display name and the header updates at once', async () => {
  const user = userEvent.setup()
  vi.mocked(userApi.updateDisplayName).mockResolvedValue({ ...member, displayName: 'Alice Tan' })
  render(<Harness initial={member} />)
  const save = screen.getByRole('button', { name: 'Save' })
  expect(save).toBeDisabled() // unchanged
  const input = screen.getByLabelText('Display name')
  await user.clear(input)
  await user.type(input, '  Alice Tan ')
  await user.click(save)
  await waitFor(() => expect(userApi.updateDisplayName).toHaveBeenCalledWith('Alice Tan'))
  expect(await within(screen.getByRole('banner')).findByText('Alice Tan')).toBeInTheDocument()
  expect(screen.getByText('Display name saved.')).toBeInTheDocument()
  expect(within(screen.getByRole('banner')).getByRole('link', { name: /Alice Tan/ })).toHaveAttribute('href', '/profile')
})

it('refuses an empty name before sending, and shows a server error', async () => {
  const user = userEvent.setup()
  vi.mocked(userApi.updateDisplayName).mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE', 'down'))
  render(<Harness initial={member} />)
  const input = screen.getByLabelText('Display name')
  await user.clear(input)
  await user.type(input, '   ')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('alert')).toHaveTextContent('1–50 characters')
  expect(userApi.updateDisplayName).not.toHaveBeenCalled()
  await user.clear(input)
  await user.type(input, 'Alice T')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable')
})
