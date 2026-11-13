import { afterEach, expect, test, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from './App'
import { safeReturnTo, saveSession } from './auth/session'
import { navigateTo } from './navigation'

// The header bell polls on its own and has its own tests; keep it out of these fetch sequences.
vi.mock('./components/NotificationBell', () => ({
  NotificationBell: () => <span data-testid="notification-bell" />,
}))
vi.mock('./components/NotificationPush', () => ({ NotificationPush: () => null }))

vi.mock('./navigation', () => ({ navigateTo: vi.fn() }))

afterEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
const fillLogin = async () => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.type(screen.getByLabelText('Password'), 'password-with-at-least-15-chars')
  return user
}

const renderProfile = () => {
  window.history.replaceState(null, '', '/?view=profile')
  return render(<App />)
}

test('presents the upgraded signed-out account journey and live supplier handoff', async () => {
  render(<App />)
  const user = userEvent.setup()

  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toHaveAttribute('placeholder', 'e1234567@u.nus.edu')
  expect(screen.getByLabelText('Password')).toHaveAttribute('placeholder', 'Enter your password')
  expect(screen.getByText('Only NUS student emails can join.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Browse campus suppliers/ })).toHaveAttribute('href', '/suppliers')

  await user.click(screen.getByRole('button', { name: 'Create account' }))

  expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
  const progress = screen.getByRole('list', { name: 'Account creation progress' })
  expect(within(progress).getByText('Account')).toBeInTheDocument()
  expect(within(progress).getByText('Verify email')).toBeInTheDocument()
  expect(screen.getByText('Use 15–64 characters.')).toBeInTheDocument()
  expect(screen.getByLabelText('Username')).toHaveAttribute('placeholder', 'Choose a username')
})

test('signs in successfully and stores the browser session', async () => {
  sessionStorage.setItem('foc.login-failures:alice@u.nus.edu', '2')
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
      accessToken: 'signed.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
      }),
    })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ availableBalance: 10 }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Persisted Alice',
        role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
      }),
    }))
  render(<App />)
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(fetch).toHaveBeenCalledWith('/api/users/login', expect.objectContaining({ method: 'POST' }))
  expect(fetch).toHaveBeenCalledWith('/api/credits/me', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByRole('heading', { name: 'Your campus. A thousand small favours.' })).toBeInTheDocument()
  await waitFor(() => expect(fetch).toHaveBeenLastCalledWith('/api/users/me', expect.objectContaining({ method: 'GET' })))
  expect(JSON.parse(sessionStorage.getItem('foc.user-session') ?? '{}')).toMatchObject({ accessToken: 'signed.jwt' })
  expect(sessionStorage.getItem('foc.login-failures:alice@u.nus.edu')).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Profile' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Explore Friend on Campus' })).not.toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toHaveTextContent('Credits')
  expect(screen.queryByRole('switch', { name: 'Admin mode' })).not.toBeInTheDocument()
})

test('keeps Home open after a public Supplier return destination was requested', async () => {
  window.history.replaceState(null, '', '/?returnTo=%2Fsuppliers')
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      accessToken: 'signed.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
    }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ availableBalance: 10 }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Alice',
      role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
    }) }))
  render(<App />)
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('heading', { name: 'Your campus. A thousand small favours.' })).toBeInTheDocument()
  await user.click(screen.getByLabelText('Open account menu for Alice'))
  expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/?view=profile')
  expect(navigateTo).not.toHaveBeenCalled()
})

test('activates credits and returns to Credits after authentication was requested there', async () => {
  window.history.replaceState(null, '', '/?returnTo=%2Fcredits')
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      accessToken: 'signed.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
    }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ availableBalance: 10 }) }))
  render(<App />)
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(fetch).toHaveBeenCalledWith('/api/credits/me', expect.objectContaining({ method: 'POST' }))
  expect(navigateTo).toHaveBeenCalledWith('/credits')
})

test.each([
  ['USER', '/admin/reports/44923986-c91c-47ef-a6d5-b1717e47463c'],
  ['COURIER', '/admin/reports/new?orderId=a8117ec5-2920-4aa6-91cf-4f722741dff3'],
])('returns a signed-in %s participant to the requested report', async (role, destination) => {
  window.history.replaceState(null, '', '/?returnTo=' + encodeURIComponent(destination))
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      accessToken: 'signed.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role,
    }) })
    .mockResolvedValue({ ok: true, json: async () => ({ availableBalance: 10 }) }))
  render(<App />)
  const user = await fillLogin()
  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))
  expect(navigateTo).toHaveBeenCalledWith(destination)
})

