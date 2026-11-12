/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-07
 * Scope (AI-17): Wired and tested the existing pickup and receipt actions.
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-22
 * Scope (AI-20): Built and tested the errand details preview with manual refresh.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-09
 * Scope: Updated tests for opening Chat Service conversations.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMockErrandDetails } from '../features/errands/errand-details.mock'
import {
  cancelErrand,
  completeErrand,
  deliverErrand,
  ErrandApiError,
  failErrand,
} from '../features/errands/errand.api'
import { loadErrandDetails } from '../features/errands/errand.view'
import { NotificationContext, type NotificationContextValue } from '../features/notifications/notification.context'
import type { NotificationListener } from '../features/notifications/notification.types'
import { ErrandDetailsPage } from './ErrandDetailsPage'

const requesterAcceptedId = '2fdf7658-f477-4a52-94ed-cbbf2447e005'
const courierAcceptedId = '6376fe09-c727-43df-b59c-56cc7e0c7de8'
const requesterOpenId = '54a639e7-98f6-4254-8ac3-3a7f1e003bf9'

vi.mock('../features/errands/errand.view', () => ({ loadErrandDetails: vi.fn() }))
vi.mock('../features/errands/errand.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/errands/errand.api')>()),
  cancelErrand: vi.fn(),
  completeErrand: vi.fn(),
  deliverErrand: vi.fn(),
  failErrand: vi.fn(),
}))
const refreshBalance = vi.fn()
vi.mock('../features/credits/useCredits', () => ({
  useCredits: () => ({ refreshBalance }),
}))
vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({
    status: 'authenticated',
    currentUserId: '11111111-1111-4111-8111-111111111111',
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}))

const loadErrandDetailsMock = vi.mocked(loadErrandDetails)
const cancelErrandMock = vi.mocked(cancelErrand)
const completeErrandMock = vi.mocked(completeErrand)
const deliverErrandMock = vi.mocked(deliverErrand)
const failErrandMock = vi.mocked(failErrand)

function activeErrand(errandId: string) {
  return { ...getMockErrandDetails(errandId)!, expiresAt: new Date(Date.now() + 60_000).toISOString() }
}

