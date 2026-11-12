/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-08
 * Scope (AI-07): Implemented and tested mark-as-read on notification clicks.
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-08
 * Scope (AI-08): Removed trailing full stops from alert text and updated examples and tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-09
 * Scope: Generated and refined notification provider tests.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import { NotificationProvider } from './NotificationProvider'
import { NotificationBell } from './NotificationBell'
import {
  getNotifications, getUnreadCount, markAllNotificationsRead, markNotificationRead, openNotificationStream,
} from './notification.api'
import { useNotifications } from './useNotifications'
import type { NotificationItem } from './notification.types'

vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('./notification.api', () => ({
  getNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  openNotificationStream: vi.fn(),
  notificationHistoryLimit: 20,
}))

const alice = {
  status: 'authenticated' as const,
  currentUserId: 'alice',
  currentUserType: 'Student' as const,
  signIn: vi.fn(),
  signOut: vi.fn(),
}

const item: NotificationItem = {
  id: 'first',
  type: 'ERRAND_DELIVERED',
  data: { errandId: 'errand' },
  message: 'Delivered',
  createdAt: '2026-11-08T00:00:00Z',
  readAt: null,
}

function Feed() {
  const feed = useNotifications()
  return (
    <>
      <output aria-label="unread">{feed?.unreadCount}</output>
      <ul>{feed?.items.map((notification) => <li key={notification.id}>{notification.message}</li>)}</ul>
    </>
  )
}

afterEach(() => vi.resetAllMocks())

