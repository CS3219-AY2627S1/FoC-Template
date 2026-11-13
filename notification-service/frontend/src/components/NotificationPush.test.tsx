import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationPush } from './NotificationPush'

function signIn(role = 'REQUESTER') {
  sessionStorage.setItem('foc.user-session', JSON.stringify({
    accessToken: 'signed.jwt', tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: '97947588-bb2e-42f2-91ba-9abf8e15a8e7', username: 'mei', role,
    availableRoles: ['REQUESTER', 'COURIER', 'ADMIN'],
  }))
}

async function flush(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('NotificationPush', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('bootstraps, shows a chat card, links to chat, and dismisses it after five seconds', async () => {
    signIn()
    const orderId = '3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], cursor: '2026-11-10T10:00:00Z' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: 'chat-1', type: 'CHAT_MESSAGE_RECEIVED', orderId,
          message: 'Meet me at COM 2.', occurredAt: '2026-11-10T10:00:01Z' }],
        cursor: '2026-11-10T10:00:02Z',
      })))
    vi.stubGlobal('fetch', fetchMock)

    render(<NotificationPush role="REQUESTER" />)
    await flush()
    expect(screen.queryByText('New chat message')).not.toBeInTheDocument()
    await flush(2_000)

    expect(screen.getByRole('link', { name: /Open chat/ }))
      .toHaveAttribute('href', `/errands/${orderId}/chat`)
    expect(screen.getByText('Meet me at COM 2.')).toBeInTheDocument()
    expect(screen.queryByText('Friend on Campus')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.at(1)?.[0]).toContain('/api/notifications/me/push?after=')

    await flush(5_000)
    expect(screen.queryByText('New chat message')).not.toBeInTheDocument()
  })

  it('does not show a chat notification while that same errand chat is open', async () => {
    signIn()
    const orderId = '3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64'
    window.history.replaceState({}, '', `/errands/${orderId}/chat`)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{ id: 'chat-1', type: 'CHAT_MESSAGE_RECEIVED', orderId,
        message: 'I have arrived.', occurredAt: '2026-11-10T10:00:01Z' }],
      cursor: '2026-11-10T10:00:02Z',
    }))))

    render(<NotificationPush role="REQUESTER" />)
    await flush()

    expect(screen.queryByText('New chat message')).not.toBeInTheDocument()
    expect(screen.queryByText('I have arrived.')).not.toBeInTheDocument()
  })

  it('does not poll or render in Admin mode', async () => {
    signIn('ADMIN')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<NotificationPush role="ADMIN" />)
    await flush(10_000)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Recent updates' })).not.toBeInTheDocument()
  })
})
