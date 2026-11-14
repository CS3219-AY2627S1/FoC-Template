/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Created the /forgot-password page, per instructions.md Stage 16d: a three-step page
 *        (email, OTP, new password) whose email and verified OTP live only in component state,
 *        so a reload restarts at step 1 as specified. Step 3's errors (e.g. the code expiring
 *        between steps) send the user back to step 2 with the error shown there, reusing the
 *        same otpError/otpBannerError state rather than inventing a parallel error channel.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Replaced the raw password input with PasswordInput (Stage 21b) for a show/hide toggle.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 25b of instructions.md - extracted the OTP box clear/disable/countdown side
 *        effect into applyOtpBoxEffect, used both by onOtpComplete and by onSubmitPassword's
 *        step-3-to-step-2 fallback, so step 2 starts disabled with the countdown running when
 *        resetPassword itself returns OTP_ATTEMPTS_EXCEEDED (the 5th failed attempt), not just
 *        when checkOtp's own verify step does. Step 3 has no OTP step, so the fallback's
 *        ResendButton isn't mounted yet when the error arrives (resendRef is null); added a
 *        resendCooldown state passed as ResendButton's new initialCooldown prop so the
 *        countdown is correct the moment it (re)mounts in step 2, alongside the
 *        startCooldown ref call for the already-mounted case (onOtpComplete). A successful
 *        resend re-enables and clears the boxes.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Finding F1 - requestOtpEmail's OTP_RESEND_LIMIT branch now shows err.message instead
 *        of errorMessages.OTP_RESEND_LIMIT.message, so the wait it names matches the server's.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import FieldError from '../components/FieldError'
import FormBanner from '../components/FormBanner'
import Logo from '../components/Logo'
import OtpInput from '../components/OtpInput'
import PasswordInput from '../components/PasswordInput'
import ResendButton from '../components/ResendButton'
import * as authApi from '../api/auth'
import { describeError, errorMessages } from '../api/errorMessages'
import { EMAIL_MESSAGE, PASSWORD_MESSAGE, isValidEmail, isValidPassword } from '../utils/validation'

