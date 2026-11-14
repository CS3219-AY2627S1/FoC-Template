/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Tests for OtpInput, per instructions.md Stage 25's Tests section: digit entry,
 *        auto-advance, backspace, paste-fill with auto-submit, the imperative reset() (clears
 *        and refocuses the first box), and the existing disabled prop keeping the boxes empty
 *        and inert (the "dead" state Stage 25b reuses for OTP_ATTEMPTS_EXCEEDED).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { createRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OtpInput from '../../src/components/OtpInput'

function boxes() {
  return screen.getAllByRole('textbox')
}

describe('OtpInput (Stage 25 regression)', () => {
  it('auto-advances on each digit and calls onComplete once all 6 are filled', () => {
    const onComplete = vi.fn()
    render(<OtpInput onComplete={onComplete} />)
    const inputs = boxes()

    '123456'.split('').forEach((digit, i) => {
      fireEvent.change(inputs[i], { target: { value: digit } })
    })

    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('backspace on an empty box moves focus back', () => {
    render(<OtpInput onComplete={() => {}} />)
    const inputs = boxes()
    fireEvent.change(inputs[0], { target: { value: '1' } })
    inputs[1].focus()
    fireEvent.keyDown(inputs[1], { key: 'Backspace' })
    expect(inputs[0]).toHaveFocus()
  })

  it('pasting 6 digits fills every box and auto-submits', () => {
    const onComplete = vi.fn()
    render(<OtpInput onComplete={onComplete} />)
    const inputs = boxes()
    fireEvent.paste(inputs[0], { clipboardData: { getData: () => '987654' } })
    expect(inputs.map((i) => i.value)).toEqual(['9', '8', '7', '6', '5', '4'])
    expect(onComplete).toHaveBeenCalledWith('987654')
  })

  it('reset() clears every box and refocuses the first (used on INVALID_OTP/OTP_EXPIRED)', () => {
    const ref = createRef()
    render(<OtpInput ref={ref} onComplete={() => {}} />)
    const inputs = boxes()
    '123456'.split('').forEach((digit, i) => fireEvent.change(inputs[i], { target: { value: digit } }))

    act(() => ref.current.reset())

    expect(boxes().map((i) => i.value)).toEqual(['', '', '', '', '', ''])
    expect(boxes()[0]).toHaveFocus()
  })

  it('disabled keeps every box empty and non-interactive (the Stage 25b "dead" state)', () => {
    const onComplete = vi.fn()
    render(<OtpInput onComplete={onComplete} disabled />)
    const inputs = boxes()
    inputs.forEach((input) => expect(input).toBeDisabled())
  })
})
