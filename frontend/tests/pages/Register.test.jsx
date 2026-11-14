/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Tests for Register's OTP step, per instructions.md Stage 25's Tests section:
 *        INVALID_OTP clears the boxes and keeps them enabled (regression); OTP_EXPIRED clears
 *        and refocuses but keeps them enabled; OTP_ATTEMPTS_EXCEEDED clears and disables the
 *        boxes, shows the reworded message, and starts the resend countdown from
 *        err.retryAfterSeconds; a successful resend re-enables and clears the boxes and error.
 *        api/auth is mocked.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Register from '../../src/pages/Register'
import * as authApi from '../../src/api/auth'

vi.mock('../../src/api/auth', () => ({
  register: vi.fn(),
  verifyOtp: vi.fn(),
  resendOtp: vi.fn(),
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

const tickSeconds = (n) => {
  for (let i = 0; i < n; i++) act(() => vi.advanceTimersByTime(1000))
}

async function goToOtpStep() {
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>,
  )
  authApi.register.mockResolvedValue()
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1!' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  })
}

function fillOtp(code) {
  const inputs = screen.getAllByRole('textbox')
  code.split('').forEach((digit, i) => fireEvent.change(inputs[i], { target: { value: digit } }))
}

describe('Register OTP step (Stage 25 regression)', () => {
  it('INVALID_OTP clears the boxes, keeps them enabled, and shows the field error', async () => {
    await goToOtpStep()
    authApi.verifyOtp.mockRejectedValue({ code: 'INVALID_OTP' })

    await act(async () => fillOtp('000000'))

    expect(screen.getByText('That code is incorrect.')).toBeInTheDocument()
    const inputs = screen.getAllByRole('textbox')
    expect(inputs.map((i) => i.value)).toEqual(['', '', '', '', '', ''])
    inputs.forEach((input) => expect(input).not.toBeDisabled())
  })

  it('OTP_EXPIRED clears and refocuses the boxes but keeps them enabled, no countdown', async () => {
    await goToOtpStep()
    authApi.verifyOtp.mockRejectedValue({ code: 'OTP_EXPIRED' })

    await act(async () => fillOtp('000000'))

    expect(screen.getByText('That code has expired. Request a new one.')).toBeInTheDocument()
    const inputs = screen.getAllByRole('textbox')
    expect(inputs.map((i) => i.value)).toEqual(['', '', '', '', '', ''])
    inputs.forEach((input) => expect(input).not.toBeDisabled())
    expect(screen.getByRole('button', { name: 'Resend code' })).not.toBeDisabled()
  })

  it('OTP_ATTEMPTS_EXCEEDED clears and disables the boxes, shows the new message, and starts the resend countdown', async () => {
    await goToOtpStep()
    authApi.verifyOtp.mockRejectedValue({ code: 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds: 42 })

    await act(async () => fillOtp('000000'))

    expect(
      screen.getByText(
        'That code is no longer valid. You can request a new one once the button below is available.',
      ),
    ).toBeInTheDocument()
    const inputs = screen.getAllByRole('textbox')
    expect(inputs.map((i) => i.value)).toEqual(['', '', '', '', '', ''])
    inputs.forEach((input) => expect(input).toBeDisabled())

    const resendBtn = screen.getByRole('button', { name: /Resend in 42s/ })
    expect(resendBtn).toBeDisabled()
  })

  it('OTP_ATTEMPTS_EXCEEDED with retryAfterSeconds 0 leaves resend enabled immediately', async () => {
    await goToOtpStep()
    authApi.verifyOtp.mockRejectedValue({ code: 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds: 0 })

    await act(async () => fillOtp('000000'))

    expect(screen.getByRole('button', { name: 'Resend code' })).not.toBeDisabled()
    screen.getAllByRole('textbox').forEach((input) => expect(input).toBeDisabled())
  })

  it('a successful resend re-enables and clears the boxes and clears the error', async () => {
    await goToOtpStep()
    authApi.verifyOtp.mockRejectedValue({ code: 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds: 10 })
    await act(async () => fillOtp('000000'))
    expect(screen.getAllByRole('textbox')[0]).toBeDisabled()

    authApi.resendOtp.mockResolvedValue()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Resend in 10s/ }))
    })
    tickSeconds(10)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
    })

    expect(screen.queryByText(/no longer valid/)).toBeNull()
    screen.getAllByRole('textbox').forEach((input) => expect(input).not.toBeDisabled())
  })
})
