/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Tests for the account-review pages (N2H1b): opening from the account page, the
 *        evidence, deciding, cancelling, refusals and the Reviews tab.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as adminApi from '../api/adminApi'
import { ApiError } from '../api/client'
import { AuthContext, type AuthApi } from '../auth/authContext'
import { clearToken, saveToken } from '../auth/tokenStorage'
import { ToastProvider } from '../components/toast/ToastProvider'
import { makeErrand, pageOf, tokenFor } from '../errands/testFixtures'
import { AccountPage } from './AccountPage'
import { ReviewPage } from './ReviewPage'
import { ReviewsPage } from './ReviewsPage'
import type { AccountReviewDetail, AdminAccount } from './types'

vi.mock('../api/adminApi')
vi.mock('../api/creditApi', () => ({
  getCreditBalance: vi.fn(async () => ({ available: 100, reserved: 0, total: 100 })),
  listCreditTransactions: vi.fn(),
}))

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ALICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const auth: AuthApi = {
  status: 'loggedIn', user: { username: 'root', displayName: 'Root Admin', role: 'ADMINISTRATOR' },
  notice: null, login: vi.fn(), logout: vi.fn(),
}
const evidence = { capturedAt: '2026-11-10T05:00:00Z', failedLoginsLast7Days: 14, blockedLoginsLast7Days: 2, failedLoginsLast90Days: 20, blockedLoginsLast90Days: 3, auditEntriesLast90Days: 4 }

function account(overrides: Partial<AdminAccount> = {}): AdminAccount {
  return {
    id: ALICE_ID, username: 'alice_tan', displayName: 'Alice Tan', email: 'alice@u.nus.edu', role: 'MEMBER',
    status: 'ACTIVE', createdAt: '2026-11-01T02:00:00Z', lastLoginAt: null, ...overrides,
  }
}
function review(overrides: Partial<AccountReviewDetail> = {}): AccountReviewDetail {
  return {
    id: '5', account: { id: ALICE_ID, username: 'alice_tan', displayName: 'Alice Tan', status: 'ACTIVE' },
    status: 'OPEN', statusAtOpen: 'ACTIVE', allowedOutcomes: ['SUSPEND', 'NO_ACTION'],
    openedBy: { id: ADMIN_ID, username: 'root' }, openedAt: '2026-11-10T04:00:00Z', openReason: 'Reported password guessing',
    closedBy: null, closedAt: null, outcome: null, reasoning: null, evidence: null, currentEvidence: evidence, ...overrides,
  }
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>
          <Routes>
            <Route path="/admin/accounts/:id" element={<AccountPage />} />
            <Route path="/admin/reviews" element={<ReviewsPage />} />
            <Route path="/admin/reviews/:id" element={<ReviewPage />} />
          </Routes>
        </AuthContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(adminApi.getAccount).mockReset().mockResolvedValue(account())
  vi.mocked(adminApi.listLoginEvents).mockReset().mockResolvedValue({ events: [], nextCursor: null })
  vi.mocked(adminApi.listAudit).mockReset().mockResolvedValue({ entries: [], nextCursor: null })
  vi.mocked(adminApi.listReviews).mockReset().mockResolvedValue({ reviews: [], nextCursor: null })
  vi.mocked(adminApi.getReview).mockReset().mockResolvedValue(review())
  vi.mocked(adminApi.openReview).mockReset().mockResolvedValue(review())
  vi.mocked(adminApi.decideReview).mockReset().mockResolvedValue(review())
  vi.mocked(adminApi.cancelReview).mockReset().mockResolvedValue(review())
  vi.mocked(adminApi.listAccountErrands).mockReset().mockImplementation(async (_id, as) => as === 'requester'
    ? pageOf([makeErrand({ id: 'e1', state: 'DISPUTED', supplierName: 'Overnight Coffee' }), makeErrand({ id: 'e2', state: 'COMPLETED' })], { totalItems: 2 })
    : pageOf([], { totalItems: 0 }))
  saveToken(tokenFor(ADMIN_ID))
})
afterEach(() => clearToken())

