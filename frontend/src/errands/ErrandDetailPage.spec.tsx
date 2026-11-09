/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Component tests for the errand detail page: actions by part, confirmations, error
 *        recovery and reservation polling.
 * Author review: Reviewed and approved by @mattis.
 */
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import * as errandApi from '../api/errandApi'
import { AuthContext, type AuthApi } from '../auth/authContext'
import { clearToken, saveToken } from '../auth/tokenStorage'
import { ErrandDetailPage, RESERVATION_POLL_MS } from './ErrandDetailPage'
import { COURIER_ID, OTHER_ID, REQUESTER_ID, makeErrand, tokenFor } from './testFixtures'

vi.mock('../api/errandApi', () => ({ getErrand: vi.fn(), runErrandAction: vi.fn() }))

const memberAuth: AuthApi = {
  status: 'loggedIn',
  user: { username: 'member_one', displayName: 'Member One', role: 'MEMBER' },
  notice: null,
  login: vi.fn(),
  logout: vi.fn(),
}

describe('Errand detail', () => {
  beforeEach(() => clearToken())
  afterEach(() => vi.useRealTimers())

  it('lets another member accept an open errand after confirming', async () => {
    saveToken(tokenFor(OTHER_ID))
    const open = makeErrand()
    const accepted = makeErrand({ state: 'ACCEPTED', courierId: OTHER_ID })
    vi.mocked(errandApi.getErrand).mockResolvedValueOnce(open).mockResolvedValue(accepted)
    vi.mocked(errandApi.runErrandAction).mockResolvedValue(accepted)
    const user = userEvent.setup()
    renderDetail(open.id)

    expect(await screen.findByRole('heading', { name: 'Overnight Coffee' })).toBeInTheDocument()
    expect(screen.getByText('Iced latte')).toBeInTheDocument()
    expect(screen.getByText('Less ice please')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel errand' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Accept errand' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Accept this errand?' })
    await user.click(within(dialog).getByRole('button', { name: 'Accept errand' }))

    expect(errandApi.runErrandAction).toHaveBeenCalledWith(open.id, 'accept', undefined)
    expect(await screen.findByRole('status')).toHaveTextContent('You accepted the errand.')
    expect(await screen.findByText("You're the courier")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark as picked up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument()
  })

  it('explains a lost accept race and shows the errand as it now is', async () => {
    saveToken(tokenFor(OTHER_ID))
    const open = makeErrand()
    vi.mocked(errandApi.getErrand)
      .mockResolvedValueOnce(open)
      .mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Not found'))
    vi.mocked(errandApi.runErrandAction).mockRejectedValue(
      new ApiError(409, 'ERRAND_NO_LONGER_AVAILABLE', 'This errand is no longer available', {}, { currentState: 'ACCEPTED' }),
    )
    const user = userEvent.setup()
    renderDetail(open.id)

    await user.click(await screen.findByRole('button', { name: 'Accept errand' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Accept errand' }))

    expect(await screen.findByText('This errand is no longer available')).toBeInTheDocument()
    expect(screen.getByText(/Another courier accepted it first/)).toBeInTheDocument()
    // The page re-read the errand; now that it is not OPEN, this member may no longer see it
    expect(errandApi.getErrand).toHaveBeenCalledTimes(2)
  })

  it('lets the requester report a problem with an optional reason', async () => {
    saveToken(tokenFor(REQUESTER_ID))
    const delivered = makeErrand({
      state: 'DELIVERED',
      courierId: COURIER_ID,
      confirmDeadline: new Date(Date.now() + 3_600_000).toISOString(),
    })
    vi.mocked(errandApi.getErrand).mockResolvedValueOnce(delivered).mockResolvedValue(makeErrand({ ...delivered, state: 'DISPUTED' }))
    vi.mocked(errandApi.runErrandAction).mockResolvedValue(delivered)
    const user = userEvent.setup()
    renderDetail(delivered.id)

    expect(await screen.findByText('You requested this')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm received' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Report a problem' }))
    await user.type(screen.getByLabelText(/What went wrong/), '  Wrong drink  ')
    await user.click(screen.getByRole('button', { name: 'Report problem' }))

    expect(errandApi.runErrandAction).toHaveBeenCalledWith(delivered.id, 'reject', 'Wrong drink')
    expect(await screen.findByText(/An administrator will review this errand and decide/)).toBeInTheDocument()
  })

  it('shows no actions to the requester while the courier is delivering', async () => {
    saveToken(tokenFor(REQUESTER_ID))
    vi.mocked(errandApi.getErrand).mockResolvedValue(makeErrand({ state: 'PICKED_UP', courierId: COURIER_ID }))
    renderDetail('id')

    expect(await screen.findByText(/On its way/)).toBeInTheDocument()
    for (const name of ['Accept errand', 'Cancel errand', 'Mark as delivered', 'Confirm received']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('keeps re-reading the errand while credits are being reserved, then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    saveToken(tokenFor(REQUESTER_ID))
    vi.mocked(errandApi.getErrand)
      .mockResolvedValueOnce(makeErrand({ state: 'PENDING_RESERVATION' }))
      .mockResolvedValueOnce(makeErrand({ state: 'PENDING_RESERVATION' }))
      .mockResolvedValue(makeErrand({ state: 'RESERVATION_REJECTED', rejectionReason: 'INSUFFICIENT_CREDIT' }))
    renderDetail('id')

    expect(await screen.findByText(/Reserving 15 credits/)).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(RESERVATION_POLL_MS))
    await act(() => vi.advanceTimersByTimeAsync(RESERVATION_POLL_MS))
    expect(await screen.findByText(/you don't have enough available credits/)).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(RESERVATION_POLL_MS * 3))
    expect(errandApi.getErrand).toHaveBeenCalledTimes(3)
  })

  it('treats an errand the member may not see as not found, and can retry', async () => {
    saveToken(tokenFor(OTHER_ID))
    vi.mocked(errandApi.getErrand)
      .mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'Not found'))
      .mockResolvedValueOnce(makeErrand())
    const user = userEvent.setup()
    renderDetail('id')

    expect(await screen.findByRole('heading', { name: 'Errand not found' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Overnight Coffee' })).toBeInTheDocument()
  })
})

function renderDetail(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/errands/${id}`]}>
      <AuthContext.Provider value={memberAuth}>
        <Routes>
          <Route path="/errands/:id" element={<ErrandDetailPage />} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
