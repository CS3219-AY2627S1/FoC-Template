/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-08
 * Scope (AI-06): Implemented and tested the requested account initials menu.
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-23
 * Scope (AI-21): Displayed the real balance in the UI and tested its display.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticatedFetch } from '../../features/auth/auth.fetch'
import { useAuth } from '../../features/auth/useAuth'
import { useCredits } from '../../features/credits/useCredits'
import { AppHeader } from './AppHeader'

vi.mock('../../features/auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../../features/auth/auth.fetch', () => ({ authenticatedFetch: vi.fn() }))
vi.mock('../../features/credits/useCredits', () => ({ useCredits: vi.fn() }))

const useAuthMock = vi.mocked(useAuth)
const authenticatedFetchMock = vi.mocked(authenticatedFetch)
const useCreditsMock = vi.mocked(useCredits)
const refreshBalance = vi.fn<() => Promise<void>>()
const signOut = vi.fn<() => Promise<void>>()

function renderHeader() {
  return render(<MemoryRouter><AppHeader /></MemoryRouter>)
}

describe('AppHeader', () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset().mockImplementation(async () => new Response(null, { status: 404 }))
    refreshBalance.mockReset()
    refreshBalance.mockResolvedValue()
    signOut.mockReset().mockResolvedValue()
    useAuthMock.mockReturnValue({
      status: 'authenticated',
      currentUserId: 'user-id',
      currentUserType: 'Student',
      signIn: vi.fn(),
      signOut,
    })
  })

  it('shows the loaded balance, including zero', () => {
    useCreditsMock.mockReturnValue({
      availableBalance: 0,
      status: 'ready',
      error: null,
      refreshBalance,
    })
    renderHeader()

    expect(screen.getByText('0 credits')).toBeInTheDocument()
  })

  it('uses a neutral placeholder while loading', () => {
    useCreditsMock.mockReturnValue({
      availableBalance: null,
      status: 'loading',
      error: null,
      refreshBalance,
    })
    renderHeader()

    expect(screen.getByText('— credits')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry balance' })).not.toBeInTheDocument()
  })

  it('offers a retry after a balance error', () => {
    useCreditsMock.mockReturnValue({
      availableBalance: null,
      status: 'error',
      error: 'Wallet unavailable',
      refreshBalance,
    })
    renderHeader()

    fireEvent.click(screen.getByRole('button', { name: 'Retry balance' }))
    expect(refreshBalance).toHaveBeenCalledOnce()
  })

  it('shows profile initials and opens the account menu to log out', async () => {
    authenticatedFetchMock.mockResolvedValueOnce(Response.json({ name: 'Jordan Kai Tan' }))
    useCreditsMock.mockReturnValue({
      availableBalance: 0, status: 'ready', error: null, refreshBalance,
    })
    renderHeader()

    const account = await screen.findByRole('button', { name: 'Account menu for Jordan Kai Tan' })
    expect(account).toHaveTextContent('JT')
    expect(screen.queryByText('Jordan Kai Tan')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()

    fireEvent.click(account)
    expect(account).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Log out' }), { key: 'Escape' })
    expect(account).toHaveFocus()
    expect(account).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(account)
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(signOut).toHaveBeenCalledOnce()
    await waitFor(() => expect(account).toHaveAttribute('aria-expanded', 'false'))
  })

  it('shows administrators a dedicated dashboard link beside the account menu', () => {
    useAuthMock.mockReturnValue({
      status: 'authenticated', currentUserId: 'admin-id', currentUserType: 'Administrator',
      signIn: vi.fn(), signOut,
    })
    useCreditsMock.mockReturnValue({
      availableBalance: 0, status: 'ready', error: null, refreshBalance,
    })
    renderHeader()

    expect(screen.getByRole('link', { name: /Admin dashboard|Admin/ })).toHaveAttribute('href', '/admin')
  })
})
