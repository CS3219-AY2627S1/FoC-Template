/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Component tests for the open-errands and my-errands lists, including accepting from
 *        the board and losing the race for an errand.
 * Author review: Reviewed and approved by @mattis.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError } from '../api/client'
import * as errandApi from '../api/errandApi'
import { AuthContext, type AuthApi } from '../auth/authContext'
import { MyErrandsPage } from './MyErrandsPage'
import { OpenErrandsPage } from './OpenErrandsPage'
import { makeErrand, pageOf } from './testFixtures'

vi.mock('../api/errandApi', () => ({ listOpenErrands: vi.fn(), listMyErrands: vi.fn(), runErrandAction: vi.fn() }))

const memberAuth: AuthApi = {
  status: 'loggedIn',
  user: { username: 'member_one', displayName: 'Member One', role: 'MEMBER' },
  notice: null,
  login: vi.fn(),
  logout: vi.fn(),
}

describe('Open errands', () => {
  it('lists errands with their route, reward and link to the detail', async () => {
    const errand = makeErrand()
    vi.mocked(errandApi.listOpenErrands).mockResolvedValue(pageOf([errand], { totalItems: 45 }))
    renderAt('/errands')

    const link = await screen.findByRole('link', { name: /Overnight Coffee/ })
    expect(link).toHaveAttribute('href', `/errands/${errand.id}`)
    expect(link).toHaveTextContent('15 credits')
    expect(link).toHaveTextContent('3 items')
    expect(link).toHaveTextContent('2 × Iced latte, Croissant')
    expect(link).toHaveTextContent('COM1 level 2 study area')
    expect(screen.getByText(/Page/)).toHaveTextContent('Page 1 of 3 · 45 errands')
  })

  it('takes an errand off the board when another courier accepted it first', async () => {
    const lost = makeErrand()
    const other = makeErrand({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', supplierName: 'Print Hub' })
    vi.mocked(errandApi.listOpenErrands)
      .mockResolvedValueOnce(pageOf([lost, other]))
      // The reload is still in flight: the card must already be gone without it
      .mockReturnValue(new Promise(() => {}))
    vi.mocked(errandApi.runErrandAction).mockRejectedValue(
      new ApiError(409, 'ERRAND_NO_LONGER_AVAILABLE', 'This errand is no longer available', {}, { currentState: 'ACCEPTED' }),
    )
    const user = userEvent.setup()
    renderAt('/errands')

    await user.click(await screen.findByRole('button', { name: 'Accept errand from Overnight Coffee' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Accept this errand?' })
    await user.click(within(dialog).getByRole('button', { name: 'Accept errand' }))

    expect(errandApi.runErrandAction).toHaveBeenCalledWith(lost.id, 'accept')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This errand is no longer available')
    expect(alert).toHaveTextContent('Another courier accepted it first')
    expect(alert).toHaveTextContent('It has been taken off the list.')
    expect(screen.queryByRole('link', { name: /Overnight Coffee/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Print Hub/ })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(errandApi.listOpenErrands).toHaveBeenCalledTimes(2)
  })

  it('accepts from the board and links to the accepted errand', async () => {
    const errand = makeErrand()
    vi.mocked(errandApi.listOpenErrands).mockResolvedValueOnce(pageOf([errand])).mockResolvedValue(pageOf([]))
    vi.mocked(errandApi.runErrandAction).mockResolvedValue(makeErrand({ state: 'ACCEPTED' }))
    const user = userEvent.setup()
    renderAt('/errands')

    await user.click(await screen.findByRole('button', { name: 'Accept errand from Overnight Coffee' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Accept errand' }))

    expect(await screen.findByRole('status')).toHaveTextContent('You accepted the errand.')
    expect(screen.getByRole('link', { name: 'View the Overnight Coffee errand' })).toHaveAttribute('href', `/errands/${errand.id}`)
    expect(screen.queryByRole('button', { name: /Accept errand from/ })).not.toBeInTheDocument()
  })

  it('keeps the errand listed when the accept fails for another reason', async () => {
    vi.mocked(errandApi.listOpenErrands).mockResolvedValue(pageOf([makeErrand()]))
    vi.mocked(errandApi.runErrandAction).mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Unavailable'))
    const user = userEvent.setup()
    renderAt('/errands')

    await user.click(await screen.findByRole('button', { name: 'Accept errand from Overnight Coffee' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Accept errand' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Errands are temporarily unavailable')
    expect(screen.getByRole('button', { name: 'Accept errand from Overnight Coffee' })).toBeEnabled()
    expect(errandApi.listOpenErrands).toHaveBeenCalledTimes(1)
  })

  it('moves through pages via the URL', async () => {
    vi.mocked(errandApi.listOpenErrands).mockResolvedValue(pageOf([makeErrand()], { totalItems: 45 }))
    const user = userEvent.setup()
    renderAt('/errands')

    await user.click(await screen.findByRole('button', { name: 'Next' }))
    expect(errandApi.listOpenErrands).toHaveBeenLastCalledWith({ page: 1, size: 20 }, expect.any(AbortSignal))
  })

  it('shows an empty state and a retryable error', async () => {
    vi.mocked(errandApi.listOpenErrands)
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce(pageOf([]))
    const user = userEvent.setup()
    renderAt('/errands')

    expect(await screen.findByRole('heading', { name: "We couldn't reach the server" })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'No open errands right now' })).toBeInTheDocument()
  })
})

describe('My errands', () => {
  it('switches between requested and delivering, and filters by state', async () => {
    vi.mocked(errandApi.listMyErrands).mockResolvedValue(pageOf([makeErrand({ state: 'DELIVERED' })]))
    const user = userEvent.setup()
    renderAt('/errands/mine')

    expect(await screen.findByText('Delivered')).toBeInTheDocument()
    expect(errandApi.listMyErrands).toHaveBeenLastCalledWith(
      { as: 'requester', state: undefined, page: 0, size: 20 },
      expect.any(AbortSignal),
    )

    await user.click(screen.getByRole('button', { name: 'Delivering' }))
    expect(screen.getByRole('button', { name: 'Delivering' })).toHaveAttribute('aria-pressed', 'true')
    expect(errandApi.listMyErrands).toHaveBeenLastCalledWith(
      { as: 'courier', state: undefined, page: 0, size: 20 },
      expect.any(AbortSignal),
    )

    await user.selectOptions(screen.getByLabelText('State'), 'PICKED_UP')
    expect(errandApi.listMyErrands).toHaveBeenLastCalledWith(
      { as: 'courier', state: 'PICKED_UP', page: 0, size: 20 },
      expect.any(AbortSignal),
    )
  })

  it('points a member with nothing to deliver at the open list', async () => {
    vi.mocked(errandApi.listMyErrands).mockResolvedValue(pageOf([]))
    renderAt('/errands/mine?as=courier')

    expect(await screen.findByText(/You aren't delivering any errands/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse open errands' })).toHaveAttribute('href', '/errands')
  })
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={memberAuth}>
        <Routes>
          <Route path="/errands" element={<OpenErrandsPage />} />
          <Route path="/errands/mine" element={<MyErrandsPage />} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
