/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Created the /unlock-account page, per instructions.md Stage 31d. Reads the token from
 *        the query string; a missing/empty token shows the invalid-link banner immediately and
 *        disables the button without any request, matching how an INVALID_UNLOCK_TOKEN
 *        response is shown once the button is pressed. Not wrapped in RequireAuth or ViewGate
 *        (like /login, /register, /forgot-password), so it stays reachable logged out and
 *        logged in without tripping the Stage 29 view redirect.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import FormBanner from '../components/FormBanner'
import Logo from '../components/Logo'
import { useToast } from '../components/Toast'
import * as authApi from '../api/auth'
import { describeError } from '../api/errorMessages'

export default function UnlockAccount() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [busy, setBusy] = useState(false)
  const [bannerError, setBannerError] = useState(token ? '' : describeError({ code: 'INVALID_UNLOCK_TOKEN' }).message)

  const onPress = async () => {
    setBusy(true)
    setBannerError('')
    try {
      const { code } = await authApi.unlockAccount(token)
      if (code === 'UNLOCKED') {
        navigate('/login')
        showToast('Your account has been unlocked. You can log in now.', 'success')
      } else {
        navigate('/login')
        showToast('Your account is no longer locked.', 'success')
      }
    } catch (err) {
      setBannerError(describeError(err).message)
      setBusy(false)
    }
  }

  return (
    <div className="page-width page-gutter flex min-h-[calc(100vh-4rem)] items-center justify-center py-10">
      <div className="w-full max-w-[440px]">
        <Logo asLink={false} />
        <h1 className="font-display mt-5 text-2xl font-bold text-ink">Unlock your account</h1>
        <p className="mt-2 text-sm text-ink-70">
          Your account was locked after too many failed attempts. Press the button below to unlock it.
        </p>

        <div className="mt-4">
          <FormBanner type="error" message={bannerError} />
        </div>

        <Button size="lg" className="w-full" disabled={!token || busy} onClick={onPress}>
          {busy ? 'Unlocking…' : 'Unlock my account'}
        </Button>
      </div>
    </div>
  )
}