test('uses the Requester and Courier selector to replace a session token', async () => {
  saveSession({
    accessToken: 'requester.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'REQUESTER',
    availableRoles: ['REQUESTER'],
  })
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Alice',
      roles: ['REQUESTER'], status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
    }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      accessToken: 'courier.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'COURIER',
      availableRoles: ['REQUESTER', 'COURIER'],
    }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Alice',
      roles: ['REQUESTER', 'COURIER'], status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
    }) }))

  render(<App />)
  const user = userEvent.setup()

  expect(screen.getByRole('heading', { name: 'Your campus. A thousand small favours.' })).toBeInTheDocument()
  expect(screen.queryByText('Made for your campus day')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: /connects students who need a hand/i })).toBeInTheDocument()
  expect(screen.queryByText('NUS email verified')).not.toBeInTheDocument()
  expect(screen.queryByText('Campus-only handoffs')).not.toBeInTheDocument()
  expect(screen.queryByText('Credit rewards')).not.toBeInTheDocument()
  const shortcuts = screen.getByRole('navigation', { name: 'Campus shortcuts' })
  expect(within(shortcuts).getByRole('link', { name: /Post a campus request/ })).toHaveAttribute('href', '/errands/new')
  expect(within(shortcuts).getByRole('link', { name: /Browse open requests/ })).toHaveAttribute('href', '/errands/browse')
  expect(within(shortcuts).getByRole('link', { name: /Find campus suppliers/ })).toHaveAttribute('href', '/suppliers')
  expect(within(shortcuts).getByRole('link', { name: /Check your credits/ })).toHaveAttribute('href', '/credits')
  expect(screen.getByRole('link', { name: /Request help/ })).toHaveAttribute('href', '/errands/new')
  expect(screen.getByRole('link', { name: /Run an errand/ })).toHaveAttribute('href', '/errands/browse')
  expect(screen.queryByText('Requesting help')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Courier' }))

  expect(screen.getByRole('link', { name: /Run an errand/ })).toHaveAttribute('href', '/errands/browse')
  expect(screen.getByRole('link', { name: /Request help/ })).toHaveAttribute('href', '/errands/new')
  expect(screen.getByRole('button', { name: 'Courier' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Requester' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByText('Running errands')).not.toBeInTheDocument()
  expect(JSON.parse(sessionStorage.getItem('foc.user-session') ?? '{}')).toMatchObject({
    accessToken: 'courier.jwt', role: 'COURIER',
  })
  expect(fetch).toHaveBeenCalledWith('/api/users/me/session-role', expect.objectContaining({ method: 'PATCH' }))
})

test.each(['/errands/mine','/errands/3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64','/admin','/admin/cases/10000000-0000-4000-8000-000000000001'])('returns to %s after real role selection when needed',async destination=>{
  window.history.replaceState(null,'','/?returnTo='+encodeURIComponent(destination))
  const fetcher=vi.fn((url:string)=>Promise.resolve({ok:true,json:async()=>url==='/api/users/login'?{accessToken:'participant.jwt',tokenType:'Bearer',expiresAt:'2030-01-01T00:15:00Z',userId:'c3e8d15c-0bb4-443f-989e-b6fda9f38993',username:'Alice',role:'REQUESTER',availableRoles:['REQUESTER','ADMIN']}:url==='/api/users/me/session-role'?{accessToken:'admin.jwt',tokenType:'Bearer',expiresAt:'2030-01-01T00:15:00Z',userId:'c3e8d15c-0bb4-443f-989e-b6fda9f38993',username:'Alice',role:'ADMIN',availableRoles:['REQUESTER','ADMIN']}:{availableBalance:10}}))
  vi.stubGlobal('fetch',fetcher);render(<App/>);const user=await fillLogin()
  await user.click(within(screen.getByRole('form',{name:'Sign in form'})).getByRole('button',{name:'Sign in'}))
  await waitFor(()=>expect(navigateTo).toHaveBeenCalledWith(destination))
  if(destination.startsWith('/admin'))expect(fetcher).toHaveBeenCalledWith('/api/users/me/session-role',expect.objectContaining({method:'PATCH',body:JSON.stringify({role:'ADMIN'})}))
  else expect(fetcher.mock.calls.some(call=>call[0]==='/api/users/me/session-role')).toBe(false)
})

test('opens Admin home after the administrator selects Admin mode', async () => {
  saveSession({
    accessToken: 'requester.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Admin', role: 'REQUESTER',
    availableRoles: ['REQUESTER'],
  })
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'admin@u.nus.edu', username: 'Admin',
      roles: ['REQUESTER', 'ADMIN'], status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
    }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      accessToken: 'admin.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Admin', role: 'ADMIN',
      availableRoles: ['REQUESTER', 'ADMIN'],
    }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'admin@u.nus.edu', username: 'Admin',
      roles: ['REQUESTER', 'ADMIN'], status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
    }) }))
  render(<App />)
  const user = userEvent.setup()

  const accountMenuButton = await screen.findByLabelText('Open account menu for Admin')
  const accountMenu = accountMenuButton.closest('details')
  expect(screen.getByTestId('notification-bell')).toBeInTheDocument()
  await user.click(accountMenuButton)
  expect(accountMenu).toHaveAttribute('open')
  expect(within(screen.getByRole('navigation', { name: 'Main navigation' }))
    .queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: 'Switch to Admin' }))

  await waitFor(() => expect(accountMenu).not.toHaveAttribute('open'))

  const mainNav = screen.getByRole('navigation', { name: 'Main navigation' })
  expect(within(mainNav).getAllByRole('link').map((link) => link.textContent))
    .toEqual(['Admin', 'Suppliers'])
  expect(within(mainNav).queryByRole('link', { name: 'Home' })).not.toBeInTheDocument()
  expect(within(mainNav)
    .getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
  expect(within(mainNav)
    .getByRole('link', { name: 'Suppliers' })).toHaveAttribute('href', '/admin/suppliers')
  expect(within(mainNav)
    .queryByRole('link', { name: 'Errands' })).not.toBeInTheDocument()
  expect(within(mainNav)
    .queryByRole('link', { name: 'Credits' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Friend on Campus' })).toHaveAttribute('href', '/admin')
  expect(screen.getByRole('link', { name: 'Manage users' })).toHaveAttribute('href', '/?view=users')
  expect(screen.getByRole('button', { name: 'Switch to User' })).toBeInTheDocument()
  expect(screen.queryByTestId('notification-bell')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Profile' })).not.toBeInTheDocument()
  expect(navigateTo).toHaveBeenCalledWith('/admin')
})

test('redirects an existing Admin session from the participant root', async () => {
  saveSession({
    accessToken: 'admin.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Admin', role: 'ADMIN',
    availableRoles: ['REQUESTER', 'ADMIN'],
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'admin@u.nus.edu', username: 'Admin',
    roles: ['REQUESTER', 'ADMIN'], status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
  }) }))

  render(<App />)

  await waitFor(() => expect(navigateTo).toHaveBeenCalledWith('/admin'))
  expect(within(screen.getByRole('navigation', { name: 'Main navigation' }))
    .queryByRole('link', { name: 'Home' })).not.toBeInTheDocument()
})

