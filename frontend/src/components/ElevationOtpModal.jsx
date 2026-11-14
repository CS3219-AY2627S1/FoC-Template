/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Created ElevationOtpModal, per instructions.md Stage 27c's OTP-modal decisions: opens
 *        with a "Send code" button and sends nothing until it is clicked; the OTP step reuses
 *        OtpInput/ResendButton exactly as ForgotPassword.jsx/Register.jsx's OTP steps do (wrong
 *        code clears and refocuses the boxes; OTP_ATTEMPTS_EXCEEDED disables them and starts
 *        ResendButton's own cooldown via its ref; OTP_RESEND_COOLDOWN/OTP_RESEND_LIMIT are
 *        handled inside ResendButton itself). A successful verify stores the elevation token
 *        (utils/elevation.js) and calls onVerified with no arguments - the caller
 *        (useElevatedActionFlow) only needs to know elevation succeeded, not the raw token.
 *        Any of the three calls coming back 409 ALREADY_ELEVATED closes the modal and shows it
 *        as a toast, per the stage's error table; the caller's own elevation check (read fresh
 *        on its next action) corrects the button/timer state from here, so this component does
 *        not need to tell it anything further. The caller is responsible for mounting/
 *        unmounting this component (not a `visible` prop) so that closing and reopening always
 *        starts a fresh, nothing-sent 'ready' step, per the stage's rule.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Finding F1 - handleSend's OTP_RESEND_LIMIT branch now shows err.message instead of
 *        errorMessages.OTP_RESEND_LIMIT.message, so the wait it names matches the server's.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useRef, useState } from 'react'
import Button from './Button'
import FieldError from './FieldError'
import FormBanner from './FormBanner'
import OtpInput from './OtpInput'
import ResendButton from './ResendButton'
import { useToast } from './Toast'
import { resendAdminOtp, sendAdminOtp, verifyAdminOtp } from '../api/admin'
import { setElevationToken } from '../utils/elevation'
import { describeError, errorMessages } from '../api/errorMessages'

const cooldownText = (err) =>
  errorMessages.OTP_RESEND_COOLDOWN.message + (err.retryAfterSeconds ? ' (' + err.retryAfterSeconds + 's)' : '')

export default function ElevationOtpModal({ onClose, onVerified }) {
  const { showToast } = useToast()
  const [step, setStep] = useState('ready') // 'ready' | 'sent'
  const [sendError, setSendError] = useState('')
  const [sendBusy, setSendBusy] = useState(false)

  const [otpError, setOtpError] = useState('')
  const [otpBannerError, setOtpBannerError] = useState('')
  const [otpBusy, setOtpBusy] = useState(false)
  const [otpDead, setOtpDead] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const otpRef = useRef(null)
  const resendRef = useRef(null)

  const alreadyElevated = () => {
    showToast(errorMessages.ALREADY_ELEVATED.message, 'error')
    onClose()
  }

  const handleSend = async () => {
    setSendError('')
    setSendBusy(true)
    try {
      await sendAdminOtp()
      setStep('sent')
    } catch (err) {
      if (err.code === 'ALREADY_ELEVATED') {
        alreadyElevated()
      } else if (err.code === 'OTP_RESEND_COOLDOWN') {
        setSendError(cooldownText(err))
      } else if (err.code === 'OTP_RESEND_LIMIT') {
        setSendError(err.message)
      } else {
        setSendError(describeError(err).message)
      }
    } finally {
      setSendBusy(false)
    }
  }

  const onOtpComplete = async (code) => {
    setOtpError('')
    setOtpBannerError('')
    setOtpBusy(true)
    try {
      const { elevationToken } = await verifyAdminOtp(code)
      setElevationToken(elevationToken)
      onVerified()
    } catch (err) {
      if (err.code === 'ALREADY_ELEVATED') {
        alreadyElevated()
      } else if (err.code === 'INVALID_OTP' || err.code === 'OTP_EXPIRED') {
        otpRef.current?.reset()
        setOtpError(errorMessages[err.code].message)
      } else if (err.code === 'OTP_ATTEMPTS_EXCEEDED') {
        otpRef.current?.reset()
        setOtpDead(true)
        const seconds = err.retryAfterSeconds ?? 0
        setResendCooldown(seconds)
        resendRef.current?.startCooldown(seconds)
        setOtpError(errorMessages.OTP_ATTEMPTS_EXCEEDED.message)
      } else {
        setOtpBannerError(describeError(err).message)
      }
    } finally {
      setOtpBusy(false)
    }
  }

  const onResend = async () => {
    await resendAdminOtp()
    setOtpDead(false)
    setResendCooldown(0)
    setOtpError('')
    setOtpBannerError('')
    otpRef.current?.reset()
  }

  const onResendError = (err) => {
    if (err.code === 'ALREADY_ELEVATED') {
      alreadyElevated()
      return
    }
    setOtpBannerError(describeError(err).message)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-labelledby="elevation-otp-title"
        className="foc-fade relative w-full max-w-md rounded-t-card bg-surface p-5 shadow-modal sm:rounded-card"
      >
        <h2 id="elevation-otp-title" className="text-lg font-semibold text-ink">
          Verify your identity
        </h2>

        {step === 'ready' && (
          <>
            <p className="mt-2 text-sm text-ink-70">
              Send a verification code to your email to unlock admin actions for 15 minutes.
            </p>
            <FieldError message={sendError} />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={sendBusy}>
                {sendBusy ? 'Sending…' : 'Send code'}
              </Button>
            </div>
          </>
        )}

        {step === 'sent' && (
          <>
            <p className="mt-2 text-sm text-ink-70">Enter the 6-digit code we sent to your email.</p>

            <div className="mt-4">
              <FormBanner type="error" message={otpBannerError} />
            </div>

            <OtpInput ref={otpRef} onComplete={onOtpComplete} disabled={otpBusy || otpDead} />
            <FieldError message={otpError} />

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <ResendButton
                ref={resendRef}
                onResend={onResend}
                onError={onResendError}
                disabled={otpBusy}
                initialCooldown={resendCooldown}
              />
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