function renderPage(errandId: string, notifications: NotificationContextValue | null = null) {
  return render(
    <NotificationContext.Provider value={notifications}>
      <MemoryRouter initialEntries={[`/errands/${errandId}`]}>
        <Routes>
          <Route path="/errands/:errandId" element={<ErrandDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </NotificationContext.Provider>,
  )
}

describe('ErrandDetailsPage', () => {
  beforeEach(() => {
    loadErrandDetailsMock.mockReset()
    cancelErrandMock.mockReset()
    completeErrandMock.mockReset()
    deliverErrandMock.mockReset().mockResolvedValue(undefined)
    failErrandMock.mockReset()
    refreshBalance.mockReset().mockResolvedValue(undefined)
    cancelErrandMock.mockResolvedValue({
      id: requesterOpenId,
      status: 'CANCELLED',
      cancelled_at: '2026-10-22T04:00:00.000Z',
    })
    completeErrandMock.mockResolvedValue({
      id: requesterAcceptedId,
      status: 'COMPLETED',
      completed_at: '2026-10-22T04:00:00.000Z',
    })
    failErrandMock.mockResolvedValue({
      id: requesterAcceptedId,
      status: 'FAILED',
      failed_at: '2026-10-22T04:00:00.000Z',
      failure_reason: 'The requested item was unavailable.',
    })
    loadErrandDetailsMock.mockImplementation(async (errandId) => {
      if (!getMockErrandDetails(errandId)) throw new ErrandApiError('Errand not found.', 404)
      return activeErrand(errandId)
    })
  })

  it('renders service-backed delivery information', async () => {
    renderPage(requesterAcceptedId)
    expect(
      await screen.findByRole('heading', { name: 'Print and bind project report' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Central Library Print Centre · Central Library, Level 5')).toBeInTheDocument()
    expect(screen.getByText('COM3, Level 2')).toBeInTheDocument()
    expect(screen.getByText('Jordan Tan')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Back to My errands' })).toHaveAttribute('href', '/my-errands')
  })

  it('has the requester wait for pickup after a courier accepts', async () => {
    renderPage(requesterAcceptedId)
    expect(await screen.findByRole('heading', { name: 'Courier assigned' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm receipt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Report problem' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel errand' })).not.toBeInTheDocument()
  })

  it('refetches the errand status when its expiry alert arrives', async () => {
    const open = activeErrand(requesterOpenId)
    loadErrandDetailsMock.mockResolvedValueOnce(open).mockResolvedValueOnce({
      ...open, status: 'EXPIRED',
    })
    let notify!: NotificationListener
    renderPage(requesterOpenId, {
      items: [], unreadCount: 0, historyStatus: 'ready', connection: 'connected',
      refresh: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), hide: vi.fn(),
      subscribe(listener) { notify = listener; return vi.fn() },
    })
    expect(await screen.findByRole('button', { name: 'Cancel errand' })).toBeInTheDocument()

    act(() => notify({
      type: 'notification',
      item: {
        id: 'expired', type: 'ERRAND_EXPIRED', data: { errandId: requesterOpenId },
        message: 'Your errand expired before anyone accepted it',
        createdAt: '2026-11-08T00:00:00Z', readAt: null,
      },
    }))

    expect(await screen.findByRole('heading', { name: 'Expired' })).toBeInTheDocument()
    expect(loadErrandDetailsMock).toHaveBeenCalledTimes(2)
  })

  it('refetches the visible errand on its alert and ignores an older response after reconnect', async () => {
    const accepted = activeErrand(requesterAcceptedId)
    let resolveOlder!: (details: typeof accepted) => void
    loadErrandDetailsMock
      .mockResolvedValueOnce(accepted)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOlder = resolve }))
      .mockResolvedValueOnce({
        ...accepted, status: 'COMPLETED', completedAt: '2026-11-08T00:00:00Z',
      })
    let notify!: NotificationListener
    renderPage(requesterAcceptedId, {
      items: [], unreadCount: 0, historyStatus: 'ready', connection: 'connected',
      refresh: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), hide: vi.fn(),
      subscribe(listener) { notify = listener; return vi.fn() },
    })
    expect(await screen.findByRole('heading', { name: 'Courier assigned' })).toBeInTheDocument()

    const item = {
      id: 'delivered', type: 'ERRAND_DELIVERED', data: { errandId: courierAcceptedId },
      message: 'Delivered', createdAt: '2026-11-08T00:00:00Z', readAt: null,
    }
    act(() => notify({ type: 'notification', item }))
    expect(loadErrandDetailsMock).toHaveBeenCalledOnce()

    act(() => notify({ type: 'notification', item: { ...item, data: { errandId: requesterAcceptedId } } }))
    expect(loadErrandDetailsMock).toHaveBeenCalledTimes(2)
    const olderSignal = loadErrandDetailsMock.mock.calls[1][2]
    act(() => notify({ type: 'connected' }))
    expect(await screen.findByRole('heading', { name: 'Completed' })).toBeInTheDocument()
    expect(olderSignal?.aborted).toBe(true)
    await act(async () => { resolveOlder(accepted) })
    expect(screen.getByRole('heading', { name: 'Completed' })).toBeInTheDocument()
  })

  it('lets the assigned courier mark an accepted errand ready for pickup', async () => {
    const acceptedErrand = activeErrand(courierAcceptedId)
    loadErrandDetailsMock.mockResolvedValueOnce(acceptedErrand).mockResolvedValueOnce({
      ...acceptedErrand,
      status: 'DELIVERED',
      deliveredAt: '2026-10-22T04:00:00.000Z',
    })
    renderPage(courierAcceptedId)
    fireEvent.click(await screen.findByRole('button', { name: 'Mark ready for pickup' }))
    const dialog = screen.getByRole('dialog', { name: 'Mark this errand ready for pickup?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark ready for pickup' }))

    expect(await screen.findByRole('heading', { name: 'Awaiting requester confirmation' })).toBeInTheDocument()
    expect(deliverErrandMock).toHaveBeenCalledWith(courierAcceptedId, expect.any(AbortSignal))
    expect(screen.queryByRole('button', { name: 'Mark ready for pickup' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm receipt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Report problem' })).not.toBeInTheDocument()
  })

  it('cancels an open errand and reloads its details', async () => {
    const openErrand = activeErrand(requesterOpenId)
    loadErrandDetailsMock.mockResolvedValueOnce(openErrand).mockResolvedValueOnce({
      ...openErrand,
      status: 'CANCELLED',
      cancelledAt: '2026-10-22T04:00:00.000Z',
    })
    renderPage(requesterOpenId)

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel errand' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel this errand?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel errand' }))

    await waitFor(() =>
      expect(cancelErrandMock).toHaveBeenCalledWith(requesterOpenId, expect.any(AbortSignal)),
    )
    expect(await screen.findByRole('heading', { name: 'Cancelled' })).toBeInTheDocument()
    expect(refreshBalance).toHaveBeenCalledTimes(1)
  })

  it('requires and submits a failure reason before reloading', async () => {
    const deliveredErrand = { ...activeErrand(requesterAcceptedId), status: 'DELIVERED' as const }
    loadErrandDetailsMock.mockResolvedValueOnce(deliveredErrand).mockResolvedValueOnce({
      ...deliveredErrand,
      status: 'FAILED',
      failedAt: '2026-10-22T04:00:00.000Z',
      failureReason: 'The requested item was unavailable.',
    })
    renderPage(requesterAcceptedId)

    fireEvent.click(await screen.findByRole('button', { name: 'Report problem' }))
    const dialog = screen.getByRole('dialog', { name: 'Report a problem' })
    const submitButton = within(dialog).getByRole('button', { name: 'Report problem' })
    fireEvent.click(submitButton)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a reason for reporting this errand.')
    fireEvent.change(within(dialog).getByLabelText(/What went wrong/), {
      target: { value: 'The requested item was unavailable.' },
    })
    fireEvent.click(submitButton)

    await waitFor(() =>
      expect(failErrandMock).toHaveBeenCalledWith(
        requesterAcceptedId,
        'The requested item was unavailable.',
        expect.any(AbortSignal),
      ),
    )
    expect(await screen.findByRole('heading', { name: 'Failed' })).toBeInTheDocument()
    expect(refreshBalance).toHaveBeenCalledTimes(1)
  })

  it('refreshes and explains when a courier accepts before cancellation', async () => {
    const openErrand = activeErrand(requesterOpenId)
    loadErrandDetailsMock.mockResolvedValueOnce(openErrand).mockResolvedValueOnce({
      ...openErrand,
      status: 'ACCEPTED',
      courierName: 'Assigned courier',
    })
    cancelErrandMock.mockRejectedValue(new ErrandApiError('Errand state prevents cancellation', 409))
    renderPage(requesterOpenId)

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel errand' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel this errand?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel errand' }))

    expect(await screen.findByRole('heading', { name: 'Courier assigned' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('A courier accepted this errand before it could be cancelled.')
    expect(screen.queryByRole('button', { name: 'Cancel errand' })).not.toBeInTheDocument()
    expect(refreshBalance).not.toHaveBeenCalled()
  })

  it('confirms receipt after the courier handoff', async () => {
    const deliveredErrand = { ...activeErrand(requesterAcceptedId), status: 'DELIVERED' as const }
    loadErrandDetailsMock.mockResolvedValueOnce(deliveredErrand).mockResolvedValueOnce({
      ...deliveredErrand,
      status: 'COMPLETED',
      completedAt: '2026-10-22T04:00:00.000Z',
    })
    renderPage(requesterAcceptedId)

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm receipt' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirm receipt?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm receipt' }))

    expect(await screen.findByRole('heading', { name: 'Completed' })).toBeInTheDocument()
    expect(completeErrandMock).toHaveBeenCalledWith(requesterAcceptedId, expect.any(AbortSignal))
  })

  it('keeps the dialog open after a retryable service error', async () => {
    loadErrandDetailsMock.mockResolvedValueOnce({ ...activeErrand(requesterAcceptedId), status: 'DELIVERED' })
    completeErrandMock.mockRejectedValue(new ErrandApiError('Credit service unavailable', 503))
    renderPage(requesterAcceptedId)

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm receipt' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirm receipt?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm receipt' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Credit service unavailable')
    expect(dialog).toBeInTheDocument()
  })

  it('hides requester actions once the delivered errand deadline has passed', async () => {
    loadErrandDetailsMock.mockResolvedValueOnce({
      ...activeErrand(requesterAcceptedId),
      status: 'DELIVERED',
      expiresAt: '2026-10-22T12:00:00.000Z',
    })
    renderPage(requesterAcceptedId)

    expect(await screen.findByText('The errand deadline has passed.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm receipt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Report problem' })).not.toBeInTheDocument()
  })

  it('manually refreshes the current errand', async () => {
    renderPage(requesterAcceptedId)
    await screen.findByRole('heading', { name: 'Print and bind project report' })
    fireEvent.click(screen.getByRole('button', { name: '↻ Refresh' }))
    await waitFor(() => expect(loadErrandDetailsMock).toHaveBeenCalledTimes(2))
  })

  it('shows terminal errands without mutation actions', async () => {
    renderPage('completed-errand')
    expect(await screen.findByRole('heading', { name: 'Completed' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm receipt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Report problem' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel errand' })).not.toBeInTheDocument()
  })

  it('shows a not-found state for an unknown errand', async () => {
    renderPage('missing-errand')
    expect(await screen.findByRole('heading', { name: 'Errand not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to My errands' })).toHaveAttribute('href', '/my-errands')
  })
})