test('keeps Admin account pages at the User service root', async () => {
  window.history.replaceState(null, '', '/?view=profile')
  saveSession({
    accessToken: 'admin.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Admin', role: 'ADMIN',
    availableRoles: ['REQUESTER', 'ADMIN'],
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'admin@u.nus.edu', username: 'Admin',
    roles: ['REQUESTER', 'ADMIN'], status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
  }) }))

  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument()
  expect(navigateTo).not.toHaveBeenCalledWith('/admin')
  const mainNav = screen.getByRole('navigation', { name: 'Main navigation' })
  expect(within(mainNav).getAllByRole('link').map((link) => link.textContent))
    .toEqual(['Admin', 'Suppliers'])
  expect(screen.getByRole('link', { name: 'Friend on Campus' })).toHaveAttribute('href', '/admin')
})

test('clears malformed and expired sessions instead of restoring Profile', () => {
  sessionStorage.setItem('foc.user-session', JSON.stringify({ accessToken: 'expired', expiresAt: '2020-01-01T00:00:00Z' }))
  sessionStorage.setItem('foc.ui-mode', 'admin')

  render(<App />)

  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(sessionStorage.getItem('foc.user-session')).toBeNull()
  expect(sessionStorage.getItem('foc.ui-mode')).toBeNull()
  expect(screen.getByRole('link', { name: 'Browse suppliers without signing in' })).toHaveAttribute('href', '/suppliers')
})

