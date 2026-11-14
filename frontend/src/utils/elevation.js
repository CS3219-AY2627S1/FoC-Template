/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Created the elevation-token storage helper and two hooks, per instructions.md Stage
 *        27c. getElevationToken reads sessionStorage and validates the token's own `exp` claim
 *        (decoded, not verified - the service re-verifies it), clearing it if missing/expired,
 *        per the stage's "on load" and "rejected token" rules. useElevation ticks a 1s timer so
 *        AdminUsers.jsx's button/timer re-render as the window counts down and disappears at
 *        zero. useElevatedActionFlow is the not-elevated -> OTP modal -> deferred action
 *        pattern shared by AdminUsers.jsx and AdminUserTransactions.jsx (both run real
 *        suspend/unsuspend/promote/demote actions, so both need the same gate), including the
 *        mid-submit ELEVATION_REQUIRED retry case (the deferred action is just re-running the
 *        same call with the same kept reason).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useEffect, useRef, useState } from 'react'
import { decodeAccessTokenClaims } from '../api/http'

const STORAGE_KEY = 'focElevationToken'

function readToken() {
  let token
  try {
    token = sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!token) return null
  const claims = decodeAccessTokenClaims(token)
  if (!claims?.exp || claims.exp * 1000 <= Date.now()) {
    clearElevationToken()
    return null
  }
  return token
}

/** Null if there is no token, or it is missing/invalid/expired (also clears it in that case). */
export function getElevationToken() {
  return readToken()
}

export function setElevationToken(token) {
  try {
    sessionStorage.setItem(STORAGE_KEY, token)
  } catch {
    // sessionStorage unavailable (e.g. private-browsing quota): elevation just won't persist.
  }
}

export function clearElevationToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // see setElevationToken
  }
}

/** `{ 'Elevated-Token': token }` when a valid token is held, else `{}` - spread into a request's headers. */
export function elevatedTokenHeader() {
  const token = readToken()
  return token ? { 'Elevated-Token': token } : {}
}

function secondsLeftFor(token) {
  if (!token) return 0
  const claims = decodeAccessTokenClaims(token)
  if (!claims?.exp) return 0
  return Math.max(0, Math.round(claims.exp - Date.now() / 1000))
}

/** Reactive countdown for the Elevate button/timer: `isElevated` flips false at zero. */
export function useElevation() {
  const [secondsLeft, setSecondsLeft] = useState(() => secondsLeftFor(readToken()))

  useEffect(() => {
    const tick = () => setSecondsLeft(secondsLeftFor(readToken()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return { isElevated: secondsLeft > 0, secondsLeft }
}

// Shared by AdminUsers.jsx and AdminUserTransactions.jsx: both run the real suspend/unsuspend
// and promote/demote calls, so both need the same "not elevated -> OTP modal -> then run the
// deferred action" gate, and the same mid-submit retry when a PUT itself comes back
// ELEVATION_REQUIRED (the token expired between opening the reason dialog and submitting).
// Reads the token directly (not the ticked `isElevated` above) so a just-cleared token is seen
// immediately instead of up to 1s stale.
export function useElevatedActionFlow() {
  const { isElevated, secondsLeft } = useElevation()
  const [elevationModalOpen, setElevationModalOpen] = useState(false)
  const pendingRef = useRef(null)

  function withElevation(action) {
    if (getElevationToken()) {
      action()
    } else {
      pendingRef.current = action
      setElevationModalOpen(true)
    }
  }

  function openElevateModal() {
    pendingRef.current = null
    setElevationModalOpen(true)
  }

  function handleElevated() {
    setElevationModalOpen(false)
    const action = pendingRef.current
    pendingRef.current = null
    action?.()
  }

  function closeElevationModal() {
    pendingRef.current = null
    setElevationModalOpen(false)
  }

  return {
    isElevated,
    secondsLeft,
    elevationModalOpen,
    withElevation,
    openElevateModal,
    handleElevated,
    closeElevationModal,
  }
}
