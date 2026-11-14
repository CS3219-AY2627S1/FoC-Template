/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Tests for PasswordInput (per instructions.md Stage 21b's Tests section): type
 *        switching, no form submission on toggle, independence between two instances, ARIA
 *        attributes, value preservation across a toggle, ref forwarding, and pass-through of
 *        arbitrary input props.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { createRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PasswordInput from '../../src/components/PasswordInput'

// A thin controlled-input harness, matching how every page actually uses PasswordInput
// (value + onChange from its own state), rather than testing an uncontrolled instance.
function ControlledPasswordInput(props) {
  const [value, setValue] = useState(props.initialValue ?? '')
  return <PasswordInput value={value} onChange={(e) => setValue(e.target.value)} {...props} />
}

describe('PasswordInput (Stage 21b)', () => {
  it('defaults to type="password" and switches to type="text" on toggle, back on a second click', () => {
    const { container } = render(<ControlledPasswordInput />)
    const input = container.querySelector('input')
    expect(input).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('updates aria-pressed and aria-label together as it toggles', () => {
    render(<ControlledPasswordInput />)
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(toggle)
    const toggled = screen.getByRole('button', { name: 'Hide password' })
    expect(toggled).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not submit an enclosing form when the toggle is clicked', () => {
    const onSubmit = vi.fn((e) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <ControlledPasswordInput />
      </form>,
    )

    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle).toHaveAttribute('type', 'button')

    fireEvent.click(toggle)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('preserves the field value across a toggle', () => {
    const { container } = render(<ControlledPasswordInput />)
    const input = container.querySelector('input')

    fireEvent.change(input, { target: { value: 'hunter2' } })
    expect(input.value).toBe('hunter2')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input.value).toBe('hunter2')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input.value).toBe('hunter2')
  })

  it('toggles two instances independently', () => {
    render(
      <>
        <ControlledPasswordInput />
        <ControlledPasswordInput />
      </>,
    )

    const toggles = screen.getAllByRole('button', { name: 'Show password' })
    expect(toggles).toHaveLength(2)

    fireEvent.click(toggles[0])

    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Hide password' })).toHaveLength(1)
  })

  it('forwards the ref to the underlying input element', () => {
    const ref = createRef()
    render(<PasswordInput ref={ref} value="" onChange={() => {}} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('passes through arbitrary input props and sets fixed autocomplete-hardening attributes', () => {
    const { container } = render(
      <ControlledPasswordInput autoComplete="new-password" required placeholder="Password" />,
    )
    const input = container.querySelector('input')
    expect(input).toHaveAttribute('autocomplete', 'new-password')
    expect(input).toHaveAttribute('placeholder', 'Password')
    expect(input).toHaveAttribute('required')
    expect(input).toHaveAttribute('autocapitalize', 'none')
    expect(input).toHaveAttribute('autocorrect', 'off')
    expect(input).toHaveAttribute('spellcheck', 'false')
  })
})
