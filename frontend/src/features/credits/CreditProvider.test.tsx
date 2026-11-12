/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol) and GitHub Copilot code review (model unrecorded), 2026-10-23
 * Scope (AI-04): Reused balance loading logic and tested request cleanup.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-09
 * Scope: Updated tests for notification-driven frontend behavior.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAvailableBalance } from './credit.api'
import { NotificationContext } from '../notifications/notification.context'
import type { NotificationListener } from '../notifications/notification.types'
import { CreditProvider } from './CreditProvider'
import { useCredits } from './useCredits'

vi.mock('./credit.api', () => ({ getAvailableBalance: vi.fn() }))

const getAvailableBalanceMock = vi.mocked(getAvailableBalance)

function Consumer() {
  const { availableBalance, status, error, refreshBalance } = useCredits()
  return (
    <div>
      <span>{status}</span>
      <span>{availableBalance ?? 'none'}</span>
      <span>{error ?? 'no error'}</span>
      <button type="button" onClick={() => void refreshBalance()}>Refresh</button>
    </div>
  )
}

describe('CreditProvider', () => {
  beforeEach(() => getAvailableBalanceMock.mockReset())

  it('loads and refreshes the available balance', async () => {
    getAvailableBalanceMock.mockResolvedValueOnce(30).mockResolvedValueOnce(25)
    render(<CreditProvider><Consumer /></CreditProvider>)

    expect(await screen.findByText('30')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Refresh' }).click()
    expect(await screen.findByText('25')).toBeInTheDocument()
    expect(getAvailableBalanceMock).toHaveBeenCalledTimes(2)
  })

  it('refreshes the balance from the credit API on a credit alert and on reconnect', async () => {
    getAvailableBalanceMock.mockResolvedValueOnce(30).mockResolvedValueOnce(40).mockResolvedValueOnce(42)
    let notify!: NotificationListener
    render(
      <NotificationContext.Provider value={{
        items: [], unreadCount: 0, historyStatus: 'ready', connection: 'connected',
        refresh: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), hide: vi.fn(),
        subscribe(listener) { notify = listener; return vi.fn() },
      }}>
        <CreditProvider><Consumer /></CreditProvider>
      </NotificationContext.Provider>,
    )
    expect(await screen.findByText('30')).toBeInTheDocument()
    const item = {
      id: 'credit', type: 'CREDIT_RECEIVED', data: { errandId: 'errand' },
      message: 'Received 10 credits', createdAt: '2026-11-08T00:00:00Z', readAt: null,
    }
    act(() => notify({ type: 'notification', item: { ...item, type: 'ERRAND_COMPLETED' } }))
    expect(getAvailableBalanceMock).toHaveBeenCalledOnce()
    act(() => notify({ type: 'notification', item }))
    expect(await screen.findByText('40')).toBeInTheDocument()
    act(() => notify({ type: 'connected' }))
    expect(await screen.findByText('42')).toBeInTheDocument()
  })

  it('exposes an error and can retry', async () => {
    getAvailableBalanceMock
      .mockRejectedValueOnce(new Error('Wallet unavailable'))
      .mockResolvedValueOnce(0)
    render(<CreditProvider><Consumer /></CreditProvider>)

    expect(await screen.findByText('Wallet unavailable')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Refresh' }).click()
    expect(await screen.findByText('0')).toBeInTheDocument()
    expect(screen.getByText('ready')).toBeInTheDocument()
  })

  it('aborts a refresh that is still active when unmounted', async () => {
    getAvailableBalanceMock.mockResolvedValueOnce(30)
    const { unmount } = render(<CreditProvider><Consumer /></CreditProvider>)
    expect(await screen.findByText('30')).toBeInTheDocument()

    let refreshSignal: AbortSignal | undefined
    getAvailableBalanceMock.mockImplementationOnce(
      (signal) =>
        new Promise((resolve) => {
          refreshSignal = signal
          signal?.addEventListener('abort', () => resolve(25))
        }),
    )
    screen.getByRole('button', { name: 'Refresh' }).click()
    await waitFor(() => expect(refreshSignal).toBeDefined())

    unmount()
    expect(refreshSignal?.aborted).toBe(true)
  })
})
