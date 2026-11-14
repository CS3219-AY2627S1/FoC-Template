/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Tests for Account's EmailSection and PasswordSection OTP steps, per instructions.md
 *        Stage 25's Tests section: OTP_ATTEMPTS_EXCEEDED clears and disables the boxes and
 *        starts the resend countdown; OTP_EXPIRED clears but keeps them enabled; a successful
 *        resend re-enables and clears the boxes and the error. api/profile is mocked.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5-5): Mocked the new preferred-language profile calls.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Account from '../../src/pages/Account'
import * as profileApi from '../../src/api/profile'

vi.mock('../../src/api/profile', () => ({
  getProfile: vi.fn().mockResolvedValue({ preferredLang: 'en' }),
  setPreferredLang: vi.fn(),
  setActiveView: vi.fn(),
  changeUsername: vi.fn(),
  changeEmail: vi.fn(),
  verifyEmailChangeOtp: vi.fn(),
  resendMeOtp: vi.fn(),
  changePassword: vi.fn(),
  confirmPasswordChange: vi.fn(),
}))

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', username: 'alice', email: 'alice@example.com' },
    updateUser: vi.fn(),
    forceReauth: vi.fn(),
  }),
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

const tickSeconds = (n) => {
  for (let i = 0; i < n; i++) act(() => vi.advanceTimersByTime(1000))
}

// Account.jsx renders every section at once, and "New email" is also role=textbox, so OTP
// box queries must be scoped to the "Digit N of 6" aria-labels rather than every textbox.
const otpBoxes = () => screen.getAllByRole('textbox', { name: /^Digit \d of 6$/ })

function fillOtp(code) {
  const inputs = otpBoxes()
  code.split('').forEach((digit, i) => fireEvent.change(inputs[i], { target: { value: digit } }))
}

async function goToEmailOtpStep() {
  render(<Account />)
  profileApi.changeEmail.mockResolvedValue()
  // EmailSection's "Current password" is the first of two fields with that label.
  fireEvent.change(screen.getAllByLabelText('Current password')[0], { target: { value: 'Password1!' } })
  fireEvent.change(screen.getByLabelText('New email'), { target: { value: 'new@example.com' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save email' }))
  })
}

async function goToPasswordOtpStep() {
  render(<Account />)
  profileApi.changePassword.mockResolvedValue()
  // EmailSection also has a "Current password" field; PasswordSection's is the second one.
  const currentPwInput = screen.getAllByLabelText('Current password')[1]
  fireEvent.change(currentPwInput, { target: { value: 'Password1!' } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPassword1!' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
  })
}

describe('Account EmailSection OTP step (Stage 25 regression)', () => {
  it('OTP_ATTEMPTS_EXCEEDED clears and disables the boxes and starts the resend countdown', async () => {
    await goToEmailOtpStep()
    profileApi.verifyEmailChangeOtp.mockRejectedValue({ code: 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds: 15 })

    await act(async () => fillOtp('000000'))

    expect(screen.getByText(/no longer valid/)).toBeInTheDocument()
    otpBoxes().forEach((input) => expect(input).toBeDisabled())
    expect(screen.getByRole('button', { name: /Resend in 15s/ })).toBeDisabled()
  })

  it('OTP_EXPIRED clears the boxes but keeps them enabled, no countdown', async () => {
    await goToEmailOtpStep()
    profileApi.verifyEmailChangeOtp.mockRejectedValue({ code: 'OTP_EXPIRED' })

    await act(async () => fillOtp('000000'))

    expect(screen.getByText('That code has expired. Request a new one.')).toBeInTheDocument()
    const inputs = otpBoxes()
    expect(inputs.map((i) => i.value)).toEqual(['', '', '', '', '', ''])
    inputs.forEach((input) => expect(input).not.toBeDisabled())
    expect(screen.getByRole('button', { name: 'Resend code' })).not.toBeDisabled()
  })

  it('a successful resend re-enables and clears the boxes and the error', async () => {
    await goToEmailOtpStep()
    profileApi.verifyEmailChangeOtp.mockRejectedValue({ code: 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds: 3 })
    await act(async () => fillOtp('000000'))
    expect(otpBoxes()[0]).toBeDisabled()

    profileApi.resendMeOtp.mockResolvedValue()
    tickSeconds(3)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
    })

    expect(screen.queryByText(/no longer valid/)).toBeNull()
    otpBoxes().forEach((input) => expect(input).not.toBeDisabled())
  })
})

describe('Account PasswordSection OTP step (Stage 25 regression)', () => {
  it('OTP_ATTEMPTS_EXCEEDED clears and disables the boxes and starts the resend countdown', async () => {
    await goToPasswordOtpStep()
    profileApi.confirmPasswordChange.mockRejectedValue({ code: 'OTP_ATTEMPTS_EXCEEDED', retryAfterSeconds: 20 })

    await act(async () => fillOtp('000000'))

    expect(screen.getByText(/no longer valid/)).toBeInTheDocument()
    otpBoxes().forEach((input) => expect(input).toBeDisabled())
    expect(screen.getByRole('button', { name: /Resend in 20s/ })).toBeDisabled()
  })

  it('OTP_EXPIRED clears the boxes but keeps them enabled, no countdown', async () => {
    await goToPasswordOtpStep()
    profileApi.confirmPasswordChange.mockRejectedValue({ code: 'OTP_EXPIRED' })

    await act(async () => fillOtp('000000'))

    expect(screen.getByText('That code has expired. Request a new one.')).toBeInTheDocument()
    const inputs = otpBoxes()
    expect(inputs.map((i) => i.value)).toEqual(['', '', '', '', '', ''])
    inputs.forEach((input) => expect(input).not.toBeDisabled())
  })
})

// AI-generated (edited by <name>).
describe('Account LanguageSection', () => {
  it('loads the saved language and saves a new one', async () => {
    vi.useRealTimers()
    vi.mocked(profileApi.setPreferredLang).mockResolvedValue({ preferredLang: 'ta' })
    render(<Account />)
    const select = await screen.findByLabelText('Language')
    await waitFor(() => expect(select).toHaveValue('en'))
    const save = screen.getByRole('button', { name: 'Save language' })
    expect(save).toBeDisabled()
    fireEvent.change(select, { target: { value: 'ta' } })
    fireEvent.click(save)
    await waitFor(() => expect(profileApi.setPreferredLang).toHaveBeenCalledWith('ta'))
    expect(await screen.findByText('Preferred language updated.')).toBeInTheDocument()
  })
})
