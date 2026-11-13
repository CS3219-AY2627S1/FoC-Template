/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-19
Scope: Added shared user context and the user-context hook
Author review: I reviewed correctness and edited the changes to fit the project
*/

import { createContext, useContext } from 'react'
import type { UserContextValue } from './models'

export const UserContext = createContext<UserContextValue | undefined>(undefined)

export const useUser = () => {
  const context = useContext(UserContext)
  if (!context) throw new Error('useUser must be used within a UserProvider')
  return context
}
