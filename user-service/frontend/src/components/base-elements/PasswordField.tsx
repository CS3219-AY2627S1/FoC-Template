// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { useState } from 'react'
import { TextButton } from '@relay/ui'

export function PasswordField({
  value,
  onChange,
  autoComplete,
  label = 'Password',
  required = true,
}: {
  value: string
  onChange: (value: string) => void
  autoComplete: string
  label?: string
  required?: boolean
}) {
  const [visible, setVisible] = useState(false)

  return (
    <label>
      {label}
      <span className="user-password-field">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required={required}
        />
        <TextButton
          className="password-toggle"
          withBounce={false}
          onClick={() => setVisible((isVisible) => !isVisible)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? 'Hide' : 'Show'}
        </TextButton>
      </span>
    </label>
  )
}