test('accepts only approved relative service return destinations', () => {
  expect(safeReturnTo('?returnTo=%2Fsuppliers%3Fsearch%3Dcoffee')).toBe('/suppliers?search=coffee')
  expect(safeReturnTo('?returnTo=%2Fadmin%2Fsuppliers%2Fnew')).toBe('/admin/suppliers/new')
  expect(safeReturnTo('?returnTo=%2Fcredits')).toBe('/credits')
  expect(safeReturnTo('?returnTo=%2Fnotifications')).toBe('/notifications')
  expect(safeReturnTo('?returnTo=%2Fcredits%2Fhistory%3Fpage%3D2')).toBe('/credits/history?page=2')
  expect(safeReturnTo('?returnTo=https%3A%2F%2Fevil.example')).toBeNull()
  expect(safeReturnTo('?returnTo=%2F%2Fevil.example')).toBeNull()
  expect(safeReturnTo('?returnTo=%2Fapi%2Fusers')).toBeNull()
  expect(safeReturnTo('?returnTo=%2Fadmin%2Fcases%2Fprivate')).toBe('/admin/cases/private')
  expect(safeReturnTo('?returnTo=%2Fadmin%2Freports%2F..%2F..%2Finternal%2Fprivate')).toBeNull()
  expect(safeReturnTo('?returnTo=%2Ferrands%2Fmine')).toBe('/errands/mine')
})

test('shows an accessible error when the live profile cannot be loaded', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        accessToken: 'signed.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
        userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
      }),
    })
    .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ detail: 'Unavailable' }) }))
  renderProfile()
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t load your profile. Please sign out and sign in again.')
})

test('reloads the live profile when restoring a browser session', async () => {
  saveSession({
    accessToken: 'restored.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Stale name', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Persisted Alice',
      role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
    }),
  }))

  renderProfile()

  expect(await screen.findByText('Persisted Alice')).toBeInTheDocument()
  const [, options] = vi.mocked(fetch).mock.calls[0]
  expect((options?.headers as Headers).get('Authorization')).toBe('Bearer restored.jwt')
})

test('updates the displayed username from the live profile screen', async () => {
  const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
  saveSession({
    accessToken: 'restored.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Old name', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Old name',
      role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
    }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'New name',
      role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
    }) }))
  renderProfile()
  const user = userEvent.setup()

  await screen.findByRole('button', { name: 'Edit username' })
  await user.click(screen.getByRole('button', { name: 'Edit username' }))
  const username = screen.getByLabelText('Username')
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  await user.clear(username)
  await user.type(username, 'New name')
  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Username updated.')
  expect(screen.getByText('New name')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit username' })).toBeInTheDocument()
  expect(fetch).toHaveBeenLastCalledWith('/api/users/me/username', expect.objectContaining({ method: 'PATCH' }))

  const dismiss = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 3000)?.[0] as (() => void) | undefined
  await act(async () => { dismiss?.() })
  expect(screen.queryByText('Username updated.')).not.toBeInTheDocument()
})

test('shows duplicate username feedback from the live profile screen', async () => {
  saveSession({
    accessToken: 'restored.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Alice',
      role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
    }) })
    .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ detail: 'username is already taken' }) }))
  renderProfile()
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Edit username' }))
  const username = screen.getByLabelText('Username')
  await user.clear(username)
  await user.type(username, 'Taken')
  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Username is already taken.')
})

