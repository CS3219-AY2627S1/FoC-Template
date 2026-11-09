/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Credit page filtering, failure recovery and request-race tests for #65.
 * Author review: Reviewed and approved by @phuc. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { ApiError, NetworkError } from '../api/client'
import { getCreditBalance, listCreditTransactions } from '../api/creditApi'
import { AuthContext, type AuthApi } from '../auth/authContext'
import { CreditTransactionsPage } from './CreditTransactionsPage'
import type { CreditTransactionPage, CreditTransactionType } from './types'

vi.mock('../api/creditApi', () => ({ listCreditTransactions: vi.fn(), getCreditBalance: vi.fn() }))
const auth: AuthApi = {
  status: 'loggedIn', user: { username: 'member', displayName: 'Member One', role: 'MEMBER' },
  notice: null, login: vi.fn(), logout: vi.fn(),
}
const page: CreditTransactionPage = {
  items: [{ id: '9007199254740997', type: 'RESERVE', availableDelta: -30, reservedDelta: 30,
    orderId: '11111111-1111-4111-8111-111111111111', reservationId: null, createdAt: '2026-11-01T16:00:00Z' }],
  page: 0, size: 20, totalItems: 21,
}
beforeEach(() => {
  vi.mocked(listCreditTransactions).mockReset().mockResolvedValue(page)
  vi.mocked(getCreditBalance).mockReset().mockResolvedValue({ available: 105, reserved: 0, total: 105 })
})

function History() {
  const navigate = useNavigate()
  return <><button onClick={() => navigate(-1)}>Browser back</button><CreditTransactionsPage /></>
}
function renderPage(path = '/credits') {
  return render(<MemoryRouter initialEntries={[path]}><AuthContext.Provider value={auth}><History /></AuthContext.Provider></MemoryRouter>)
}

it('shows large IDs, both signed deltas, Singapore time and the active navigation entry', async () => {
  renderPage()
  expect(await screen.findByText('9007199254740997')).toBeInTheDocument()
  const item = screen.getByRole('heading', { name: 'Credits reserved' }).closest('li')!
  expect(within(item).getByText('-30')).toBeInTheDocument()
  expect(within(item).getByText('+30')).toBeInTheDocument()
  expect(within(item).getByText(/2 Nov 2026/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'My credits' })).toHaveAttribute('aria-current', 'page')
  expect(within(screen.getByRole('banner')).getByText('Available')).toBeInTheDocument()
  expect(within(screen.getByRole('banner')).getByText('Reserved')).toBeInTheDocument()
})

it('applies inclusive dates, resets paging, changes size, clears filters and restores browser history', async () => {
  const user = userEvent.setup()
  renderPage('/credits?page=2')
  await screen.findByText('9007199254740997')
  fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-02' } })
  fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-11-02' } })
  await user.selectOptions(screen.getByLabelText('Per page'), '50')
  await user.click(screen.getByRole('button', { name: 'Apply filters' }))
  await waitFor(() => expect(listCreditTransactions).toHaveBeenLastCalledWith({ from: '2026-11-02T00:00:00+08:00', to: '2026-11-03T00:00:00+08:00', page: 0, size: 50 }, expect.any(AbortSignal)))
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  await waitFor(() => expect(listCreditTransactions).toHaveBeenLastCalledWith({ from: undefined, to: undefined, page: 0, size: 20 }, expect.any(AbortSignal)))
  await user.click(screen.getByRole('button', { name: 'Browser back' }))
  expect(screen.getByLabelText('From date')).toHaveValue('2026-11-02')
  expect(screen.getByLabelText('Per page')).toHaveValue('50')
  expect(getCreditBalance).toHaveBeenCalledTimes(1)
  expect(within(screen.getByRole('group', { name: 'Current credit balance' })).getByText('105')).toBeInTheDocument()
})

