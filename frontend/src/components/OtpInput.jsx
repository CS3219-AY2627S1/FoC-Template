/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Created OtpInput, the 6-box OTP input used by registration, forgot-password and
 *        account-change OTP steps, per instructions.md Stage 16b and its decisions table (6
 *        boxes, digits only, auto-advance, backspace moves back, paste fills and
 *        auto-submits, wrong code clears and refocuses the first box via the parent calling
 *        the exposed `reset()`).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'

const LENGTH = 6
const EMPTY = Array(LENGTH).fill('')

const OtpInput = forwardRef(function OtpInput({ onComplete, disabled = false }, ref) {
  const [values, setValues] = useState(EMPTY)
  const inputs = useRef([])

  useImperativeHandle(ref, () => ({
    reset: () => {
      setValues(EMPTY)
      inputs.current[0]?.focus()
    },
  }))

  const focusAt = (i) => inputs.current[i]?.focus()

  const commitIfComplete = (next) => {
    if (next.every((d) => d !== '')) onComplete(next.join(''))
  }

  const handleChange = (i, raw) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    const next = [...values]
    next[i] = digit
    setValues(next)
    if (digit && i < LENGTH - 1) focusAt(i + 1)
    commitIfComplete(next)
  }

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !values[i] && i > 0) focusAt(i - 1)
  }

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH)
    if (!text) return
    e.preventDefault()
    const next = [...EMPTY]
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setValues(next)
    focusAt(Math.min(text.length, LENGTH - 1))
    commitIfComplete(next)
  }

  return (
    <div className="flex gap-2" onPaste={handlePaste}>
      {values.map((v, i) => (
        <input
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          ref={(el) => {
            inputs.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={v}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          aria-label={'Digit ' + (i + 1) + ' of ' + LENGTH}
          className="h-14 w-11 rounded-btn border border-line bg-surface text-center text-xl font-semibold text-ink focus-visible:border-ink disabled:bg-surface-alt disabled:text-ink-40 sm:w-12"
        />
      ))}
    </div>
  )
})

export default OtpInput