describe('opening a review from the account page', () => {
  it('needs a reason, then opens the review and goes to its page', async () => {
    const user = userEvent.setup()
    renderAt(`/admin/accounts/${ALICE_ID}`)
    await user.click(await screen.findByRole('button', { name: 'Open review' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Open a review of @alice_tan?' })
    await user.click(within(dialog).getByRole('button', { name: 'Open review' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Please enter a reason.')
    await user.type(within(dialog).getByLabelText('Reason'), 'Reported password guessing')
    await user.click(within(dialog).getByRole('button', { name: 'Open review' }))
    await waitFor(() => expect(adminApi.openReview).toHaveBeenCalledWith(ALICE_ID, 'Reported password guessing'))
    expect(await screen.findByRole('heading', { name: 'Review #5', level: 1 })).toBeInTheDocument()
  })

  it('links to the open review instead when one exists, and shows neither on your own account', async () => {
    vi.mocked(adminApi.listReviews).mockResolvedValue({ reviews: [review()], nextCursor: null })
    const { unmount } = renderAt(`/admin/accounts/${ALICE_ID}`)
    expect(await screen.findByRole('link', { name: /Open review #5 in progress/ })).toHaveAttribute('href', '/admin/reviews/5')
    expect(screen.queryByRole('button', { name: 'Open review' })).not.toBeInTheDocument()
    expect(adminApi.listReviews).toHaveBeenCalledWith({ accountId: ALICE_ID, status: 'OPEN' }, null, 1, expect.any(AbortSignal))
    unmount()
    vi.mocked(adminApi.getAccount).mockResolvedValue(account({ id: ADMIN_ID, username: 'root' }))
    renderAt(`/admin/accounts/${ADMIN_ID}`)
    await screen.findByText(/This is your own account/)
    expect(screen.queryByRole('button', { name: 'Open review' })).not.toBeInTheDocument()
  })
})

describe('the review page', () => {
  it('shows why it was opened, the current counts, and errands from both sides with disputes', async () => {
    renderAt('/admin/reviews/5')
    expect(await screen.findByText('Reported password guessing')).toBeInTheDocument()
    expect(screen.getByText(/As of now/)).toBeInTheDocument()
    expect(screen.getByText('Failed logins, last 7 days').nextSibling).toHaveTextContent('14')
    expect(await screen.findByText(/As requester: 2 errands/)).toBeInTheDocument()
    expect(screen.getByText(/1 disputed/)).toBeInTheDocument()
    expect(screen.getByText(/As courier: 0 errands/)).toBeInTheDocument()
    expect(adminApi.listAccountErrands).toHaveBeenCalledWith(ALICE_ID, 'requester', 20, expect.any(AbortSignal))
    expect(adminApi.listAccountErrands).toHaveBeenCalledWith(ALICE_ID, 'courier', 20, expect.any(AbortSignal))
    expect(adminApi.listLoginEvents).toHaveBeenCalledWith({ accountId: ALICE_ID }, null, 10, expect.any(AbortSignal))
  })

  it('still shows the rest of the evidence when the Order Service is down', async () => {
    vi.mocked(adminApi.listAccountErrands).mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE', 'down'))
    renderAt('/admin/reviews/5')
    expect(await screen.findByText(/Couldn’t load errands from the Order Service/)).toBeInTheDocument()
    expect(screen.getByText('Failed logins, last 7 days')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record decision' })).toBeInTheDocument()
  })

  it('offers only the outcomes for the status at opening; needs an outcome and reasoning; then decides', async () => {
    const user = userEvent.setup()
    renderAt('/admin/reviews/5')
    const form = await screen.findByRole('form', { name: 'Record a decision' })
    expect(within(form).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['SUSPEND', 'NO_ACTION'])
    await user.click(within(form).getByRole('button', { name: 'Record decision' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Choose an outcome.')
    await user.click(within(form).getByRole('radio', { name: /Suspend/ }))
    await user.click(within(form).getByRole('button', { name: 'Record decision' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Please write your reasoning.')
    vi.mocked(adminApi.getReview).mockResolvedValue(review({
      status: 'DECIDED', outcome: 'SUSPEND', reasoning: '14 failed logins; 1 disputed errand', evidence, currentEvidence: null,
      closedBy: { id: ADMIN_ID, username: 'root' }, closedAt: '2026-11-10T05:00:00Z',
      account: { id: ALICE_ID, username: 'alice_tan', displayName: 'Alice Tan', status: 'SUSPENDED' },
    }))
    await user.type(within(form).getByLabelText('Reasoning'), ' 14 failed logins; 1 disputed errand ')
    await user.click(within(form).getByRole('button', { name: 'Record decision' }))
    await waitFor(() => expect(adminApi.decideReview).toHaveBeenCalledWith('5', 'SUSPEND', '14 failed logins; 1 disputed errand'))
    expect(await screen.findByText('Decided: Suspend')).toBeInTheDocument()
    expect(screen.getByText(/Saved with the decision/)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Record a decision' })).not.toBeInTheDocument()
    expect(await screen.findByText('Review #5 decided: Suspend.')).toBeInTheDocument()
  })

  it("shows the server's refusal (status changed meanwhile) and keeps the form", async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.decideReview).mockRejectedValue(new ApiError(409, 'ACCOUNT_STATUS_CHANGED', "The account's status changed after this review was opened. Look at it again before deciding."))
    renderAt('/admin/reviews/5')
    const form = await screen.findByRole('form', { name: 'Record a decision' })
    await user.click(within(form).getByRole('radio', { name: /No action/ }))
    await user.type(within(form).getByLabelText('Reasoning'), 'nothing found')
    await user.click(within(form).getByRole('button', { name: 'Record decision' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('status changed after this review was opened')
    expect(within(form).getByRole('button', { name: 'Record decision' })).toBeEnabled()
  })

  it('cancels with a reason', async () => {
    const user = userEvent.setup()
    renderAt('/admin/reviews/5')
    await user.click(await screen.findByRole('button', { name: 'Cancel review' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel review #5?' })
    await user.type(within(dialog).getByLabelText('Reason'), 'Opened on the wrong account')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel review' }))
    await waitFor(() => expect(adminApi.cancelReview).toHaveBeenCalledWith('5', 'Opened on the wrong account'))
  })
})

describe('the Reviews tab', () => {
  it('lists reviews and filters by status', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.listReviews).mockResolvedValue({ reviews: [review()], nextCursor: null })
    renderAt('/admin/reviews')
    expect(await screen.findByRole('link', { name: 'Review #5: @alice_tan' })).toHaveAttribute('href', '/admin/reviews/5')
    await user.selectOptions(screen.getByLabelText('Status'), 'OPEN')
    await waitFor(() => expect(adminApi.listReviews).toHaveBeenLastCalledWith({ status: 'OPEN' }, null, 50, expect.any(AbortSignal)))
  })
})
