import { useEffect, useState } from 'react'
import {
  readSession,
  sessionChangedEvent,
  sessionExpiredEvent,
} from '../auth/session'

export type ErrandRole = 'REQUESTER' | 'COURIER'

/** The header's Requester/Courier choice; re-renders when the role switch replaces the session. */
export function useSessionRole(): ErrandRole {
  const [role, setRole] = useState<ErrandRole>(currentRole)
  useEffect(() => {
    const refresh = () => setRole(currentRole())
    window.addEventListener(sessionChangedEvent, refresh)
    window.addEventListener(sessionExpiredEvent, refresh)
    return () => {
      window.removeEventListener(sessionChangedEvent, refresh)
      window.removeEventListener(sessionExpiredEvent, refresh)
    }
  }, [])
  return role
}

function currentRole(): ErrandRole {
  return readSession()?.role === 'COURIER' ? 'COURIER' : 'REQUESTER'
}

/** Each role's errand landing: Requester reviews activity, Courier browses open requests. */
export function homeFor(role: ErrandRole): string {
  return role === 'COURIER' ? '/errands/browse' : '/errands/mine'
}
