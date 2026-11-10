/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-19
Scope: Implemented initial shared profile state and persisted requester/courier preference
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
Scope: Added shared session state for admin access controls
Author review: I reviewed correctness and edited the changes to fit the project
*/

import { useMemo, useState, type PropsWithChildren } from 'react'
import type { CurrentSession, CurrentUserProfile, UserContextValue } from './models'
import { UserContext } from './UserContext'

type UserProviderProps = PropsWithChildren<{
  session: CurrentSession
  initialProfile: CurrentUserProfile
}>

export const UserProvider = ({ children, initialProfile, session }: UserProviderProps) => {
  const [profile, setProfile] = useState(initialProfile)
  const value = useMemo<UserContextValue>(() => ({
    session,
    profile,
    setProfile,
  }), [profile, session])

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}
