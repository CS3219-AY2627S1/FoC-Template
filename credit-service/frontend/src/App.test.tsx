import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { sessionKey } from './auth/session'
import { navigateTo } from './navigation'

vi.mock('./navigation', () => ({
  navigateTo: vi.fn(),
  signInPath: () => '/?returnTo=%2Fcredits',
}))

const balance = {
  userId: '10000000-0000-0000-0000-000000000000',
  availableBalance: 4,
  reservedBalance: 6,
  totalBalance: 10,
  updatedAt: '2026-10-15T09:00:00Z',
}

const transaction = {
  id: '30000000-0000-0000-0000-000000000000',
  operationId: '40000000-0000-0000-0000-000000000000',
  reservationId: '50000000-0000-0000-0000-000000000000',
  type: 'RESERVATION_CREATED',
  availableDelta: -6,
  reservedDelta: 6,
  availableBalanceAfter: 4,
  reservedBalanceAfter: 6,
  createdAt: '2026-10-15T09:00:00Z',
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':
        status >= 400 ? 'application/problem+json' : 'application/json',
    },
  })
}

function signedIn() {
  sessionStorage.setItem(
    sessionKey,
    JSON.stringify({
      accessToken: 'valid-token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      userId: balance.userId,
      username: 'alex',
      role: 'REQUESTER',
      availableRoles: ['REQUESTER', 'COURIER'],
    }),
  )
}

function signedInAdmin() {
  sessionStorage.setItem(
    sessionKey,
    JSON.stringify({
      accessToken: 'admin-token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      userId: balance.userId,
      username: 'admin',
      role: 'ADMIN',
      availableRoles: ['REQUESTER', 'ADMIN'],
    }),
  )
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )
}

function mockSuccessfulApi(totalPages = 1) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init
    const url = String(input)
    if (url === '/api/credits/me') return response(balance)
    if (url.includes('/api/credits/me/transactions')) {
      const page = Number(
        new URL(url, 'http://localhost').searchParams.get('page'),
      )
      return response({
        content: [
          { ...transaction, id: `${transaction.id.slice(0, -1)}${page}` },
        ],
        page,
        size: 8,
        totalElements: totalPages,
        totalPages,
      })
    }
    return response({}, 404)
  })
}

