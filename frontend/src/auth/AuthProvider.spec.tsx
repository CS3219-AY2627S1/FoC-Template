/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Tests for the author's rule that only a 401 ends the session on page load.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApiError, NetworkError } from '../api/client'
import * as userApi from '../api/userApi'
import { ToastProvider } from '../components/toast/ToastProvider'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './authContext'
import { clearToken, getToken, saveToken } from './tokenStorage'

vi.mock('../api/userApi')
// Capture the provider's 401 handler so a test can play the shared client's part
let onUnauthorized: (() => void) | null = null
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return { ...actual, setUnauthorizedHandler: (handler: (() => void) | null) => { onUnauthorized = handler } }
})

function Status() {
  const { status, user } = useAuth()
  return <p>status: {status}{user ? ` as ${user.username}` : ''}</p>
}
function renderApp() {
  return render(<ToastProvider><AuthProvider><Status /></AuthProvider></ToastProvider>)
}
// A token valid for another hour. (Not decades: the provider schedules its expiry timers from
// `exp`, and a delay beyond setTimeout's 32-bit limit fires after 1 ms and ends the session.)
const TOKEN = `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({ sub: 'x', exp: Math.floor(Date.now() / 1000) + 3600 }))}.sig`

beforeEach(() => {
  vi.mocked(userApi.whoami).mockReset()
  saveToken(TOKEN)
})
afterEach(() => clearToken())

it.each([
  ['a 503', new ApiError(503, 'SERVICE_UNAVAILABLE', 'Service temporarily unavailable')],
  ['an unreachable server', new NetworkError()],
])('%s on page load keeps the login and offers Try again', async (_label, error) => {
  const user = userEvent.setup()
  vi.mocked(userApi.whoami).mockRejectedValueOnce(error).mockResolvedValueOnce({ username: 'alice_tan', displayName: 'Alice', role: 'MEMBER' })
  renderApp()
  expect(await screen.findByRole('heading', { name: 'Service temporarily unavailable' })).toBeInTheDocument()
  expect(getToken()).toBe(TOKEN)
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('status: loggedIn as alice_tan')).toBeInTheDocument()
  expect(userApi.whoami).toHaveBeenCalledTimes(2)
})

it('a 401 on page load still logs out and forgets the token', async () => {
  vi.mocked(userApi.whoami).mockImplementation(async () => {
    onUnauthorized?.() // what apiRequest does on any authenticated 401
    throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid or expired token')
  })
  renderApp()
  expect(await screen.findByText('status: loggedOut')).toBeInTheDocument()
  expect(getToken()).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Service temporarily unavailable' })).not.toBeInTheDocument()
})
