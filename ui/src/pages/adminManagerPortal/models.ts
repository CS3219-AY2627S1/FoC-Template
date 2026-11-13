/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
Scope: Added admin-management request and response types
Author review: I reviewed correctness and edited the changes to fit the project
*/

export type ManagedUserRole = 'admin' | 'user'

export type ManagedUser = {
  user_id: string
  username: string
  email: string
  role: ManagedUserRole
}

export type ListManagedUsersRequest = {
  role: ManagedUserRole
  query?: string
}

export type UpdateManagedUserRoleRequest = {
  userId: string
  role: ManagedUserRole
}
