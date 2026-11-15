/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: The author's profile page: username, email, joined date and (for admins only) role,
 *        with the display name edited in place and saved; the header updates at once.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import * as userApi from '../api/userApi'
import { useAuth } from '../auth/authContext'
import { errorText } from '../admin/errors'
import { sgDate } from '../admin/format'
import { TopBar } from '../components/TopBar'
import { useToast } from '../components/toast/toastContext'

const DISPLAY_NAME_MAX = 50 // same rule as the User Service (US-F7.1.2)

export function ProfilePage() {
  const { user, updateUser } = useAuth()
  const { showToast } = useToast()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-read once: the stored user may predate the email/joined fields or another tab's change
  useEffect(() => {
    let current = true
    userApi.whoami().then((me) => { if (current) updateUser?.(me) }, () => undefined)
    return () => { current = false }
  }, [updateUser])

  if (!user) return null
  const trimmed = displayName.trim()
  const unchanged = trimmed === user.displayName
  const invalid = trimmed.length < 1 || trimmed.length > DISPLAY_NAME_MAX

  async function save(event: FormEvent) {
    event.preventDefault()
    if (invalid) { setError(`Your display name must be 1–${DISPLAY_NAME_MAX} characters.`); return }
    setSaving(true)
    setError(null)
    try {
      const updated = await userApi.updateDisplayName(trimmed)
      updateUser?.(updated)
      setDisplayName(updated.displayName)
      showToast('Display name saved.', 'success')
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? `Your display name must be 1–${DISPLAY_NAME_MAX} characters.` : errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return <>
    <TopBar />
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-600">Your account</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">Profile</h1>

      <form noValidate onSubmit={save} aria-label="Change display name" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium text-navy-900">
          Display name
          <input
            value={displayName}
            maxLength={DISPLAY_NAME_MAX}
            onChange={(e) => { setDisplayName(e.target.value); setError(null) }}
            aria-invalid={error !== null}
            aria-describedby="display-name-help display-name-error"
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900"
          />
        </label>
        <p id="display-name-help" className="mt-1 text-xs text-slate-500">
          Shown to other members instead of your username. {trimmed.length}/{DISPLAY_NAME_MAX}
        </p>
        <p id="display-name-error" role={error ? 'alert' : undefined} className="mt-1 text-sm text-red-700">{error}</p>
        <div className="mt-3 flex gap-2">
          <button type="submit" disabled={saving || unchanged} className="min-h-11 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          {!unchanged && !saving && (
            <button type="button" onClick={() => { setDisplayName(user.displayName); setError(null) }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-navy-50">
              Undo
            </button>
          )}
        </div>
      </form>

      <section aria-label="Account details" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500">Username</dt><dd className="font-medium text-navy-900">@{user.username}</dd></div>
          <div><dt className="text-xs text-slate-500">Email</dt><dd className="break-all font-medium text-navy-900">{user.email ?? '…'}</dd></div>
          <div><dt className="text-xs text-slate-500">Joined</dt><dd className="font-medium text-navy-900">{user.createdAt ? sgDate(user.createdAt) : '…'}</dd></div>
          {/* Only admins see their role, as in the header */}
          {user.role === 'ADMINISTRATOR' && <div><dt className="text-xs text-slate-500">Role</dt><dd className="font-medium text-navy-900">Administrator</dd></div>}
        </dl>
        <p className="mt-4 text-xs text-slate-500">Your username and email can’t be changed here.</p>
      </section>
    </main>
  </>
}