test('does not submit an invalid username from the profile screen', async () => {
  saveSession({
    accessToken: 'restored.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Alice',
    role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
  }) }))
  renderProfile()
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Edit username' }))
  const username = screen.getByLabelText('Username')
  await user.clear(username)
  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Username is required and must be at most 20 characters.')
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('changes a password from Profile then signs out the browser session', async () => {
  saveSession({
    accessToken: 'restored.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Alice',
      role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
    }) })
    .mockResolvedValueOnce({ ok: true, status: 204 }))
  renderProfile()
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Change' }))
  await user.type(screen.getByLabelText('Current password'), 'current-password-with-15-chars')
  await user.type(screen.getByLabelText('New password'), 'replacement-password-with-15-chars')
  await user.type(screen.getByLabelText('Confirm new password'), 'replacement-password-with-15-chars')
  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(fetch).toHaveBeenLastCalledWith('/api/users/me/password', expect.objectContaining({ method: 'PATCH' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Password updated. Sign in with your new password.')
  expect(screen.getByLabelText('Email')).toHaveValue('alice@u.nus.edu')
  expect(sessionStorage.getItem('foc.user-session')).toBeNull()
})

test('uses a compact masked password card and clears its draft when cancelled', async () => {
  saveSession({
    accessToken: 'restored.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Alice',
    role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
  }) }))
  renderProfile()
  const user = userEvent.setup()

  expect(await screen.findByLabelText('Password is set')).toHaveTextContent('••••••••')
  await user.click(screen.getByRole('button', { name: 'Change' }))
  const current = screen.getByLabelText('Current password')
  expect(current).toHaveFocus()
  await user.type(current, 'current-password-with-15-chars{Enter}')
  expect(screen.getByLabelText('New password')).toHaveFocus()
  await user.type(screen.getByLabelText('New password'), 'replacement-password-with-15-chars{Enter}')
  expect(screen.getByLabelText('Confirm new password')).toHaveFocus()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(screen.queryByRole('form', { name: 'Change password form' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Password is set')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('current-password-with-15-chars')).not.toBeInTheDocument()
})

test('signs out with only the profile email retained and focuses the empty password field', async () => {
  saveSession({
    accessToken: 'restored.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Alice',
    role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
  }) }))
  render(<App />)
  const user = userEvent.setup()

  await user.click(await screen.findByLabelText('Open account menu for Alice'))
  await user.click(screen.getByRole('button', { name: 'Sign out' }))

  expect(screen.getByLabelText('Email')).toHaveValue('alice@u.nus.edu')
  expect(screen.getByLabelText('Password')).toHaveValue('')
  expect(screen.getByLabelText('Password')).toHaveFocus()
  expect(sessionStorage.getItem('foc.user-session')).toBeNull()
  expect(sessionStorage.getItem('foc.ui-mode')).toBeNull()
  expect(navigateTo).toHaveBeenCalledWith('/')
})

test('keeps the password-change form open when the current password is incorrect', async () => {
  saveSession({
    accessToken: 'restored.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Alice',
      role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
    }) })
    .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ detail: 'Current password is incorrect' }) }))
  renderProfile()
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Change' }))
  await user.type(screen.getByLabelText('Current password'), 'wrong-password')
  await user.type(screen.getByLabelText('New password'), 'replacement-password-with-15-chars')
  await user.type(screen.getByLabelText('Confirm new password'), 'replacement-password-with-15-chars')
  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect')
  expect(screen.getByRole('form', { name: 'Change password form' })).toBeInTheDocument()
  expect(sessionStorage.getItem('foc.user-session')).not.toBeNull()
})

test('validates a sufficiently long replacement password before calling the API', async () => {
  saveSession({
    accessToken: 'restored.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Alice',
    role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
  }) }))
  renderProfile()
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Change' }))
  await user.type(screen.getByLabelText('Current password'), 'current-password-with-15-chars')
  await user.type(screen.getByLabelText('New password'), 'short')
  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('New password must be 15 to 64 characters.')
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('does not submit a Profile password replacement matching the current password', async () => {
  saveSession({
    accessToken: 'restored.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Alice',
    role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
  }) }))
  renderProfile()
  const user = userEvent.setup()
  const password = 'current-password-with-15-chars'

  await user.click(await screen.findByRole('button', { name: 'Change' }))
  await user.type(screen.getByLabelText('Current password'), password)
  await user.type(screen.getByLabelText('New password'), password)
  await user.type(screen.getByLabelText('Confirm new password'), password)
  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('New password must be different from your current password.')
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('shows one generic failure for failed login', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: 'Incorrect email or password' }) }))
  render(<App />)
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  expect(screen.getByLabelText('Email')).toHaveValue('alice@u.nus.edu')
  expect(screen.getByLabelText('Password')).toHaveValue('')
  expect(screen.getByLabelText('Password')).toHaveFocus()
  expect(sessionStorage.getItem('foc.user-session')).toBeNull()
})

test('adds neutral wait-or-reset guidance after two generic failures for the same email', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: 'Incorrect email or password' }) }))
  render(<App />)
  const user = await fillLogin()
  const form = within(screen.getByRole('form', { name: 'Sign in form' }))

  await user.click(form.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  await user.type(screen.getByLabelText('Password'), 'password-with-at-least-15-chars')
  await user.click(form.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password. If you’ve made several attempts, wait 30 seconds or reset your password.')
  expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeEnabled()
})

