/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
 * Scope: Extracted the email eye-icon unmask logic that lived inline in AdminUsers.jsx (Stage
 *        20b, as amended by Stage 26e) into this shared hook, per instructions.md Stage 30's
 *        "Shared code" rule, so AdminUserTransactions.jsx's profile email can use the exact
 *        same behaviour: an unmasking click calls getFullEmail (no dialog, no reason, no
 *        elevation), a second click or a 60 s timer re-masks with no request, timers are
 *        cleared on re-mask and on unmount, a failure shows a toast via errorMessages.js and
 *        leaves the email masked. canUnmaskEmail (no icon for the caller's own row or a super
 *        admin) moved here unchanged. Behaviour on /admin/users is unchanged.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getFullEmail } from '../api/users'
import { describeError } from '../api/errorMessages'
import { useToast } from '../components/Toast'

// No eye icon for the caller's own email (already unmasked everywhere else) or a super
// admin's, per instructions.md Stage 20b (reaffirmed by Stage 30).
export function canUnmaskEmail(viewer, user) {
  return user.id !== viewer.id && user.role !== 'super admin'
}

export const UNMASK_TIMEOUT_MS = 60_000

/**
 * Per-user unmasked-email state, keyed by user id; absent = masked. Shared by AdminUsers.jsx
 * (one entry per row) and AdminUserTransactions.jsx (one entry, the profile).
 *
 * Returns:
 *  - unmaskedEmails: { [id]: fullEmail }
 *  - busyId: the id currently mid-flight on an unmask request (masked -> revealing), or null
 *  - isUnmasked(id)
 *  - toggle(user): re-mask if unmasked (no request); otherwise call getFullEmail and start
 *    the 60 s re-mask timer
 *  - remask(id), remaskAll(): clear state and timers without a request
 */
export function useEmailUnmask() {
  const { showToast } = useToast()
  const [unmaskedEmails, setUnmaskedEmails] = useState({})
  const timersRef = useRef({})
  const [busyId, setBusyId] = useState(null)

  const remask = useCallback((id) => {
    clearTimeout(timersRef.current[id])
    delete timersRef.current[id]
    setUnmaskedEmails((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const remaskAll = useCallback(() => {
    Object.values(timersRef.current).forEach(clearTimeout)
    timersRef.current = {}
    setUnmaskedEmails({})
  }, [])

  // Clear any still-running timers on unmount.
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout)
    }
  }, [])

  // Re-masking (already unmasked) sends no request. Revealing calls getFullEmail directly -
  // no confirmation/reason dialog (Stage 26 "Reasons" amendment) and no elevation (Stage 27).
  async function toggle(user) {
    if (user.id in unmaskedEmails) {
      remask(user.id)
      return
    }
    setBusyId(user.id)
    try {
      const { email } = await getFullEmail(user.id)
      setUnmaskedEmails((prev) => ({ ...prev, [user.id]: email }))
      timersRef.current[user.id] = setTimeout(() => remask(user.id), UNMASK_TIMEOUT_MS)
    } catch (err) {
      showToast(describeError(err).message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  return {
    unmaskedEmails,
    busyId,
    isUnmasked: (id) => id in unmaskedEmails,
    toggle,
    remask,
    remaskAll,
  }
}
