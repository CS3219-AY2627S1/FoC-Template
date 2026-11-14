/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component DemoContext.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { requests as seedRequests } from '../data/requests'
import { currentUser } from '../data/users'

const DemoContext = createContext(null)

export function DemoProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [role, setRole] = useState('requester')
  const [requests, setRequests] = useState(seedRequests)
  const [loginPrompt, setLoginPrompt] = useState(null) // { action: string } | null

  // Session-only. Nothing is persisted; a refresh resets the demo.
  const setRequestStatus = useCallback((id, status) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              courierId:
                status === 'open' ? null : r.courierId || (role === 'courier' ? currentUser.id : 'u3'),
              timeline: { ...r.timeline, [status]: new Date().toISOString() },
            }
          : r,
      ),
    )
  }, [role])

  const acceptRequest = useCallback((id) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: 'accepted',
              courierId: currentUser.id,
              timeline: { ...r.timeline, accepted: new Date().toISOString() },
            }
          : r,
      ),
    )
  }, [])

  // Gated actions keep the underlying page visible behind the scrim.
  const requireLogin = useCallback(
    (action, onAllowed) => {
      if (isLoggedIn) {
        onAllowed?.()
        return true
      }
      setLoginPrompt({ action })
      return false
    },
    [isLoggedIn],
  )

  // Balance figures come straight from users.js so every screen shows the same
  // 14 available / 6 reserved / 20 total the blueprint specifies.
  const credits = useMemo(
    () => ({
      available: currentUser.creditsAvailable,
      reserved: currentUser.creditsReserved,
      total: currentUser.creditsAvailable + currentUser.creditsReserved,
    }),
    [],
  )

  const value = useMemo(
    () => ({
      isLoggedIn,
      setIsLoggedIn,
      role,
      setRole,
      requests,
      setRequests,
      setRequestStatus,
      acceptRequest,
      loginPrompt,
      setLoginPrompt,
      requireLogin,
      currentUser,
      credits,
    }),
    [isLoggedIn, role, requests, loginPrompt, requireLogin, setRequestStatus, acceptRequest, credits],
  )

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export function useDemo() {
  const ctx = useContext(DemoContext)
  if (!ctx) throw new Error('useDemo must be used inside DemoProvider')
  return ctx
}

// Screenshot mode: ?clean=1 hides the demo controls entirely.
export const isCleanMode = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('clean') === '1'