describe('NotificationProvider', () => {
  it('merges history and live alerts by ID, and loads missed alerts on reconnect', async () => {
    vi.mocked(useAuth).mockReturnValue(alice)
    vi.mocked(openNotificationStream).mockImplementation(() => new Promise(() => {}))
    vi.mocked(getNotifications).mockResolvedValue([])
    vi.mocked(getUnreadCount).mockResolvedValue(0)
    render(<NotificationProvider><Feed /></NotificationProvider>)
    await waitFor(() => expect(openNotificationStream).toHaveBeenCalledOnce())
    const stream = vi.mocked(openNotificationStream).mock.calls[0][0]

    vi.mocked(getNotifications).mockResolvedValue([item])
    vi.mocked(getUnreadCount).mockResolvedValue(1)
    act(() => {
      stream.onConnected()
      stream.onNotification(item)
    })
    await waitFor(() => expect(screen.getByLabelText('unread')).toHaveTextContent('1'))
    expect(screen.getAllByText('Delivered')).toHaveLength(1)

    vi.mocked(getNotifications).mockResolvedValue([
      item,
      { ...item, id: 'missed', message: 'Missed while offline' },
    ])
    act(() => {
      stream.onReconnect()
      stream.onConnected()
    })
    expect(await screen.findByText('Missed while offline')).toBeInTheDocument()
    expect(openNotificationStream).toHaveBeenCalledOnce()
  })

  it('aborts requests on logout and drops data from the previous account', async () => {
    vi.mocked(useAuth).mockReturnValue(alice)
    vi.mocked(openNotificationStream).mockImplementation(() => new Promise(() => {}))
    vi.mocked(getNotifications).mockResolvedValue([item])
    vi.mocked(getUnreadCount).mockResolvedValue(1)
    const { rerender } = render(<NotificationProvider><Feed /></NotificationProvider>)
    expect(await screen.findByText('Delivered')).toBeInTheDocument()
    const previous = vi.mocked(openNotificationStream).mock.calls[0][0]
    const historySignal = vi.mocked(getNotifications).mock.calls[0][0]

    vi.mocked(useAuth).mockReturnValue({ ...alice, status: 'unauthenticated', currentUserId: null })
    rerender(<NotificationProvider><Feed /></NotificationProvider>)
    expect(previous.signal.aborted).toBe(true)
    expect(historySignal.aborted).toBe(true)
    expect(screen.queryByText('Delivered')).not.toBeInTheDocument()

    vi.mocked(useAuth).mockReturnValue({ ...alice, currentUserId: 'bob' })
    vi.mocked(getNotifications).mockResolvedValue([])
    vi.mocked(getUnreadCount).mockResolvedValue(0)
    rerender(<NotificationProvider><Feed /></NotificationProvider>)
    act(() => previous.onNotification(item))
    await waitFor(() => expect(screen.getByLabelText('unread')).toHaveTextContent('0'))
    expect(screen.queryByText('Delivered')).not.toBeInTheDocument()
  })

  it('marks an alert or the whole feed as read and reloads the server unread count', async () => {
    vi.mocked(useAuth).mockReturnValue(alice)
    vi.mocked(openNotificationStream).mockImplementation(() => new Promise(() => {}))
    let items = [item, { ...item, id: 'other', message: 'Another alert' }]
    vi.mocked(getNotifications).mockImplementation(async () => items)
    vi.mocked(getUnreadCount).mockImplementation(async () => items.filter((alert) => !alert.readAt).length)
    vi.mocked(markNotificationRead).mockImplementation(async (id) => {
      items = items.map((alert) => alert.id === id ? { ...alert, readAt: alert.createdAt } : alert)
    })
    vi.mocked(markAllNotificationsRead).mockImplementation(async () => {
      items = items.map((alert) => ({ ...alert, readAt: alert.createdAt }))
    })
    render(<MemoryRouter><NotificationProvider><NotificationBell /></NotificationProvider></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Notifications (2 unread)' }))
    expect(screen.getByRole('link', { name: 'Delivered' })).toHaveAttribute('href', '/errands/errand')
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark as read' })[0])
    expect(await screen.findByRole('button', { name: 'Notifications (1 unread)' })).toBeInTheDocument()
    expect(markNotificationRead).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(markAllNotificationsRead).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument()
  })

  it('opens the errand immediately and lets the user retry if marking it read fails', async () => {
    vi.mocked(useAuth).mockReturnValue(alice)
    vi.mocked(openNotificationStream).mockImplementation(() => new Promise(() => {}))
    vi.mocked(getNotifications).mockResolvedValue([item])
    vi.mocked(getUnreadCount).mockResolvedValue(1)
    let rejectRead!: (error: Error) => void
    vi.mocked(markNotificationRead).mockImplementationOnce(() => new Promise((_, reject) => {
      rejectRead = reject
    }))
    render(
      <MemoryRouter>
        <NotificationProvider>
          <NotificationBell />
          <Routes>
            <Route path="/" element={<h1>Dashboard</h1>} />
            <Route path="/errands/errand" element={<h1>Errand details</h1>} />
          </Routes>
        </NotificationProvider>
      </MemoryRouter>,
    )

    const bell = await screen.findByRole('button', { name: 'Notifications (1 unread)' })
    fireEvent.click(bell)
    expect(markNotificationRead).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('link', { name: 'Delivered' }))
    expect(screen.getByRole('heading', { name: 'Errand details' })).toBeInTheDocument()
    expect(bell).toHaveAttribute('aria-expanded', 'false')
    expect(markNotificationRead).toHaveBeenCalledWith(item.id, expect.any(AbortSignal))

    vi.mocked(getUnreadCount).mockRejectedValue(new Error('Request failed'))
    await act(async () => rejectRead(new Error('Request failed')))
    expect(bell).toHaveAccessibleName('Notifications (1 unread)')
    fireEvent.click(bell)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not update read status')
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeEnabled()
  })

  it.each(['completion first', 'credits first'])('groups the two errand outcomes with %s', async (order) => {
    vi.mocked(useAuth).mockReturnValue(alice)
    vi.mocked(openNotificationStream).mockImplementation(() => new Promise(() => {}))
    const completed = {
      ...item, id: 'completed', type: 'ERRAND_COMPLETED', message: 'The requester confirmed your errand is complete',
    }
    const credit = {
      ...item, id: 'credit', type: 'CREDIT_RECEIVED', message: 'You received 10 credits for your errand',
    }
    const [first, second] = order === 'completion first' ? [completed, credit] : [credit, completed]
    let items = [first]
    vi.mocked(getNotifications).mockImplementation(async () => items)
    vi.mocked(getUnreadCount).mockImplementation(async () => items.some((alert) => !alert.readAt) ? 1 : 0)
    vi.mocked(markNotificationRead).mockImplementation(async (id) => {
      items = items.map((alert) => alert.id === id ? { ...alert, readAt: alert.createdAt } : alert)
    })
    render(<MemoryRouter><NotificationProvider><NotificationBell /></NotificationProvider></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Notifications (1 unread)' }))
    const panel = within(screen.getByRole('region', { name: 'Recent notifications' }))
    expect(panel.getByRole('link', { name: first.message })).toBeInTheDocument()
    expect(panel.queryByText(second.message)).not.toBeInTheDocument()
    expect(panel.queryByText(/pending/i)).not.toBeInTheDocument()

    items = [second, first]
    const stream = vi.mocked(openNotificationStream).mock.calls[0][0]
    act(() => stream.onNotification(second))
    const grouped = await panel.findByRole('link', { name: `Errand completed ${credit.message}` })
    expect(screen.getByRole('button', { name: 'Notifications (1 unread)' })).toBeInTheDocument()
    expect(panel.getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(grouped)
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(markNotificationRead).toHaveBeenCalledWith(completed.id, expect.any(AbortSignal))
    expect(markNotificationRead).toHaveBeenCalledWith(credit.id, expect.any(AbortSignal))
  })
})
