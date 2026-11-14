/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Created a reusable show/hide password input per instructions.md Stage 21b: a
 *        forwardRef wrapper around a plain <input> with an in-field toggle button that
 *        switches the input's type between "password" and "text". Each instance manages its
 *        own visibility state independently.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

const PasswordInput = forwardRef(function PasswordInput({ className = '', ...rest }, ref) {
  const [visible, setVisible] = useState(false)

  return (
    <span className="relative block">
      <input
        {...rest}
        ref={ref}
        type={visible ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={className + ' pr-11'}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-btn text-ink-40 hover:text-ink"
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </span>
  )
})

export default PasswordInput
