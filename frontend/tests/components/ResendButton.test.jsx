/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Tests for ResendButton, per instructions.md Stage 25's Tests section: the existing
 *        OTP_RESEND_COOLDOWN/OTP_RESEND_LIMIT handling (unchanged), and the new imperative
 *        startCooldown(seconds) handle a parent page uses on OTP_ATTEMPTS_EXCEEDED - counting
 *        down with fake timers, and 0 leaving the button enabled immediately.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Finding F1 - updated the OTP_RESEND_LIMIT test for the err.message-based display
 *        (mocked rejection now includes a message), and added cases for "about an hour",
 *        "about 4 hours" and "about a day" to show any server wording renders verbatim.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { createRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ResendButton from '../../src/components/ResendButton'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

// The countdown re-schedules its own setTimeout from a useEffect on every render, so each
// second must be flushed (and its effect committed) individually rather than jumped in bulk.
const tickSeconds = (n) => {
  for (let i = 0; i < n; i++) act(() => vi.advanceTimersByTime(1000))
}

describe('ResendButton (Stage 25 regression)', () => {
  it('on OTP_RESEND_COOLDOWN, disables itself and counts down from retryAfterSeconds', async () => {
    const onResend = vi.fn().mockRejectedValue({ code: 'OTP_RESEND_COOLDOWN', retryAfterSeconds: 3 })
    render(<ResendButton onResend={onResend} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })

    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button')).toHaveTextContent('Resend in 3s')

    tickSeconds(3)
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('on OTP_RESEND_LIMIT, shows err.message with no countdown', async () => {
    const message = "You've reached the resend limit. Please try again in about an hour."
    const onResend = vi.fn().mockRejectedValue({ code: 'OTP_RESEND_LIMIT', message })
    render(<ResendButton onResend={onResend} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(message)).toBeInTheDocument()
  })

  it.each([
    "You've reached the resend limit. Please try again in about an hour.",
    "You've reached the resend limit. Please try again in about 4 hours.",
    "You've reached the resend limit. Please try again in about a day.",
  ])('on OTP_RESEND_LIMIT, renders the server message %s verbatim', async (message) => {
    const onResend = vi.fn().mockRejectedValue({ code: 'OTP_RESEND_LIMIT', message })
    render(<ResendButton onResend={onResend} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })

    expect(screen.getByText(message)).toBeInTheDocument()
  })

  it('hands any other error to onError', async () => {
    const err = { code: 'NO_PENDING_REGISTRATION' }
    const onResend = vi.fn().mockRejectedValue(err)
    const onError = vi.fn()
    render(<ResendButton onResend={onResend} onError={onError} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })

    expect(onError).toHaveBeenCalledWith(err)
  })

  it('startCooldown(seconds) disables the button and counts down (Stage 25b, driven by a parent on OTP_ATTEMPTS_EXCEEDED)', () => {
    const ref = createRef()
    render(<ResendButton ref={ref} onResend={vi.fn()} />)

    act(() => ref.current.startCooldown(5))
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button')).toHaveTextContent('Resend in 5s')

    tickSeconds(5)
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('startCooldown(0) leaves the button enabled immediately', () => {
    const ref = createRef()
    render(<ResendButton ref={ref} onResend={vi.fn()} />)

    act(() => ref.current.startCooldown(0))
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('initialCooldown seeds the countdown on mount, for a parent that remounts this component (Stage 25b fallback)', () => {
    render(<ResendButton onResend={vi.fn()} initialCooldown={6} />)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button')).toHaveTextContent('Resend in 6s')

    tickSeconds(6)
    expect(screen.getByRole('button')).not.toBeDisabled()
  })
})