it('pages on the server and retains date filters', async () => {
  const user = userEvent.setup()
  renderPage('/credits?from=2026-11-02')
  await screen.findByText('9007199254740997')
  await user.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(listCreditTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-11-02T00:00:00+08:00', page: 1 }), expect.any(AbortSignal)))
})

it('validates reversed dates without submitting a request', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByText('9007199254740997')
  fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-03' } })
  fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-11-02' } })
  await user.click(screen.getByRole('button', { name: 'Apply filters' }))
  expect(screen.getByRole('alert')).toHaveTextContent('end date must be on or after')
  expect(listCreditTransactions).toHaveBeenCalledTimes(1)
})

it('does not request history for malformed date URLs', () => {
  renderPage('/credits?from=2026-02-29')
  expect(screen.getByRole('alert')).toHaveTextContent('Enter valid dates')
  expect(listCreditTransactions).not.toHaveBeenCalled()
})

it.each([
  [new NetworkError(), 'connection'],
  [new ApiError(503, 'SERVICE_UNAVAILABLE', 'internal'), 'temporarily unavailable'],
  [new ApiError(401, 'UNAUTHENTICATED', 'internal'), 'sign in again'],
  [new ApiError(400, 'INVALID_QUERY', 'internal'), 'filters could not be applied'],
])('shows actionable failure feedback and retries without losing filters', async (error, message) => {
  vi.mocked(listCreditTransactions).mockRejectedValueOnce(error)
  const user = userEvent.setup()
  renderPage('/credits?from=2026-11-02')
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.getByLabelText('From date')).toHaveValue('2026-11-02')
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('9007199254740997')).toBeInTheDocument()
})

it.each([
  [0, 0, 'No transactions yet'], [0, 0, 'No transactions match these dates', '?from=2026-11-02'],
  [9, 21, 'No transactions on this page', '?page=9'],
])('handles empty and out-of-range histories', async (pageNumber, totalItems, heading, query = '') => {
  vi.mocked(listCreditTransactions).mockResolvedValue({ items: [], page: pageNumber, size: 20, totalItems })
  renderPage(`/credits${query}`)
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  if (totalItems > 0) {
    await userEvent.click(screen.getByRole('button', { name: 'First page' }))
    await waitFor(() => expect(listCreditTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0 }), expect.any(AbortSignal)))
  }
})

it('cancels replaced requests and ignores their late responses', async () => {
  let resolveOld!: (page: CreditTransactionPage) => void
  vi.mocked(listCreditTransactions).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
  const user = userEvent.setup()
  renderPage()
  expect(screen.getByRole('status')).toHaveTextContent('Loading transactions')
  const signal = vi.mocked(listCreditTransactions).mock.calls[0][1]!
  fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-02' } })
  await user.click(screen.getByRole('button', { name: 'Apply filters' }))
  expect(await screen.findByText('9007199254740997')).toBeInTheDocument()
  expect(signal.aborted).toBe(true)
  resolveOld({ ...page, items: [{ ...page.items[0], id: 'stale-id' }] })
  await waitFor(() => expect(screen.queryByText('stale-id')).not.toBeInTheDocument())
})

it('renders all ledger types including zero deltas and refreshes the current query', async () => {
  const types: CreditTransactionType[] = ['INITIAL_GRANT', 'RESERVE', 'CAPTURE_DEBIT', 'CAPTURE_CREDIT', 'RELEASE', 'FORFEIT']
  vi.mocked(listCreditTransactions).mockResolvedValue({ ...page, totalItems: 6, items: types.map((type, i) => ({ ...page.items[0], id: String(i), type, availableDelta: 0 })) })
  renderPage()
  expect(await screen.findByRole('heading', { name: 'Welcome credits' })).toBeInTheDocument()
  for (const name of ['Credits reserved', 'Errand payment', 'Errand earnings', 'Credits released', 'Credits forfeited']) expect(screen.getByRole('heading', { name })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(listCreditTransactions).toHaveBeenCalledTimes(2))
  expect(getCreditBalance).toHaveBeenCalledTimes(2)
})
