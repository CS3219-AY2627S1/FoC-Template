/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Current balance loading, retry and cancellation tests for #65. Author review: Reviewed and approved by @phuc. */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { getCreditBalance } from '../api/creditApi'
import { ApiError } from '../api/client'
import { CreditBalanceSummary } from './CreditBalanceSummary'
import type { CreditBalance } from './types'

vi.mock('../api/creditApi', () => ({ getCreditBalance: vi.fn() }))
beforeEach(() => vi.mocked(getCreditBalance).mockReset())

it('shows current available and reserved balances, including zero', async () => {
  vi.mocked(getCreditBalance).mockResolvedValue({ available: 105, reserved: 0, total: 105 })
  render(<CreditBalanceSummary refreshKey={0} />)
  expect(await screen.findByText('105')).toBeInTheDocument()
  expect(screen.getByText('0')).toBeInTheDocument()
})

it.each([
  [new ApiError(503, 'SERVICE_UNAVAILABLE', 'internal'), 'Couldn’t load'],
  [new ApiError(404, 'CREDIT_ACCOUNT_NOT_READY', 'internal'), 'still being set up'],
])('keeps unknown amounts distinct from zero and allows retry', async (error, message) => {
  vi.mocked(getCreditBalance).mockRejectedValueOnce(error).mockResolvedValue({ available: 91, reserved: 14, total: 105 })
  render(<CreditBalanceSummary refreshKey={0} />)
  expect(await screen.findByRole('button', { name: 'Retry balance' })).toHaveAttribute('title', expect.stringContaining(message))
  expect(screen.queryByText('0')).not.toBeInTheDocument()
  expect(screen.getAllByText('—')).toHaveLength(2)
  await userEvent.click(screen.getByRole('button', { name: 'Retry balance' }))
  expect(await screen.findByText('91')).toBeInTheDocument()
  expect(screen.getByText('14')).toBeInTheDocument()
})

it('cancels old loads on refresh and ignores late responses', async () => {
  let resolveOld!: (value: CreditBalance) => void
  vi.mocked(getCreditBalance).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
    .mockResolvedValue({ available: 80, reserved: 25, total: 105 })
  const { rerender } = render(<CreditBalanceSummary refreshKey={0} />)
  expect(screen.getAllByText('…')).toHaveLength(2)
  const oldSignal = vi.mocked(getCreditBalance).mock.calls[0][0]!
  rerender(<CreditBalanceSummary refreshKey={1} />)
  expect(await screen.findByText('80')).toBeInTheDocument()
  expect(oldSignal.aborted).toBe(true)
  resolveOld({ available: 999, reserved: 0, total: 999 })
  await waitFor(() => expect(screen.queryByText('999')).not.toBeInTheDocument())
})