test('tracks generic login failures separately for each email', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: 'Incorrect email or password' }) }))
  render(<App />)
  const user = await fillLogin()
  const form = within(screen.getByRole('form', { name: 'Sign in form' }))

  await user.click(form.getByRole('button', { name: 'Sign in' }))
  await user.type(screen.getByLabelText('Password'), 'password-with-at-least-15-chars')
  await user.click(form.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('If you’ve made several attempts')

  await user.clear(screen.getByLabelText('Email'))
  await user.type(screen.getByLabelText('Email'), 'bob@u.nus.edu')
  await user.type(screen.getByLabelText('Password'), 'password-with-at-least-15-chars')
  await user.click(form.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
})

test('replaces the registration fields with six OTP boxes after account creation', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Create account', pressed: false }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.type(screen.getByLabelText('Username'), 'Alice')
  await user.type(screen.getByLabelText('Password'), '123456789012345')
  await user.click(within(screen.getByRole('form', { name: 'Create account form' })).getByRole('button', { name: 'Create account' }))

  expect(fetch).toHaveBeenCalledWith('/api/users/registrations', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument()
  expect(screen.getByText(/Verification code sent to/)).toBeInTheDocument()
  expect(screen.getByText('alice@u.nus.edu')).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument()
  const digits = screen.getAllByRole('textbox', { name: /Verification code digit/ })
  expect(digits).toHaveLength(6)
  expect(digits[0]).toHaveFocus()
})

test('keeps registration failures clear when the API is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error('not JSON') } }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Create account', pressed: false }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.type(screen.getByLabelText('Username'), 'Alice')
  await user.type(screen.getByLabelText('Password'), '123456789012345')
  await user.click(within(screen.getByRole('form', { name: 'Create account form' })).getByRole('button', { name: 'Create account' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t create your account. Please try again.')
})

test('requests a password reset and opens a six-box code validation screen without exposing an OTP', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202, headers: new Headers({ 'Retry-After': '37' }) }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(within(screen.getByRole('form', { name: 'Request password reset form' })).getByRole('button', { name: 'Send reset code' }))

  expect(fetch).toHaveBeenCalledWith('/api/users/password-reset-requests', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByRole('heading', { name: 'Verify reset code' })).toBeInTheDocument()
  expect(screen.getAllByRole('textbox', { name: /Verification code digit/ })).toHaveLength(6)
  expect(screen.getByRole('button', { name: 'Request another code in 37s' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeEnabled()
  expect(screen.queryByText(/123456/)).not.toBeInTheDocument()
  expect(sessionStorage.getItem('foc.password-reset-pending-email')).toBe('alice@u.nus.edu')
})

test('returns directly to an unfinished reset code in the same browser session', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 202, headers: new Headers({ 'Retry-After': '37' }) })
    .mockResolvedValueOnce({ ok: true, status: 204 }))
  render(<App />)
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(screen.getByRole('button', { name: 'Send reset code' }))
  await screen.findByRole('heading', { name: 'Verify reset code' })
  await user.click(screen.getByRole('button', { name: 'Back to sign in' }))
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))

  expect(await screen.findByRole('heading', { name: 'Verify reset code' })).toBeInTheDocument()
  expect(screen.getByText('Enter the six-digit code already sent to your email.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Request another code in 37s' })).toBeDisabled()
  expect(fetch).toHaveBeenCalledTimes(1)

  await user.paste('123456')
  expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
})

test('restores an unfinished reset code screen after a browser refresh', async () => {
  sessionStorage.setItem('foc.password-reset-pending-email', 'alice@u.nus.edu')
  sessionStorage.setItem('foc.password-reset-resend:alice@u.nus.edu', String(Date.now() + 37_000))
  const { unmount } = render(<App />)
  unmount()
  render(<App />)
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))

  expect(await screen.findByRole('heading', { name: 'Verify reset code' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Request another code in 37s' })).toBeDisabled()
})

test('shows an accessible generic failure when a reset request cannot be completed', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ detail: 'Unavailable' }) }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(screen.getByRole('button', { name: 'Send reset code' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t send a reset code. Please try again.')
})

test('verifies a registered email with the live verification API', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, status: 204 }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Create account', pressed: false }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.type(screen.getByLabelText('Username'), 'Alice')
  await user.type(screen.getByLabelText('Password'), '123456789012345')
  await user.click(within(screen.getByRole('form', { name: 'Create account form' })).getByRole('button', { name: 'Create account' }))
  const digits = await screen.findAllByRole('textbox', { name: /Verification code digit/ })
  await user.click(digits[0])
  await user.paste('123456')

  expect(await screen.findByRole('status')).toHaveTextContent('Email verified. You can now sign in.')
  expect(fetch).toHaveBeenLastCalledWith('/api/users/email-verifications', expect.objectContaining({ method: 'POST' }))
  expect(screen.queryByRole('button', { name: 'Verify email' })).not.toBeInTheDocument()
})

