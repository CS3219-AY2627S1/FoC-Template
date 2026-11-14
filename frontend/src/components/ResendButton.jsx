/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Created ResendButton, per instructions.md Stage 16b: during cooldown it disables
 *        itself with a countdown read from the service's Retry-After header (surfaced as
 *        err.retryAfterSeconds by api/http.js); on OTP_RESEND_LIMIT it disables itself and
 *        shows the limit text with no countdown, using errorMessages.js's OTP_RESEND_LIMIT
 *        entry so the wording stays centralised. Any other error is handed to the caller via
 *        onError (e.g. NO_PENDING_REGISTRATION, which the decisions table shows as a banner).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Added an optional `label` prop (default unchanged: "Resend code"), so Register.jsx
 *        can reuse the same cooldown/limit-aware control for its "Send a new code" button
 *        (instructions.md Stage 16c) without a second, separately-stateful resend control.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 25b of instructions.md - converted to forwardRef and exposed an imperative
 *        startCooldown(seconds) handle (same pattern as OtpInput's reset()), so a page can
 *        start the countdown itself from a 429 OTP_ATTEMPTS_EXCEEDED response's
 *        retryAfterSeconds, not only from this component's own resend call. 0 starts the
 *        button enabled immediately. Also added an initialCooldown prop, seeding the same
 *        state on mount: ForgotPassword's step-3-to-step-2 fallback unmounts this component
 *        (step 3 has no OTP step) before it can call startCooldown via the ref, so it needs
 *        the cooldown to already be correct the moment this component (re)mounts in step 2.
 *        The existing OTP_RESEND_COOLDOWN/OTP_RESEND_LIMIT handling inside handleClick is
 *        unchanged.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Finding F1 - replaced the `limitReached` boolean with `limitMessage` state holding
 *        the server's own err.message, so the displayed text matches whatever wait the backend
 *        reports instead of the hardcoded "about an hour" string in errorMessages.js.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Bug fix - handleClick now also calls setCooldown(DEFAULT_COOLDOWN_SECONDS) right
 *        after a successful onResend(), not only on the OTP_RESEND_COOLDOWN error path.
 *        Previously the countdown only appeared starting from the second click, because the
 *        success response carries no retryAfterSeconds and the first click's success path
 *        never set cooldown. DEFAULT_COOLDOWN_SECONDS (60) already matched the server's
 *        configured OTP_RESEND_COOLDOWN_SECONDS before this fix.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import Button from './Button'

const DEFAULT_COOLDOWN_SECONDS = 60

const ResendButton = forwardRef(function ResendButton(
  { onResend, onError, disabled = false, label = 'Resend code', initialCooldown = 0 },
  ref,
) {
  const [cooldown, setCooldown] = useState(initialCooldown)
  const [limitMessage, setLimitMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

  useImperativeHandle(ref, () => ({
    startCooldown: (seconds) => setCooldown(seconds),
  }))

  useEffect(() => {
    if (cooldown <= 0) return undefined
    timer.current = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer.current)
  }, [cooldown])

  const handleClick = async () => {
    setBusy(true)
    try {
      await onResend()
      setCooldown(DEFAULT_COOLDOWN_SECONDS)
    } catch (err) {
      if (err.code === 'OTP_RESEND_COOLDOWN') {
        setCooldown(err.retryAfterSeconds ?? DEFAULT_COOLDOWN_SECONDS)
      } else if (err.code === 'OTP_RESEND_LIMIT') {
        setLimitMessage(err.message)
      } else {
        onError?.(err)
      }
    } finally {
      setBusy(false)
    }
  }

  if (limitMessage) {
    return <p className="text-sm text-ink-40">{limitMessage}</p>
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={disabled || busy || cooldown > 0}
      onClick={handleClick}
    >
      {cooldown > 0 ? 'Resend in ' + cooldown + 's' : busy ? 'Sending…' : label}
    </Button>
  )
})

export default ResendButton
