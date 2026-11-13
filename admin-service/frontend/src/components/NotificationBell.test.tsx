import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationBell } from './NotificationBell'
import { maxBackoffMs, pollIntervalMs, unreadChangedEvent } from './useUnreadCount'

function signIn() {
  sessionStorage.setItem(
    'foc.user-session',
    JSON.stringify({
      accessToken: 'signed.jwt',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      userId: '97947588-bb2e-42f2-91ba-9abf8e15a8e7',
      username: 'mei',
      role: 'REQUESTER',
      availableRoles: ['REQUESTER', 'COURIER'],
    }),
  )
}

function respond(...answers: Array<number | Response>) {
  const fetchMock = vi.fn()
  for (const answer of answers) {
    fetchMock.mockResolvedValueOnce(
      typeof answer === 'number'
        ? new Response(JSON.stringify({ unreadCount: answer }), { status: 200 })
        : answer,
    )
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    setVisibility('visible')
  })

  // Every frontend has its own test setup; unmount here so no bell keeps polling between tests.
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows the unread count as text and links to the Notifications page', async () => {
    signIn()
    const fetchMock = respond(3)
    render(<NotificationBell />)
    await flush()

    const bell = screen.getByRole('link', { name: 'Notifications, 3 unread' })
    expect(bell).toHaveAttribute('href', '/notifications')
    expect(bell).toHaveTextContent('3')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications/me/unread-count',
      expect.objectContaining({ headers: { Authorization: 'Bearer signed.jwt' } }),
    )
  })

  it('caps the badge at 9+ and hides it when nothing is unread', async () => {
    signIn()
    respond(12, 0)
    render(<NotificationBell />)
    await flush()
    expect(screen.getByRole('link', { name: 'Notifications, 12 unread' })).toHaveTextContent('9+')

    await flush(pollIntervalMs)
    const bell = screen.getByRole('link', { name: 'Notifications, none unread' })
    expect(bell).not.toHaveTextContent(/\d/)
  })

  it('keeps the last count when a poll fails and backs off', async () => {
    signIn()
    const fetchMock = respond(4, new Response('', { status: 503 }), 5)
    render(<NotificationBell />)
    await flush()
    await flush(pollIntervalMs)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('link', { name: 'Notifications, 4 unread' })).toBeInTheDocument()

    // After a failure the next poll waits twice as long.
    await flush(pollIntervalMs)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await flush(pollIntervalMs)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('link', { name: 'Notifications, 5 unread' })).toBeInTheDocument()
  })

  it('never backs off beyond five minutes', async () => {
    signIn()
    const failure = () => new Response('', { status: 503 })
    const fetchMock = respond(...Array.from({ length: 12 }, failure))
    render(<NotificationBell />)
    await flush()
    for (let i = 0; i < 10; i++) await flush(maxBackoffMs)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(10)
  })

  it('polls only while the tab is visible and refreshes when it is shown again', async () => {
    signIn()
    const fetchMock = respond(1, 2)
    render(<NotificationBell />)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    act(() => setVisibility('hidden'))
    await flush(pollIntervalMs * 3)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    act(() => setVisibility('visible'))
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('link', { name: 'Notifications, 2 unread' })).toBeInTheDocument()
  })

  it('refreshes at once when the Notifications page marks one read', async () => {
    signIn()
    const fetchMock = respond(2, 1)
    render(<NotificationBell />)
    await flush()

    act(() => {
      window.dispatchEvent(new Event(unreadChangedEvent))
    })
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('link', { name: 'Notifications, 1 unread' })).toBeInTheDocument()
  })

  it('renders nothing and makes no request when signed out', async () => {
    const fetchMock = respond()
    render(<NotificationBell />)
    await flush(pollIntervalMs)

    expect(screen.queryByRole('link', { name: /Notifications/ })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops polling when the session is rejected', async () => {
    signIn()
    const fetchMock = respond(new Response('', { status: 401 }))
    render(<NotificationBell />)
    await flush()
    await flush(pollIntervalMs * 4)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'Notifications' })).not.toHaveTextContent(/\d/)
  })

  it('never shows the previous account’s count after a sign-out', async () => {
    signIn()
    respond(7)
    render(<NotificationBell />)
    await flush()
    expect(screen.getByRole('link', { name: 'Notifications, 7 unread' })).toBeInTheDocument()

    act(() => {
      sessionStorage.clear()
      window.dispatchEvent(new Event('foc:session-expired'))
    })
    await flush()
    expect(screen.queryByRole('link', { name: /Notifications/ })).not.toBeInTheDocument()
  })

  it('marks itself current on the Notifications page', async () => {
    signIn()
    respond(0)
    render(<NotificationBell current />)
    await flush()
    expect(screen.getByRole('link', { name: /Notifications/ })).toHaveAttribute('aria-current', 'page')
  })
})
