/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Tests for ForgotPassword's OTP step, per instructions.md Stage 25's Tests section:
 *        the step-2 OTP_ATTEMPTS_EXCEEDED/OTP_EXPIRED/INVALID_OTP handling (same pattern as
 *        Register), a successful resend re-enabling the boxes, and the step-3-to-step-2
 *        fallback starting the boxes disabled with the countdown running when resetPassword
 *        itself returns OTP_ATTEMPTS_EXCEEDED (the 5th failed attempt). api/auth is mocked.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ForgotPassword from '../../src/pages/ForgotPassword'
import * as authApi from '../../src/api/auth'

vi.mock('../../src/api/auth', () => ({
  forgotPassword: vi.fn(),
  verifyOtp: vi.fn(),
  resendOtp: vi.fn(),
  resetPassword: vi.fn(),
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

const tickSeconds = (n) => {
  for (let i = 0; i < n; i++) act(() => vi.advanceTimersByTime(1000))
}

function fillOtp(code) {
  const inputs = screen.getAllByRole('textbox')
  code.split('').forEach((digit, i) => fireEvent.change(inputs[i], { target: { value: digit } }))
}

async function goToOtpStep() {
  render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>,
  )
  authApi.forgotPassword.mockResolvedValue()
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
  })
}

describe('ForgotPassword OTP step (Stage 25 regression)', () => {
  it('OTP_ATTEMPTS_EXCEEDED clears and disables the boxes and starts the resend countdown', async () => {
    await goToOtpStep()
    authApi.verifyOtp.mockRejectedValue({ code: 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds: 7 })

    await act(async () => fillOtp('000000'))

    expect(screen.getByText(/no longer valid/)).toBeInTheDocument()
    screen.getAllByRole('textbox').forEach((input) => expect(input).toBeDisabled())
    expect(screen.getByRole('button', { name: /Resend in 7s/ })).toBeDisabled()
  })

  it('OTP_EXPIRED clears the boxes but keeps them enabled, no countdown', async () => {
    await goToOtpStep()
    authApi.verifyOtp.mockRejectedValue({ code: 'OTP_EXPIRED' })

    await act(async () => fillOtp('000000'))

    expect(screen.getByText('That code has expired. Request a new one.')).toBeInTheDocument()
    const inputs = screen.getAllByRole('textbox')
    expect(inputs.map((i) => i.value)).toEqual(['', '', '', '', '', ''])
    inputs.forEach((input) => expect(input).not.toBeDisabled())
    expect(screen.getByRole('button', { name: 'Resend code' })).not.toBeDisabled()
  })

  it('a successful resend re-enables and clears the boxes and the error', async () => {
    await goToOtpStep()
    authApi.verifyOtp.mockRejectedValue({ code: 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds: 4 })
    await act(async () => fillOtp('000000'))
    expect(screen.getAllByRole('textbox')[0]).toBeDisabled()

    authApi.resendOtp.mockResolvedValue()
    tickSeconds(4)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
    })

    expect(screen.queryByText(/no longer valid/)).toBeNull()
    screen.getAllByRole('textbox').forEach((input) => expect(input).not.toBeDisabled())
  })

  it('step 3 (reset-password) returning OTP_ATTEMPTS_EXCEEDED falls back to step 2 already disabled with the countdown running', async () => {
    await goToOtpStep()
    authApi.verifyOtp.mockResolvedValue()
    await act(async () => fillOtp('123456'))

    // Now on step 3 (set a new password).
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPassword1!' } })
    authApi.resetPassword.mockRejectedValue({ code: 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds: 9 })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    })

    // Back at step 2, already dead.
    expect(screen.getByText(/no longer valid/)).toBeInTheDocument()
    screen.getAllByRole('textbox').forEach((input) => expect(input).toBeDisabled())
    expect(screen.getByRole('button', { name: /Resend in 9s/ })).toBeDisabled()
  })
})
