import { useEffect, useRef } from 'react'

type OtpInputProps = {
  value: string[]
  onChange: (value: string[]) => void
  onComplete?: (code: string) => void
  focusFirst?: number
  disabled?: boolean
  invalid?: boolean
}

const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 6)

export function OtpInput({ value, onChange, onComplete, focusFirst = 0, disabled = false, invalid = false }: OtpInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? '')

  const focus = (index: number) => inputs.current[index]?.focus()
  useEffect(() => { focus(0) }, [focusFirst])
  const replaceAt = (index: number, digit: string) => {
    const next = digits.slice()
    next[index] = digit
    onChange(next)
    if (next.every(value => /^\d$/.test(value))) onComplete?.(next.join(''))
  }
  const paste = (index: number, raw: string) => {
    const pasted = digitsOnly(raw)
    if (!pasted) return
    const next = digits.slice()
    pasted.split('').forEach((digit, offset) => {
      if (index + offset < 6) next[index + offset] = digit
    })
    onChange(next)
    focus(Math.min(index + pasted.length, 5))
    if (next.every(value => /^\d$/.test(value))) onComplete?.(next.join(''))
  }

  return <div className="otp-group" role="group" aria-label="Verification code">
    {digits.map((digit, index) => <input
      key={index}
      ref={element => { inputs.current[index] = element }}
      className="otp-digit"
      inputMode="numeric"
      autoFocus={index === 0}
      autoComplete={index === 0 ? 'one-time-code' : 'off'}
      aria-label={`Verification code digit ${index + 1} of 6`}
      aria-invalid={invalid}
      disabled={disabled}
      maxLength={1}
      value={digit}
      onChange={event => {
        const entered = digitsOnly(event.target.value)
        if (entered.length > 1) { paste(index, entered); return }
        replaceAt(index, entered)
        if (entered && index < 5) focus(index + 1)
      }}
      onPaste={event => { event.preventDefault(); paste(index, event.clipboardData.getData('text')) }}
      onKeyDown={event => {
        if (event.key === 'Backspace' && !digit && index > 0) focus(index - 1)
        if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); focus(index - 1) }
        if (event.key === 'ArrowRight' && index < 5) { event.preventDefault(); focus(index + 1) }
        if (event.key === 'Enter') {
          event.preventDefault()
          if (index < 5) focus(index + 1)
          else onComplete?.(digits.join(''))
        }
      }}
    />)}
  </div>
}