const cooldownText = (err) =>
  errorMessages.OTP_RESEND_COOLDOWN.message + (err.retryAfterSeconds ? ' (' + err.retryAfterSeconds + 's)' : '')

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState('email') // 'email' | 'otp' | 'password'

  const [email, setEmail] = useState('')
  const [emailFieldError, setEmailFieldError] = useState('')
  const [emailFormError, setEmailFormError] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)

  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [otpBannerError, setOtpBannerError] = useState('')
  const [otpBusy, setOtpBusy] = useState(false)
  const [otpDead, setOtpDead] = useState(false)
  // ResendButton's initial cooldown on (re)mount: needed because the step-3-to-step-2
  // fallback below unmounts/remounts it (step 3 has no OTP step, so resendRef is null there).
  const [resendCooldown, setResendCooldown] = useState(0)
  const otpRef = useRef(null)
  const resendRef = useRef(null)

  const [newPassword, setNewPassword] = useState('')
  const [passwordFieldError, setPasswordFieldError] = useState('')
  const [passwordFormError, setPasswordFormError] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)

  const requestOtpEmail = async () => {
    try {
      await authApi.forgotPassword({ email })
      return true
    } catch (err) {
      if (err.code === 'EMAIL_NOT_FOUND') {
        setEmailFieldError(errorMessages.EMAIL_NOT_FOUND.message)
      } else if (err.code === 'ACCOUNT_NOT_VERIFIED') {
        setEmailFormError(errorMessages.ACCOUNT_NOT_VERIFIED.message)
      } else if (err.code === 'OTP_RESEND_COOLDOWN') {
        setEmailFormError(cooldownText(err))
      } else if (err.code === 'OTP_RESEND_LIMIT') {
        setEmailFormError(err.message)
      } else {
        setEmailFormError(describeError(err).message)
      }
      return false
    }
  }

  const onSubmitEmail = async (e) => {
    e.preventDefault()
    const error = isValidEmail(email) ? '' : EMAIL_MESSAGE
    setEmailFieldError(error)
    if (error) return

    setEmailFormError('')
    setEmailBusy(true)
    try {
      if (await requestOtpEmail()) setStep('otp')
    } finally {
      setEmailBusy(false)
    }
  }

  // Clears/refocuses or disables the OTP boxes per the code's failure reason, and (for
  // OTP_ATTEMPTS_EXCEEDED) starts the resend countdown. Shared by onOtpComplete and
  // onSubmitPassword's step-3-to-step-2 fallback, since resetPassword's own checkOtp call can
  // also be the 5th failed attempt. Error text display is left to each caller, since the
  // fallback already shows it as a banner (step 3's error channel) rather than a field error.
  const applyOtpBoxEffect = (err) => {
    otpRef.current?.reset()
    if (err.code === 'OTP_ATTEMPTS_EXCEEDED') {
      const seconds = err.retryAfterSeconds ?? 0
      setOtpDead(true)
      setResendCooldown(seconds)
      resendRef.current?.startCooldown(seconds)
    }
  }

  const onOtpComplete = async (code) => {
    setOtpError('')
    setOtpBannerError('')
    setOtpBusy(true)
    try {
      await authApi.verifyOtp({ email, otp: code, purpose: 'forgot_password' })
      setOtp(code)
      setStep('password')
    } catch (err) {
      if (err.code === 'INVALID_OTP' || err.code === 'OTP_EXPIRED' || err.code === 'OTP_ATTEMPTS_EXCEEDED') {
        applyOtpBoxEffect(err)
        setOtpError(errorMessages[err.code].message)
      } else {
        setOtpBannerError(describeError(err).message)
      }
    } finally {
      setOtpBusy(false)
    }
  }

  const onResendOtp = async () => {
    await authApi.resendOtp({ email, purpose: 'forgot_password' })
    setOtpDead(false)
    setResendCooldown(0)
    setOtpError('')
    setOtpBannerError('')
    otpRef.current?.reset()
  }
  const onResendError = (err) => setOtpBannerError(describeError(err).message)

  const onSubmitPassword = async (e) => {
    e.preventDefault()
    const error = isValidPassword(newPassword) ? '' : PASSWORD_MESSAGE
    setPasswordFieldError(error)
    if (error) return

    setPasswordFormError('')
    setPasswordBusy(true)
    try {
      await authApi.resetPassword({ email, otp, newPassword })
      navigate('/login', {
        state: { successMessage: 'Password reset. Please log in with your new password.' },
      })
    } catch (err) {
      if (err.code === 'INVALID_OTP' || err.code === 'OTP_EXPIRED' || err.code === 'OTP_ATTEMPTS_EXCEEDED') {
        applyOtpBoxEffect(err)
        setOtpBannerError(errorMessages[err.code].message)
        setStep('otp')
      } else {
        setPasswordFormError(describeError(err).message)
      }
    } finally {
      setPasswordBusy(false)
    }
  }

  if (step === 'otp') {
    return (
      <div className="page-width page-gutter flex min-h-[calc(100vh-4rem)] items-center justify-center py-10">
        <div className="w-full max-w-[440px]">
          <Logo asLink={false} />
          <h1 className="font-display mt-5 text-2xl font-bold text-ink">Enter the code</h1>
          <p className="mt-2 text-sm text-ink-70">Enter the 6-digit code we sent to {email}.</p>

          <div className="mt-4">
            <FormBanner type="error" message={otpBannerError} />
          </div>

          <OtpInput ref={otpRef} onComplete={onOtpComplete} disabled={otpBusy || otpDead} />
          <FieldError message={otpError} />

          <div className="mt-4">
            <ResendButton
              ref={resendRef}
              onResend={onResendOtp}
              onError={onResendError}
              disabled={otpBusy}
              initialCooldown={resendCooldown}
            />
          </div>
        </div>
      </div>
    )
  }

  if (step === 'password') {
    return (
      <div className="page-width page-gutter flex min-h-[calc(100vh-4rem)] items-center justify-center py-10">
        <div className="w-full max-w-[440px]">
          <Logo asLink={false} />
          <h1 className="font-display mt-5 text-2xl font-bold text-ink">Set a new password</h1>

          <div className="mt-4">
            <FormBanner type="error" message={passwordFormError} />
          </div>

          <form className="mt-2 space-y-4" onSubmit={onSubmitPassword}>
            <label className="block">
              <span className="text-sm font-medium text-ink">New password</span>
              <PasswordInput
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setPasswordFieldError('')
                }}
                onBlur={() => setPasswordFieldError(isValidPassword(newPassword) ? '' : PASSWORD_MESSAGE)}
                autoComplete="new-password"
                required
                className="mt-1.5 h-11 w-full rounded-btn border border-line bg-surface-alt px-3 text-base text-ink"
              />
              <FieldError message={passwordFieldError} />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={passwordBusy}>
              {passwordBusy ? 'Resetting…' : 'Reset password'}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="page-width page-gutter flex min-h-[calc(100vh-4rem)] items-center justify-center py-10">
      <div className="w-full max-w-[440px]">
        <Logo asLink={false} />
        <h1 className="font-display mt-5 text-2xl font-bold text-ink">Reset your password</h1>
        <p className="mt-2 text-sm text-ink-70">Enter your email and we'll send you a code.</p>

        <div className="mt-4">
          <FormBanner type="error" message={emailFormError} />
        </div>

        <form className="mt-2 space-y-4" onSubmit={onSubmitEmail}>
          <label className="block">
            <span className="text-sm font-medium text-ink">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setEmailFieldError('')
              }}
              onBlur={() => setEmailFieldError(isValidEmail(email) ? '' : EMAIL_MESSAGE)}
              autoComplete="email"
              required
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-surface-alt px-3 text-base text-ink"
            />
            <FieldError message={emailFieldError} />
          </label>
          <Button type="submit" size="lg" className="w-full" disabled={emailBusy}>
            {emailBusy ? 'Sending…' : 'Send code'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-ink-70">
          <Link to="/login" className="font-medium text-blue hover:underline">
            Back to log in
          </Link>
        </div>
      </div>
    </div>
  )
}