test('requires an eligible NUS email before requesting a password reset', async () => {
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@example.com')
  await user.click(screen.getByRole('button', { name: 'Send reset code' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Use an eligible NUS student email.')
  expect(fetch).not.toHaveBeenCalled()
})

test('clears a rejected verification code and returns focus to its first digit', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ detail: 'The verification code is invalid or expired.' }) }))
  render(<App />)
  const user = userEvent.setup()
  await openVerificationAfterRegistration(user)
  const digits = screen.getAllByRole('textbox', { name: /Verification code digit/ })
  await user.paste('000000')

  expect(await screen.findByRole('alert')).toHaveTextContent('The verification code is invalid or expired.')
  digits.forEach(digit => expect(digit).toHaveValue(''))
  expect(digits[0]).toHaveFocus()
})

test('redirects to OTP only when the API confirmed correct credentials require verification', async () => {
  sessionStorage.setItem('foc.login-failures:alice@u.nus.edu', '2')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 403,
    json: async () => ({ code: 'EMAIL_VERIFICATION_REQUIRED', detail: 'Email verification is required before signing in' }),
  }))
  render(<App />)
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument()
  expect(screen.getByText('alice@u.nus.edu')).toBeInTheDocument()
  expect(screen.getAllByRole('textbox', { name: /Verification code digit/ })).toHaveLength(6)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(sessionStorage.getItem('foc.login-failures:alice@u.nus.edu')).toBeNull()
})

test('keeps the generic login failure when verification was not confirmed', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ detail: 'Incorrect email or password' }),
  }))
  render(<App />)
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  expect(screen.queryByRole('heading', { name: 'Verify your email' })).not.toBeInTheDocument()
})

const openVerificationAfterRegistration = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Create account', pressed: false }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.type(screen.getByLabelText('Username'), 'Alice')
  await user.type(screen.getByLabelText('Password'), '123456789012345')
  await user.click(within(screen.getByRole('form', { name: 'Create account form' })).getByRole('button', { name: 'Create account' }))
  await screen.findByRole('heading', { name: 'Verify your email' })
}

test('shows a live, disabled resend cooldown after registration', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({}) }))
  render(<App />)
  const user = userEvent.setup()
  await openVerificationAfterRegistration(user)

  expect(screen.getByRole('button', { name: 'Resend in 90s' })).toBeDisabled()
})

test('uses a conventional accessible password visibility toggle', async () => {
  render(<App />)
  const user = userEvent.setup()
  const password = screen.getByLabelText('Password')

  expect(password).toHaveAttribute('type', 'password')
  await user.click(screen.getByRole('button', { name: 'Show password' }))
  expect(password).toHaveAttribute('type', 'text')
  await user.click(screen.getByRole('button', { name: 'Hide password' }))
  expect(password).toHaveAttribute('type', 'password')
})

test('places focus at the first field and advances through registration fields with Enter', async () => {
  render(<App />)
  const user = userEvent.setup()
  expect(screen.getByLabelText('Email')).not.toHaveFocus()

  await user.click(screen.getByRole('button', { name: 'Create account', pressed: false }))
  const email = screen.getByLabelText('Email')
  expect(email).toHaveFocus()
  await user.type(email, 'alice@u.nus.edu{Enter}')
  expect(screen.getByLabelText('Username')).toHaveFocus()
  await user.type(screen.getByLabelText('Username'), 'Alice{Enter}')
  expect(screen.getByLabelText('Password')).toHaveFocus()
})

test('applies a server-provided cooldown when a resend is too early', async () => {
  sessionStorage.setItem('foc.email-verification-resend:alice@u.nus.edu', String(Date.now() - 1))
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ code: 'EMAIL_VERIFICATION_REQUIRED', detail: 'Email verification is required before signing in' }) })
    .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '45' }), json: async () => ({ detail: 'Email verification resend is not available yet' }) }))
  render(<App />)
  const user = await fillLogin()
  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('heading', { name: 'Verify your email' })
  expect(screen.getByRole('button', { name: 'Resend verification code' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'Resend verification code' }))

  expect(fetch).toHaveBeenLastCalledWith('/api/users/email-verification-resends', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Please wait 45 seconds before requesting another code.')
  expect(screen.getByRole('button', { name: 'Resend in 45s' })).toBeDisabled()
})

