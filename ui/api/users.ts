// AI-assisted (Claude Opus 5.5), 2026-11-12: merge with main, one deleteMe; see ui/ai-usage/usage-log.md, entry 004
// AI-assisted (Claude), reviewed and tested by Maliha
import { api, ApiError } from "./client"

export type ApiUser = {
  id: string
  username: string
  firstName: string
  lastName: string
  email: string
  roles: string[]
  createdAt: string
}

export const login = (email: string, password: string) =>
  api<{ token: string }>("/users/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })

export const register = (data: {
  firstName: string
  lastName: string
  username: string
  email: string
  password: string
  confirmRestore?: boolean
}) =>
  api<{ message: string }>("/users/register", {
    method: "POST",
    body: JSON.stringify(data),
  })

export const verifyRegister = (email: string, otp: string) =>
  api<{ user: ApiUser }>("/users/register/verify", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  })

export const requestResetPassword = () =>
  api<{ message: string }>("/users/reset-password/request", {
    method: "POST",
    body: JSON.stringify({}),
  })

export const completeResetPassword = (otp: string, newPassword: string) =>
  api<{ message: string }>("/users/reset-password/verify", {
    method: "POST",
    body: JSON.stringify({ otp, newPassword }),
  })

export const getMe = () => api<{ user: ApiUser }>("/users/me").then((r) => r.user)

export const updateMe = (profile: { firstName: string; lastName: string; username: string }) =>
  api<{ user: ApiUser }>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(profile),
  }).then((r) => r.user)

export const logout = () => api<void>("/users/logout", { method: "POST" })

// user-service refuses (409) while you have active orders or are the last
// admin, and its message says which, so it's shown as is
export const deleteMe = () =>
  api<{ message: string }>("/users/me", { method: "DELETE" }).then((r) => r.message)

export function deleteError(err: unknown) {
  if (!(err instanceof ApiError)) return "Something went wrong."
  // plain 404 with no message = user-service doesn't have DELETE /users/me yet
  if (err.status === 404 && err.message.startsWith("Request failed")) return "Account deletion isn't available yet."
  return err.message
}

// ── Admin only ──

export const listUsers = () => api<{ users: ApiUser[] }>("/users").then((r) => r.users)

export const isAdmin = (u: ApiUser) => u.roles.includes("ADMINISTRATOR")

// user-service refuses to remove the last admin (409), the message says so
export const setAdmin = (id: string, admin: boolean) =>
  api<{ user: ApiUser }>(`/users/${id}/admin`, { method: admin ? "POST" : "DELETE" })
    .then((r) => r.user)
