/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Created the /register page, per instructions.md Stage 16c: a two-step page (form,
 *        then OTP) starting at the step/email carried in router state when Login.jsx redirects
 *        here for an unverified account. Uses the shared ResendButton (with its new `label`
 *        prop) for both the normal "Resend code" position below the boxes and the "Send a new
 *        code" position at the top shown only when arriving from login, so there is a single
 *        cooldown/limit state rather than two independent ones.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Replaced the raw password input with PasswordInput (Stage 21b) for a show/hide toggle.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Stage 25b of instructions.md - on OTP_ATTEMPTS_EXCEEDED the boxes now clear, disable
 *        (otpDead) and start the resend countdown from err.retryAfterSeconds via the new
 *        resendRef.startCooldown; on OTP_EXPIRED the boxes clear/refocus but stay enabled, same
 *        as INVALID_OTP. A successful resend re-enables and clears the boxes and the error.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import FieldError from '../components/FieldError'
import FormBanner from '../components/FormBanner'
import Logo from '../components/Logo'
import OtpInput from '../components/OtpInput'
import PasswordInput from '../components/PasswordInput'
import ResendButton from '../components/ResendButton'
import * as authApi from '../api/auth'
import { describeError, errorMessages } from '../api/errorMessages'
import {
  EMAIL_MESSAGE,
  PASSWORD_MESSAGE,
  USERNAME_MESSAGE,
  isValidEmail,
  isValidPassword,
  isValidUsername,
} from '../utils/validation'

const validators = {
  username: (value) => (isValidUsername(value) ? '' : USERNAME_MESSAGE),
  email: (value) => (isValidEmail(value) ? '' : EMAIL_MESSAGE),
  password: (value) => (isValidPassword(value) ? '' : PASSWORD_MESSAGE),
}