describe('Credit dashboard', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('asks a signed-out visitor to authenticate without calling the API', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderApp()

    expect(
      screen.getByRole('heading', { name: 'Sign in to view your credits' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Sign in to FoC' }),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the authenticated balance and immutable ledger history', async () => {
    signedIn()
    const fetchMock = mockSuccessfulApi()
    vi.stubGlobal('fetch', fetchMock)

    renderApp()

    expect(
      await screen.findByRole('heading', { name: /4 available/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('See what is ready to spend and follow every change in your ledger.'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Friend on Campus' }),
    ).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Errands' })).toHaveAttribute(
      'href',
      '/errands/mine',
    )
    expect(
      screen.getByLabelText('4 of 10 credits available'),
    ).toBeInTheDocument()
    expect(screen.getByText('Reserved for an errand')).toBeInTheDocument()
    expect(screen.getByText('4 available · 6 reserved')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/credits/me',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
      }),
    )
    const activationRequest = fetchMock.mock.calls.find(
      ([url]) => String(url) === '/api/credits/me',
    )
    expect((activationRequest?.[1]?.headers as Headers).get('Authorization')).toBe(
      'Bearer valid-token',
    )
  })

  it('requests the next zero-based transaction page', async () => {
    signedIn()
    const fetchMock = mockSuccessfulApi(2)
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Next' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/credits/me/transactions?page=1&size=8',
        expect.anything(),
      )
    })
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
  })

  it('changes the active workspace through the shared User Service session', async () => {
    signedIn()
    const creditApi = mockSuccessfulApi()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/users/me/session-role') {
        return response({
          accessToken: 'courier-token',
          tokenType: 'Bearer',
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          userId: balance.userId,
          username: 'alex',
          role: 'COURIER',
          availableRoles: ['REQUESTER', 'COURIER'],
        })
      }
      return creditApi(input)
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Courier' }))

    expect(screen.getByRole('button', { name: 'Courier' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('courier')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/me/session-role',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ role: 'COURIER' }),
      }),
    )
    expect(
      JSON.parse(sessionStorage.getItem(sessionKey) ?? '{}'),
    ).toMatchObject({
      accessToken: 'courier-token',
      role: 'COURIER',
    })
  })

  it('keeps the current JWT and workspace when a role change fails', async () => {
    signedIn()
    const creditApi = mockSuccessfulApi()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/users/me/session-role') {
        return response({ title: 'Service unavailable' }, 503)
      }
      return creditApi(input)
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Courier' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't switch your role. Please try again.",
    )
    expect(screen.getByRole('button', { name: 'Requester' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Courier' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(
      JSON.parse(sessionStorage.getItem(sessionKey) ?? '{}'),
    ).toMatchObject({
      accessToken: 'valid-token',
      role: 'REQUESTER',
    })
  })

  it('opens Admin home after switching from the Credits page', async () => {
    sessionStorage.setItem(
      sessionKey,
      JSON.stringify({
        accessToken: 'requester-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        userId: balance.userId,
        username: 'admin',
        role: 'REQUESTER',
        availableRoles: ['REQUESTER', 'ADMIN'],
      }),
    )
    const creditApi = mockSuccessfulApi()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === '/api/users/me/session-role') {
          return response({
            accessToken: 'admin-token',
            tokenType: 'Bearer',
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
            userId: balance.userId,
            username: 'admin',
            role: 'ADMIN',
            availableRoles: ['REQUESTER', 'ADMIN'],
          })
        }
        return creditApi(input, init)
      }),
    )
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: /4 available/i })
    expect(
      screen.getByRole('link', { name: /^Notifications/ }),
    ).toBeInTheDocument()
    await user.click(screen.getByLabelText('Open account menu for admin'))
    await user.click(screen.getByRole('button', { name: 'Switch to Admin' }))

    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith('/admin'))
    expect(
      screen.queryByRole('link', { name: /^Notifications/ }),
    ).not.toBeInTheDocument()
  })

  it('keeps administrator navigation and account actions consistent', async () => {
    signedInAdmin()
    const creditApi = mockSuccessfulApi()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/users/me/session-role') {
        return response({
          accessToken: 'requester-token',
          tokenType: 'Bearer',
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          userId: balance.userId,
          username: 'admin',
          role: 'REQUESTER',
          availableRoles: ['REQUESTER', 'ADMIN'],
        })
      }
      return creditApi(input, init)
    }))
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { name: /4 available/i })
    expect(
      screen.getByRole('navigation', { name: 'Account and workspace' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Suppliers' }),
    ).toHaveAttribute('href', '/admin/suppliers')
    const mainNav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(
      within(mainNav).getAllByRole('link').map((link) => link.textContent),
    ).toEqual(['Admin', 'Suppliers'])
    expect(within(mainNav).queryByRole('link', { name: 'Home' })).not.toBeInTheDocument()
    expect(within(mainNav).queryByRole('link', { name: 'Errands' })).not.toBeInTheDocument()
    expect(within(mainNav).queryByRole('link', { name: 'Credits' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /^Notifications/ }),
    ).not.toBeInTheDocument()
    const accountMenuButton = screen.getByLabelText('Open account menu for admin')
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: 'Friend on Campus' })).toHaveAttribute(
      'href',
      '/admin',
    )
    const accountMenu = accountMenuButton.closest('details')
    await user.click(accountMenuButton)
    expect(accountMenu).toHaveAttribute('open')
    expect(screen.getByRole('link', { name: 'Manage users' })).toHaveAttribute(
      'href',
      '/?view=users',
    )
    expect(
      screen.getByRole('button', { name: 'Switch to User' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Switch to User' }))
    await waitFor(() => expect(accountMenu).not.toHaveAttribute('open'))
  })

  it('shows a recoverable connection state if automatic setup is unavailable', async () => {
    signedIn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ detail: 'Credit Service unavailable' }, 503)),
    )

    renderApp()

    expect(
      await screen.findByRole('heading', {
        name: 'We couldn’t load your credits',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
  })

  it('clears an expired session after a 401 response', async () => {
    signedIn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({ detail: 'A valid bearer token is required' }, 401),
      ),
    )

    renderApp()

    expect(
      await screen.findByRole('heading', { name: 'Please sign in again' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(sessionStorage.getItem(sessionKey)).toBeNull()
  })
})