test('confirms a reset code and lets the user return to sign in', async () => {
  sessionStorage.setItem('foc.login-failures:alice@u.nus.edu', '2')
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 202 })
    .mockResolvedValueOnce({ ok: true, status: 204 })
    .mockResolvedValueOnce({ ok: true, status: 204 }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(screen.getByRole('button', { name: 'Send reset code' }))
  expect(await screen.findByRole('heading', { name: 'Verify reset code' })).toBeInTheDocument()
  await user.paste('123456')
  expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
  expect(fetch).toHaveBeenLastCalledWith('/api/users/password-reset-verifications', expect.objectContaining({ method: 'POST' }))
  await user.type(screen.getByLabelText('New password'), 'new-password-with-15-chars')
  await user.type(screen.getByLabelText('Confirm new password'), 'new-password-with-15-chars')
  await user.click(screen.getByRole('button', { name: 'Update password' }))

  expect(fetch).toHaveBeenLastCalledWith('/api/users/password-reset-confirmations', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument()
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Confirm new password')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Request another code' })).not.toBeInTheDocument()
  expect(sessionStorage.getItem('foc.login-failures:alice@u.nus.edu')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
})

test('shows a generic confirmation failure for an invalid or expired code', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 202 })
    .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ detail: 'Invalid or expired password reset code' }) }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(screen.getByRole('button', { name: 'Send reset code' }))
  const digits = await screen.findAllByRole('textbox', { name: /Verification code digit/ })
  await user.paste('000000')

  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired password reset code')
  digits.forEach(digit => expect(digit).toHaveValue(''))
  expect(digits[0]).toHaveFocus()
  expect(screen.queryByRole('heading', { name: 'Choose a new password' })).not.toBeInTheDocument()
})

test('shows a specific same-password error after a valid reset code without leaving the password screen', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 202 })
    .mockResolvedValueOnce({ ok: true, status: 204 })
    .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({
      code: 'PASSWORD_REUSE', detail: 'New password must be different from your current password',
    }) }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(screen.getByRole('button', { name: 'Send reset code' }))
  await user.paste('123456')
  await screen.findByRole('heading', { name: 'Choose a new password' })
  await user.type(screen.getByLabelText('New password'), 'old-password-with-15-chars')
  await user.type(screen.getByLabelText('Confirm new password'), 'old-password-with-15-chars')
  await user.click(screen.getByRole('button', { name: 'Update password' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('New password must be different from your current password')
  expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
})

test('returns from the new-password screen to sign in and clears the reset draft', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 202 })
    .mockResolvedValueOnce({ ok: true, status: 204 })
    .mockResolvedValueOnce({ ok: true, status: 204 }))
  render(<App />)
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(screen.getByRole('button', { name: 'Send reset code' }))
  await user.paste('123456')
  await screen.findByRole('heading', { name: 'Choose a new password' })
  await user.type(screen.getByLabelText('New password'), 'replacement-password-with-15-chars')
  await user.type(screen.getByLabelText('Confirm new password'), 'replacement-password-with-15-chars')
  await user.click(screen.getByRole('button', { name: 'Back to sign in' }))

  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  expect(await screen.findByRole('heading', { name: 'Verify reset code' })).toBeInTheDocument()
  await user.paste('654321')
  await screen.findByRole('heading', { name: 'Choose a new password' })

  expect(screen.getByLabelText('New password')).toHaveValue('')
  expect(screen.getByLabelText('Confirm new password')).toHaveValue('')
})

test('clears the unfinished reset handoff after a successful password update', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 202 })
    .mockResolvedValueOnce({ ok: true, status: 204 })
    .mockResolvedValueOnce({ ok: true, status: 204 }))
  render(<App />)
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(screen.getByRole('button', { name: 'Send reset code' }))
  await user.paste('123456')
  await screen.findByRole('heading', { name: 'Choose a new password' })
  await user.type(screen.getByLabelText('New password'), 'replacement-password-with-15-chars')
  await user.type(screen.getByLabelText('Confirm new password'), 'replacement-password-with-15-chars')
  await user.click(screen.getByRole('button', { name: 'Update password' }))
  await screen.findByRole('heading', { name: 'Password updated' })
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))

  expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument()
  expect(sessionStorage.getItem('foc.password-reset-pending-email')).toBeNull()
})
