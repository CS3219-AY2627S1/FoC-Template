/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Tests for the Stage 23c expiry warning banner (per instructions.md Stage 23c's Tests
 *        section): no banner right after a fresh login/session restore, the banner appearing
 *        once the 10-minute lead time is crossed (both by advancing fake timers past it and by
 *        starting already inside it), "Log in again" calling logout, the deadline not carrying
 *        over to the next login, and the refresh-after-401 path also updating the deadline. The
 *        network layer (fetch) is mocked directly rather than the api/* modules, per the
 *        stage's "mock the network layer" instruction, since the behaviour under test is how
 *        AuthContext reacts to the raw POST /auth/login and /auth/refresh response shapes
 *        introduced in stage 23b. Each test gets a fresh module registry (vi.resetModules) so
 *        http.js's module-level accessToken/timer state from one test cannot leak into the
 *        next. socket.io-client's order-socket connection (unrelated to this stage) is mocked
 *        out. Not covered here, as needing a real browser/multiple tabs: the device-clock-change
 *        and two-open-tabs verification bullets (performance.now() being clock-independent, and
 *        each tab owning its own module registry, are both true by construction/inspection, not
 *        by fake-timer simulation); the proactive-refresh trigger is not separately tested since
 *        it shares the exact refreshAccessToken() code path already exercised by the
 *        session-restore and refresh-after-401 tests below.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 27c of instructions.md - added a "Stage 27c: elevation token" describe block:
 *        logout() (triggered via the existing "Log in again" banner button) and forceReauth()
 *        (via a new ForceReauthTrigger probe button, the same pattern as LoginTrigger) both
 *        clear a stored elevation token, per the stage's "logout and forced logout remove the
 *        stored token" rule.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearElevationToken, getElevationToken, setElevationToken } from '../../src/utils/elevation'

vi.mock('../../src/realtime/orderSocket', () => ({
  connectOrderSocket: vi.fn(),
  disconnectOrderSocket: vi.fn(),
}))

const PROFILE = { username: 'alice', email: 'alice@example.com', activeView: 'requester' }

function makeToken(claims) {
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `header.${payload}.signature`
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return Promise.resolve({
    ok,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  })
}

// Routes the fake fetch layer: each respond() call queues one response for the next matching
// request, so a route can be made to answer differently across repeated calls (e.g. refresh).
function createFetchMock() {
  const queues = new Map()
  const keyOf = (method, url) => `${method.toUpperCase()} ${url}`
  const fetchMock = vi.fn((url, options = {}) => {
    const k = keyOf(options.method || 'GET', url)
    const queue = queues.get(k)
    if (!queue || queue.length === 0) {
      return Promise.reject(new Error('Unhandled fetch in test: ' + k))
    }
    const next = queue.shift()
    return typeof next === 'function' ? next() : next
  })
  fetchMock.respond = (method, url, response) => {
    const k = keyOf(method, url)
    const queue = queues.get(k) ?? []
    queue.push(response)
    queues.set(k, queue)
  }
  return fetchMock
}

async function loadAuthModules() {
  vi.resetModules()
  const { AuthProvider, useAuth } = await import('../../src/context/AuthContext')
  const SessionExpiryBanner = (await import('../../src/components/SessionExpiryBanner')).default
  return { AuthProvider, useAuth, SessionExpiryBanner }
}

function Probe({ useAuth }) {
  const { isLoggedIn, sessionExpiringSoon } = useAuth()
  return <div data-testid="probe">{(isLoggedIn ? 'in' : 'out') + ':' + (sessionExpiringSoon ? 'warn' : 'ok')}</div>
}

// Drives AuthContext.login() from a test, the same way Login.jsx would.
function LoginTrigger({ useAuth }) {
  const { login } = useAuth()
  return (
    <button type="button" onClick={() => login('alice', 'password')}>
      do-login
    </button>
  )
}

// Drives AuthContext.forceReauth() from a test, the same way Account.jsx would after a
// successful password change.
function ForceReauthTrigger({ useAuth }) {
  const { forceReauth } = useAuth()
  return (
    <button type="button" onClick={() => forceReauth('Password changed. Please log in again.')}>
      do-force-reauth
    </button>
  )
}

function renderApp({ AuthProvider, useAuth, SessionExpiryBanner }) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Probe useAuth={useAuth} />
        <LoginTrigger useAuth={useAuth} />
        <ForceReauthTrigger useAuth={useAuth} />
        <SessionExpiryBanner />
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Session expiry banner (Stage 23c)', () => {
  it('shows no banner after session restore with a 30-day-away deadline', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.respond(
      'POST',
      '/auth/refresh',
      jsonResponse({ accessToken: makeToken({ sub: 'u1', role: 'user' }), sessionTimeLeftSeconds: 30 * 24 * 60 * 60 }),
    )
    fetchMock.respond('GET', '/users/me', jsonResponse(PROFILE))

    const mods = await loadAuthModules()
    renderApp(mods)

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('in:ok'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('restoring with a 15-minute deadline shows no banner, then shows one once 5 minutes pass', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.respond(
      'POST',
      '/auth/refresh',
      jsonResponse({ accessToken: makeToken({ sub: 'u1', role: 'user' }), sessionTimeLeftSeconds: 15 * 60 }),
    )
    fetchMock.respond('GET', '/users/me', jsonResponse(PROFILE))

    const mods = await loadAuthModules()
    renderApp(mods)

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('in:ok'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

    expect(screen.getByTestId('probe')).toHaveTextContent('in:warn')
    expect(screen.getByRole('status')).toHaveTextContent('Your session will end soon. Log in again to keep working.')
  })

  it('restoring with a 5-minute deadline shows the banner immediately', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.respond(
      'POST',
      '/auth/refresh',
      jsonResponse({ accessToken: makeToken({ sub: 'u1', role: 'user' }), sessionTimeLeftSeconds: 5 * 60 }),
    )
    fetchMock.respond('GET', '/users/me', jsonResponse(PROFILE))

    const mods = await loadAuthModules()
    renderApp(mods)

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('in:warn'))
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('the banner has no dismiss control', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.respond(
      'POST',
      '/auth/refresh',
      jsonResponse({ accessToken: makeToken({ sub: 'u1', role: 'user' }), sessionTimeLeftSeconds: 5 * 60 }),
    )
    fetchMock.respond('GET', '/users/me', jsonResponse(PROFILE))

    const mods = await loadAuthModules()
    renderApp(mods)

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    const banner = screen.getByRole('status')
    expect(banner.querySelector('button[aria-label*="lose" i], button[aria-label*="ismiss" i]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Log in again' })).toBeInTheDocument()
  })

  it('"Log in again" logs the user out and the banner then disappears', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.respond(
      'POST',
      '/auth/refresh',
      jsonResponse({ accessToken: makeToken({ sub: 'u1', role: 'user' }), sessionTimeLeftSeconds: 5 * 60 }),
    )
    fetchMock.respond('GET', '/users/me', jsonResponse(PROFILE))
    fetchMock.respond('POST', '/auth/logout', jsonResponse({}))

    const mods = await loadAuthModules()
    renderApp(mods)

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Log in again' }))

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('out:ok'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not carry the deadline over to the next login after logging out', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    // Session restore finds nothing (no refresh cookie yet).
    fetchMock.respond('POST', '/auth/refresh', jsonResponse({ message: 'no session' }, { ok: false, status: 401 }))

    const mods = await loadAuthModules()
    renderApp(mods)
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('out:ok'))

    // Log in with a deadline already inside the warning window.
    fetchMock.respond(
      'POST',
      '/auth/login',
      jsonResponse({
        accessToken: makeToken({ sub: 'u1', role: 'user' }),
        user: { id: 'u1', username: 'alice', role: 'user' },
        sessionTimeLeftSeconds: 5 * 60,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'do-login' }))
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('in:warn'))
    expect(screen.getByRole('status')).toBeInTheDocument()

    // Log out, then log back in with a fresh 30-day deadline.
    fetchMock.respond('POST', '/auth/logout', jsonResponse({}))
    fireEvent.click(screen.getByRole('button', { name: 'Log in again' }))
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('out:ok'))

    fetchMock.respond(
      'POST',
      '/auth/login',
      jsonResponse({
        accessToken: makeToken({ sub: 'u1', role: 'user' }),
        user: { id: 'u1', username: 'alice', role: 'user' },
        sessionTimeLeftSeconds: 30 * 24 * 60 * 60,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'do-login' }))

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('in:ok'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('a refresh-after-401 response also updates the deadline and can trigger the banner', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.respond(
      'POST',
      '/auth/refresh',
      jsonResponse({ accessToken: makeToken({ sub: 'u1', role: 'user' }), sessionTimeLeftSeconds: 30 * 24 * 60 * 60 }),
    )
    fetchMock.respond('GET', '/users/me', jsonResponse(PROFILE))

    const mods = await loadAuthModules()
    renderApp(mods)
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('in:ok'))

    const { request } = await import('../../src/api/http')
    fetchMock.respond('GET', '/some/protected', jsonResponse({ message: 'expired' }, { ok: false, status: 401 }))
    fetchMock.respond(
      'POST',
      '/auth/refresh',
      jsonResponse({ accessToken: makeToken({ sub: 'u1', role: 'user' }), sessionTimeLeftSeconds: 5 * 60 }),
    )
    fetchMock.respond('GET', '/some/protected', jsonResponse({ ok: true }))

    await request('/some/protected')

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('in:warn'))
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('Stage 27c: elevation token cleared on logout/forced logout', () => {
  afterEach(() => {
    clearElevationToken()
  })

  it('logout() clears a stored elevation token', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.respond(
      'POST',
      '/auth/refresh',
      jsonResponse({ accessToken: makeToken({ sub: 'u1', role: 'user' }), sessionTimeLeftSeconds: 5 * 60 }),
    )
    fetchMock.respond('GET', '/users/me', jsonResponse(PROFILE))
    fetchMock.respond('POST', '/auth/logout', jsonResponse({}))

    const mods = await loadAuthModules()
    renderApp(mods)
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())

    setElevationToken(makeToken({ exp: Math.floor(Date.now() / 1000) + 900 }))
    fireEvent.click(screen.getByRole('button', { name: 'Log in again' }))

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('out:ok'))
    expect(getElevationToken()).toBeNull()
  })

  it('forceReauth() clears a stored elevation token', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.respond(
      'POST',
      '/auth/refresh',
      jsonResponse({ accessToken: makeToken({ sub: 'u1', role: 'user' }), sessionTimeLeftSeconds: 30 * 24 * 60 * 60 }),
    )
    fetchMock.respond('GET', '/users/me', jsonResponse(PROFILE))

    const mods = await loadAuthModules()
    renderApp(mods)
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('in:ok'))

    setElevationToken(makeToken({ exp: Math.floor(Date.now() / 1000) + 900 }))
    fireEvent.click(screen.getByRole('button', { name: 'do-force-reauth' }))

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('out:ok'))
    expect(getElevationToken()).toBeNull()
  })
})
