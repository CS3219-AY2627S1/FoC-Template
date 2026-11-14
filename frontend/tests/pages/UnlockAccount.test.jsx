/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Created per instructions.md Stage 31e, covering every Stage 31d Verification bullet
 *        that does not need a real browser: no request on open (missing token and valid
 *        token), one request and the correct redirect+toast for UNLOCKED and
 *        ALREADY_UNLOCKED, staying on the page with the banner for INVALID_UNLOCK_TOKEN, and a
 *        double-click sending exactly one request. api/auth is mocked, per the stage's own
 *        instruction to use the existing Vitest + @testing-library/react setup.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UnlockAccount from '../../src/pages/UnlockAccount'
import { ToastProvider } from '../../src/components/Toast'
import * as authApi from '../../src/api/auth'

vi.mock('../../src/api/auth', () => ({
  unlockAccount: vi.fn(),
}))

function renderAt(path) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/unlock-account" element={<UnlockAccount />} />
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('UnlockAccount (Stage 31d)', () => {
  it('missing token shows the banner immediately, disables the button, sends no request', () => {
    renderAt('/unlock-account')
    expect(screen.getByText('This link is invalid or has expired.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Unlock my account' })).toBeDisabled()
    expect(authApi.unlockAccount).not.toHaveBeenCalled()
  })

  it('a valid token: opening the page sends no request until the button is pressed', () => {
    renderAt('/unlock-account?token=abc')
    expect(authApi.unlockAccount).not.toHaveBeenCalled()
    expect(screen.queryByText('This link is invalid or has expired.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Unlock my account' })).not.toBeDisabled()
  })

  it('UNLOCKED: one request, redirects to /login, shows the unlocked toast', async () => {
    authApi.unlockAccount.mockResolvedValue({ message: 'Your account has been unlocked', code: 'UNLOCKED' })
    renderAt('/unlock-account?token=abc')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Unlock my account' })))
    expect(authApi.unlockAccount).toHaveBeenCalledTimes(1)
    expect(authApi.unlockAccount).toHaveBeenCalledWith('abc')
    expect(screen.getByText('LOGIN PAGE')).toBeTruthy()
    expect(screen.getByText('Your account has been unlocked. You can log in now.')).toBeTruthy()
  })

  it('ALREADY_UNLOCKED: redirects to /login, shows the no-longer-locked toast', async () => {
    authApi.unlockAccount.mockResolvedValue({ message: 'Your account is no longer locked', code: 'ALREADY_UNLOCKED' })
    renderAt('/unlock-account?token=stale')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Unlock my account' })))
    expect(screen.getByText('LOGIN PAGE')).toBeTruthy()
    expect(screen.getByText('Your account is no longer locked.')).toBeTruthy()
  })

  it('INVALID_UNLOCK_TOKEN: stays on the page, shows the banner, does not redirect', async () => {
    authApi.unlockAccount.mockRejectedValue({ code: 'INVALID_UNLOCK_TOKEN', message: 'This link is invalid or has expired' })
    renderAt('/unlock-account?token=bad')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Unlock my account' })))
    expect(screen.queryByText('LOGIN PAGE')).toBeNull()
    expect(screen.getByText('This link is invalid or has expired.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Unlock my account' })).not.toBeDisabled()
  })

  it('double-clicking the button sends exactly one request', async () => {
    let resolveCall
    authApi.unlockAccount.mockImplementation(
      () => new Promise((resolve) => { resolveCall = resolve }),
    )
    renderAt('/unlock-account?token=abc')
    const button = screen.getByRole('button', { name: 'Unlock my account' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(authApi.unlockAccount).toHaveBeenCalledTimes(1)
    await act(async () => resolveCall({ message: 'x', code: 'UNLOCKED' }))
  })
})