export default function Register() {
  const location = useLocation()
  const navigate = useNavigate()
  const initial = location.state ?? {}
  // Fixed at mount: whether this visit came from Login.jsx's ACCOUNT_NOT_VERIFIED redirect, not
  // from the form step finishing registration on this same page.
  const [arrivedFromLogin] = useState(initial.step === 'otp')

  const [step, setStep] = useState(initial.step === 'otp' ? 'otp' : 'form')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState(initial.email ?? '')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({ username: '', email: '', password: '' })
  const [showLoginHint, setShowLoginHint] = useState(false)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const [otpError, setOtpError] = useState('')
  const [otpBannerError, setOtpBannerError] = useState('')
  const [otpBusy, setOtpBusy] = useState(false)
  const [otpDead, setOtpDead] = useState(false)
  const otpRef = useRef(null)
  const resendRef = useRef(null)

  const canVerify = isValidEmail(email)

  const handleFieldChange = (name, value) => {
    if (name === 'username') setUsername(value)
    if (name === 'email') setEmail(value)
    if (name === 'password') setPassword(value)
    setFieldErrors((prev) => ({ ...prev, [name]: '' }))
    setShowLoginHint(false)
  }

  const handleBlur = (name, value) => {
    setFieldErrors((prev) => ({ ...prev, [name]: validators[name](value) }))
  }

  const onSubmitForm = async (e) => {
    e.preventDefault()
    const errors = {
      username: validators.username(username),
      email: validators.email(email),
      password: validators.password(password),
    }
    setFieldErrors(errors)
    if (Object.values(errors).some(Boolean)) return

    setFormError('')
    setShowLoginHint(false)
    setBusy(true)
    try {
      await authApi.register({ username, email, password })
      setStep('otp')
    } catch (err) {
      if (err.code === 'USERNAME_TAKEN') {
        setFieldErrors((prev) => ({ ...prev, username: errorMessages.USERNAME_TAKEN.message }))
        setShowLoginHint(true)
      } else if (err.code === 'EMAIL_TAKEN') {
        setFieldErrors((prev) => ({ ...prev, email: errorMessages.EMAIL_TAKEN.message }))
        setShowLoginHint(true)
      } else {
        setFormError(describeError(err).message)
      }
    } finally {
      setBusy(false)
    }
  }

  const onOtpComplete = async (code) => {
    setOtpError('')
    setOtpBannerError('')
    setOtpBusy(true)
    try {
      await authApi.verifyOtp({ email, otp: code, purpose: 'registration' })
      navigate('/login', { state: { successMessage: 'Account verified. You can now log in.' } })
    } catch (err) {
      if (err.code === 'INVALID_OTP') {
        otpRef.current?.reset()
        setOtpError(errorMessages.INVALID_OTP.message)
      } else if (err.code === 'OTP_EXPIRED') {
        otpRef.current?.reset()
        setOtpError(errorMessages.OTP_EXPIRED.message)
      } else if (err.code === 'OTP_ATTEMPTS_EXCEEDED') {
        otpRef.current?.reset()
        setOtpDead(true)
        setOtpError(errorMessages.OTP_ATTEMPTS_EXCEEDED.message)
        resendRef.current?.startCooldown(err.retryAfterSeconds ?? 0)
      } else {
        setOtpBannerError(describeError(err).message)
      }
    } finally {
      setOtpBusy(false)
    }
  }

  const onResend = async () => {
    await authApi.resendOtp({ email, purpose: 'registration' })
    setOtpDead(false)
    setOtpError('')
    setOtpBannerError('')
    otpRef.current?.reset()
  }
  const onResendError = (err) => setOtpBannerError(describeError(err).message)

  if (step === 'otp') {
    return (
      <div className="page-width page-gutter flex min-h-[calc(100vh-4rem)] items-center justify-center py-10">
        <div className="w-full max-w-[440px]">
          <Logo asLink={false} />
          <h1 className="font-display mt-5 text-2xl font-bold text-ink">Verify your email</h1>
          <p className="mt-2 text-sm text-ink-70">Enter the 6-digit code we sent to your email.</p>

          {arrivedFromLogin && (
            <div className="mt-4 rounded-card border border-line bg-surface-alt p-3">
              <p className="text-sm text-ink-70">
                Your original code has probably expired by now.
              </p>
              <div className="mt-2">
                <ResendButton
                  ref={resendRef}
                  label="Send a new code"
                  onResend={onResend}
                  onError={onResendError}
                  disabled={otpBusy || !canVerify}
                />
              </div>
            </div>
          )}

          <div className="mt-4">
            <FormBanner type="error" message={otpBannerError} />
          </div>

          {arrivedFromLogin && !initial.email && (
            <label className="mb-4 block">
              <span className="text-sm font-medium text-ink">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="mt-1.5 h-11 w-full rounded-btn border border-line bg-surface-alt px-3 text-base text-ink"
              />
            </label>
          )}

          <OtpInput
            ref={otpRef}
            onComplete={onOtpComplete}
            disabled={otpBusy || !canVerify || otpDead}
          />
          <FieldError message={otpError} />

          {!arrivedFromLogin && (
            <div className="mt-4">
              <ResendButton
                ref={resendRef}
                onResend={onResend}
                onError={onResendError}
                disabled={otpBusy || !canVerify}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="page-width page-gutter flex min-h-[calc(100vh-4rem)] items-center justify-center py-10">
      <div className="w-full max-w-[440px]">
        <Logo asLink={false} />
        <h1 className="font-display mt-5 text-2xl font-bold text-ink">Create your account</h1>

        <div className="mt-4">
          <FormBanner type="error" message={formError} />
        </div>

        <form className="mt-2 space-y-4" onSubmit={onSubmitForm}>
          <label className="block">
            <span className="text-sm font-medium text-ink">Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => handleFieldChange('username', e.target.value)}
              onBlur={(e) => handleBlur('username', e.target.value)}
              autoComplete="username"
              required
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-surface-alt px-3 text-base text-ink"
            />
            <FieldError message={fieldErrors.username} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => handleFieldChange('email', e.target.value)}
              onBlur={(e) => handleBlur('email', e.target.value)}
              autoComplete="email"
              required
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-surface-alt px-3 text-base text-ink"
            />
            <FieldError message={fieldErrors.email} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Password</span>
            <PasswordInput
              value={password}
              onChange={(e) => handleFieldChange('password', e.target.value)}
              onBlur={(e) => handleBlur('password', e.target.value)}
              autoComplete="new-password"
              required
              className="mt-1.5 h-11 w-full rounded-btn border border-line bg-surface-alt px-3 text-base text-ink"
            />
            <FieldError message={fieldErrors.password} />
          </label>

          {showLoginHint && (
            <p className="text-sm text-ink-70">
              Already signed up?{' '}
              <Link to="/login" className="font-medium text-blue hover:underline">
                Log in to finish verifying
              </Link>
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-ink-70">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-blue hover:underline">
            Log in
          </Link>
        </div>
      </div>
    </div>
  )
}
