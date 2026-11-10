/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-19
Scope: Added initial shared profile and requester/courier types
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
Scope: Added shared authentication session and role types
Author review: I reviewed correctness and edited the changes to fit the project
*/

export type UserRole = 'user' | 'admin' | 'admin_manager'

export type CurrentSession = {
  user_id: string
  role: UserRole
}

export type CurrentUserProfile = {
  username: string
  email: string
}

export type UserContextValue = {
  session: CurrentSession
  profile: CurrentUserProfile
  setProfile: (profile: CurrentUserProfile) => void
}
