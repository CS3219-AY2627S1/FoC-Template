/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Tests for ElevationOtpModal, per instructions.md Stage 27c's Tests section: nothing is
 *        sent until "Send code" is clicked, a successful verify stores the token and calls
 *        onVerified, wrong code clears the boxes and shows the error, attempts-exceeded
 *        disables the boxes and starts ResendButton's cooldown, and ALREADY_ELEVATED (from
 *        send/verify/resend) shows a toast and closes the modal. api/admin is mocked; the real
 *        OtpInput/ResendButton (same pattern as ForgotPassword.test.jsx/Register.test.jsx) and
 *        the real ToastProvider are used.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ElevationOtpModal from '../../src/components/ElevationOtpModal'
import { ToastProvider } from '../../src/components/Toast'
import * as adminApi from '../../src/api/admin'
import { clearElevationToken, getElevationToken } from '../../src/utils/elevation'

vi.mock('../../src/api/admin', () => ({
  sendAdminOtp: vi.fn(),
  verifyAdminOtp: vi.fn(),
  resendAdminOtp: vi.fn(),
}))

function fakeToken(expiresInSeconds = 900) {
  const b64 = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  const payload = { sub: 'admin-1', role: 'admin', sid: 'sid-1', exp: Math.floor(Date.now() / 1000) + expiresInSeconds }
  return b64({ alg: 'RS256', typ: 'ep+JWT' }) + '.' + b64(payload) + '.signature'
}

function fillOtp(code) {
  const inputs = screen.getAllByRole('textbox')
  code.split('').forEach((digit, i) => fireEvent.change(inputs[i], { target: { value: digit } }))
}

function renderModal({ onClose = vi.fn(), onVerified = vi.fn() } = {}) {
  render(
    <ToastProvider>
      <ElevationOtpModal onClose={onClose} onVerified={onVerified} />
    </ToastProvider>,
  )
  return { onClose, onVerified }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  clearElevationToken()
})

describe('ElevationOtpModal', () => {
  it('opens with a Send code button and sends nothing until it is clicked', () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument()
    expect(adminApi.sendAdminOtp).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })

  it('shows the OTP boxes only after Send code succeeds', async () => {
    adminApi.sendAdminOtp.mockResolvedValue({ message: 'sent', code: 'OTP_SENT' })
    renderModal()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    })

    expect(adminApi.sendAdminOtp).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('textbox')).toHaveLength(6)
  })

  it('a correct code stores the elevation token and calls onVerified', async () => {
    adminApi.sendAdminOtp.mockResolvedValue({ message: 'sent', code: 'OTP_SENT' })
    const token = fakeToken()
    adminApi.verifyAdminOtp.mockResolvedValue({ elevationToken: token })
    const { onVerified } = renderModal()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send code' })))
    await act(async () => fillOtp('123456'))

    expect(adminApi.verifyAdminOtp).toHaveBeenCalledWith('123456')
    expect(getElevationToken()).toBe(token)
    expect(onVerified).toHaveBeenCalledTimes(1)
  })

  it('a wrong code clears the boxes and shows the error, staying enabled', async () => {
    adminApi.sendAdminOtp.mockResolvedValue({ message: 'sent', code: 'OTP_SENT' })
    adminApi.verifyAdminOtp.mockRejectedValue({ code: 'INVALID_OTP' })
    renderModal()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send code' })))

    await act(async () => fillOtp('000000'))

    expect(screen.getByText('That code is incorrect.')).toBeInTheDocument()
    const inputs = screen.getAllByRole('textbox')
    expect(inputs.map((i) => i.value)).toEqual(['', '', '', '', '', ''])
    inputs.forEach((input) => expect(input).not.toBeDisabled())
  })

  it('attempts exceeded disables the boxes and starts the resend cooldown', async () => {
    adminApi.sendAdminOtp.mockResolvedValue({ message: 'sent', code: 'OTP_SENT' })
    adminApi.verifyAdminOtp.mockRejectedValue({ code: 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds: 7 })
    renderModal()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send code' })))

    await act(async () => fillOtp('000000'))

    screen.getAllByRole('textbox').forEach((input) => expect(input).toBeDisabled())
    expect(screen.getByRole('button', { name: /Resend in 7s/ })).toBeDisabled()
  })

  it('ALREADY_ELEVATED from send-otp shows a toast and closes the modal', async () => {
    adminApi.sendAdminOtp.mockRejectedValue({ code: 'ALREADY_ELEVATED' })
    const { onClose } = renderModal()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send code' })))

    expect(screen.getByRole('status')).toHaveTextContent('Admin actions are already unlocked.')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ALREADY_ELEVATED from verify-otp shows a toast and closes the modal', async () => {
    adminApi.sendAdminOtp.mockResolvedValue({ message: 'sent', code: 'OTP_SENT' })
    adminApi.verifyAdminOtp.mockRejectedValue({ code: 'ALREADY_ELEVATED' })
    const { onClose, onVerified } = renderModal()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send code' })))

    await act(async () => fillOtp('000000'))

    expect(screen.getByRole('status')).toHaveTextContent('Admin actions are already unlocked.')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('Cancel on the ready step closes the modal with no request', () => {
    const { onClose } = renderModal()
    const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelButtons[cancelButtons.length - 1])
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(adminApi.sendAdminOtp).not.toHaveBeenCalled()
  })
})
